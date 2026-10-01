/*
<length><data><length>

*/
module.exports = function (blocks, codec) {

  function frame (data, _offset) {
    var length = data.reduce(function (total, value) { return total + value.length }, 0)
    var b = Buffer.alloc(length + data.length * 8)
    var offset = 0
    for(var i = 0; i < data.length; i++) {
      var buf = data[i]
      //mutate the items
      //var buf = item.value
      b.writeUInt32BE(buf.length, 0 + offset) //start
      b.writeUInt32BE(buf.length, 4+buf.length + offset) //end
      buf.copy(b, 4 + offset, 0, buf.length)
      //remember the offset of the _last_ item
      //this is for framings starting at the first byte.
      frame.offset = _offset + offset
      offset += buf.length + 8
    }

    return b
  }

  function getMeta (offset, cb) {
    //special case for first value
    if(offset === 0)
      blocks.readUInt32BE(0, function (err, length) {
        if(err) return cb(err)
        blocks.read(4, 4+length, function (err, value) {
          cb(err, value, -1, 4+length+4)
        })
      })
    else
      blocks.readUInt32BE(offset, function (err, len) {
        if(err) return cb(err)

        //read the length of the previous item.
        //unless this falls right on the overlap between
        //two blocks, this will already be in the cache,
        //so will be just a mem read.
        blocks.readUInt32BE(offset - 4, function (err, prev_len) {
          if(err) return cb(err)
          blocks.read(offset+4, offset+4+len, function (err, value) {
            cb(err, value, offset-(4+prev_len+4), offset+(4+len+4))
          })
        })
      })

  }

  //restore the previous positon, used to set the first offset.
  function restore (cb) {
    //basic doesn't have a good way to do this,
    //except check the latest item, and error if it's broke
    //though could recopy the entire log then mv it over...
    blocks.offset.once(function (offset) {
      if(offset === 0) return cb(null, -1)

      blocks.readUInt32BE(offset - 4, function (err, len) {
        var _offset = offset - (4+len+4)
        getMeta(_offset, function (err, value) {
          if(err) return cb(err)
          try {
            codec.decode(value)
          } catch (err) {
            return cb(err)
          }
          cb(null, _offset)
        })
      })
    })

  }

  return {
    frame: frame,
    getMeta: getMeta,
    restore: restore
  }
}

