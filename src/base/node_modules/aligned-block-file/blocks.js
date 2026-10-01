var fs = require('fs')
var uint48be = require('uint48be')
var int53 = require('int53')

/*
  Represent a file, as a table of buffers.
  copy from a range in the file into a buffer
  (may cross buffer boundries)

  Also, write into the file at any point.
  always update the cached buffer after the write.
  (always read a buffer before write, except for appending a new buffer)
*/

function assertInteger (a) {
  if(!Number.isInteger(a))
    throw new Error('expected positive integer, was:'+JSON.stringify(a))
}

var Cache = require('hashlru')

module.exports = function (file, block_size, cache) {
  var cbs = [], br, writing = 0
  cache = cache || Cache(1000)

  function get(i, cb) {
    var c = cache.get(i)
    if(Buffer.isBuffer(c))
      cb(null, c, block_size)
    else if(Array.isArray(cbs[i]))
      cbs[i].push(cb)
    else {
      cbs[i] = [cb]
      file.get(i, function (err, buf, bytes_read) {
        var cb = cbs[i]
        cbs[i] = null
        if(!err) cache.set(i, buf)
        for (var j = 0; j < cb.length; ++j)
          cb[j](err, buf, bytes_read)
      })
    }
  }

  function read(start, end, cb) {
    assertInteger(start);assertInteger(end)
    //check if start & end are part of the same buffer
    var i = Math.floor(start/block_size)
    if(file && end > file.offset.value)
      return cb(new Error('past end:'+start+'-'+end+' < '+file.offset.value), null, 0)
    var bufs = []
    ;(function next (i) {
      var block_start = i*block_size
      get(i, function (err, block, bytes_read) {
        if(err) return cb(err)
        //this is not right.
        if(bytes_read === 0) return cb(new Error('past end'), null, bytes_read)

        var read_start = start - block_start
        var read_end = Math.min(end - block_start, block_size)
        bufs.push(block.slice(read_start, read_end))
        start += (read_end - read_start)

        if (start < end) {
          next(i+1)
        } else {
          var buffer = bufs.length == 1 ? bufs[0] : Buffer.concat(bufs)
          if (!buffer.length)
            return cb(new Error('read an empty buffer at:'+start + ' to ' + end + '\n'+
              JSON.stringify({
                start: start, end: end, i:i,
                bytes_read: bytes_read,
                bufs: bufs
              }))
            )
          cb(null, buffer, bytes_read)
        }
      })
    })(i)

  }

  //start by reading the end of the last block.
  //this must always be kept in memory.

  function readInteger(width, reader) {
    return function (start, cb) {
      var i = Math.floor(start/block_size)
      var _i = start%block_size

      //if the UInt32BE aligns with in a block
      //read directly and it's 3x faster.
      if(_i < block_size - width)
        get(i, function (err, block) {
          if(err) return cb(err)
          var value = reader(block, start%block_size)
          cb(null, value)
        })
      //but handle overlapping reads this easier way
      //instead of messing around with bitwise ops
      else
        read(start, start+width, function (err, buf, bytes_read) {
          if(err) return cb(err)
          var value = reader(buf, 0);
          cb(isNaN(value) ? new Error('Number is too large') : null, value)
        })
    }
  }

  return br = {
    read: read,
    readUInt32BE: readInteger(4, function(b, offset) {
      return b.readUInt32BE(offset)
    }),
    readUInt48BE: readInteger(6, function(b, offset) {
      return uint48be.decode(b, offset)
    }),
    readUInt64BE: readInteger(8, function(b, offset) {
      // int53.readUInt64BE will throw if number is too large
      try {
        return int53.readUInt64BE(b, offset)
      } catch(err) {
        return NaN;
      }
    }),
    size: file && file.size,
    offset: file && file.offset,
    //starting to realize: what I really need is just a lib for
    //relative copies between two arrays of buffers, with a given offset.
    append: function (buf, cb) {
      //write to the end of the file.
      //if successful, copy into cache.
      if(writing++) throw new Error('already appending to this file')
      file.offset.once(function (_offset) {

        var start = _offset
        var b_start = 0
        var i = Math.floor(start/block_size)
        if(i*block_size < _offset) //usually true, unless file length is multiple of block_size
          get(i, function (err) { //this will add the last block to the cache.
            if(err) cb(explain(err, 'precache before append failed'))
            else next()
          })
        else next()

        function next () {
          while(b_start < buf.length) { //start < _offset+buf.length) {
            var block_start = i*block_size
            var b = cache.get(i)
            if(null == b) {
              b = Buffer.alloc(block_size)
              cache.set(i, b)
            }
            //including if set in above if...
            if(Buffer.isBuffer(b)) {
                var len = Math.min(block_size - (start - block_start), block_size)
                buf.copy(b, start - block_start, b_start, b_start + len)
                start += len
                b_start += len
            }
            else if(Array.isArray(cbs[i]))
              throw new Error('should never happen: new block should be initialized, before a read ever happens')
            else {
              start += block_size
            }

            i++
          }

          file.append(buf, function (err, offset) {
            if(err) return cb(err)
            writing = 0
            cb(null, offset)
          })
        }
      })
    },
    /**
     * Writes a buffer directly to a position in the file.
     * This wraps `file.write()` and removes the block cache after the file
     * write finishes to avoid having the item re-cached during the write.
     *
     * @param {buffer} buf - the data to write to the file
     * @param {number} pos - position in the file to write the buffer
     * @param {function} cb - callback that returns any error as an argument
     */
    write: (buf, pos, cb) => {
      const i = Math.floor(pos/block_size)
      file.write(buf, pos, (err) => {
        cache.remove(i)
        cb(err)
      })
    },
    //we arn't specifically clearing the buffers,
    //but they should get updated anyway.
    truncate: file ? file.truncate : function (len, cb) {
      cb()
    }
  }
}

