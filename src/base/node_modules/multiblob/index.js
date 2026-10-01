var cont     = require('cont')
var pull     = require('pull-stream')
var defer    = require('pull-defer')
var path     = require('path')
var clarify  = require('clarify-error')
var mkdirp   = require('mkdirp')
var rimraf   = require('rimraf')
var fs       = require('fs')
var glob     = require('pull-glob')
var paramap  = require('pull-paramap')
var Notify   = require('pull-notify')
var Live     = require('pull-live')
var Write    = require('pull-write-file')

var u = require('./util')
var createHash = u.createHash

module.exports = function Blobs (config) {
  if (!config) throw Error('multiblob expects config')

  var dir
  if('string' === typeof config)
    dir = config, config = {dir: dir}

  dir = config.dir
  var alg = config.hash = config.hash || config.alg || 'blake2s'
  var encode = config.encode || u.encode
  var decode = config.decode || u.decode
  var isHash = config.isHash || u.isHash

  function toPath (dir, string) {
    if(!string || !isHash(string)) return false
    var d = decode(string)
    var h = d.hash.toString('hex')
    return path.join(dir, d.alg, h.substring(0,2), h.substring(2))
  }

  function toHash(filename) {
    var parts = path.relative(dir, filename).split(path.sep)
    var alg = parts.shift()
    return encode(new Buffer(parts.join(''), 'hex'), alg)
  }

  var newBlob = Notify()

  var empty = u.encode(u.algs[alg]().digest(), alg)
  // MIX: I think this should be encode NOT u.encode ?!

  function isEmptyHash(hash) {
    return empty === hash
  }

  var n = 0
  var waiting = []
  var tmp = false

  function init (cb) {
    if(tmp) return cb()
    else waiting.push(cb)
  }

  var stat = u.single(fs.stat)

  var tmpdir = path.join(dir, 'tmp')

  rimraf(tmpdir, function () {
    mkdirp(tmpdir).then(function () {
      tmp = true; while(waiting.length) waiting.shift()()
    })
  })

  function toMeta(hash, stat) {
    if(!stat) return null
    return {id: hash, size: stat.size, ts: +stat.ctime}
  }

  function has (id) {
    return function (cb) {
      if(isEmptyHash(id)) return cb(null, true)
      var p = toPath(dir, id)
      if(!p) return cb(new Error('not a valid blob id:'+id))
      stat(p, function (err, stat) {
        cb(null, !!stat)
      })
    }
  }

  function size (id) {
    return function (cb) {
      if(isEmptyHash(id)) return cb(null, 0)
      var p = toPath(dir, id)
      if(!p) return cb(new Error('not a valid blob id:'+id))
      stat(p, function (err, stat) {
        cb(null, stat ? stat.size : null)
      })
    }
  }

  var meta = function (id, cb) {
    if(isEmptyHash(id)) return cb(null, {id: id, size: 0, ts: 0})
    stat(toPath(dir, id), function (err, stat) {
      cb(err, toMeta(id, stat))
    })
  }

  function createTester (test) {
    return function (ids, cb) {
      var n = !Array.isArray(ids)
      //check if any hashes are invalid.
      var invalid
      if(n ? !isHash(ids) : !ids.every(function (h) {
        if(!isHash(h)) invalid = h
        else return true
      }))
        return cb(new Error('not a valid id:'+invalid))

      cont.para(u.toArray(ids).map(test)) (function (err, ary) {
        //will give an error if any hash was invalid.
        if(err) cb(err)
        // This will only error if the hash is not present,
        // so never callback an error.
        // PS. if you have a situation where you never error
        // add a comment like this one to explain why.
        else if(n) cb(null, ary[0])
        else       cb(null, ary)
      })
      return cb
    }
  }

  function getSlice(opts) {
    var id = u.getId(opts)

    if(isEmptyHash(id)) return pull.empty()

    var stream = defer.source()
    stat(toPath(dir, id), function (err, stat) {
      if(err)
        stream.abort(clarify(err, 'stat failed'))

      else if(opts.size != null && opts.size !== stat.size)
        stream.abort(new Error('incorrect file length,'
          + ' requested:' + opts.size + ' file was:' + stat.size
          + ' for file:' + id
        ))

      else if(opts.max != null && opts.max < stat.size)
        stream.abort(new Error('incorrect file length,'
          + ' requested:' + opts.size + ' file was:' + stat.size
          + ' for file:' + id
        ))

      else
        stream.resolve(u.readFile(toPath(dir, id), {
          start: opts.start,
          end: opts.end
        }))
    })

    return stream
  }


  return {
    get: function (opts) {
      if(isHash(opts)) {
        if(isEmptyHash(opts)) return pull.empty()
        return u.readFile(toPath(dir, opts))
      }
      var id = u.getId(opts)

      if(!isHash(id))
        return pull.error(new Error(
          'multiblob.get: {id} is mandatory'
        ))

      return getSlice({id: id, size: opts.size, max: opts.max})
    },
    isEmptyHash: isEmptyHash,

    getSlice: function (opts) {
      var id = u.getId(opts)
      if(!isHash(id))
        return pull.error(new Error(
          'multiblob.getSlice: {id} is mandatory'
        ))

      if(isNaN(opts.start))
        return pull.error(new Error(
          'multiblob.getSlice: {start} must be a number'
        ))

      if(isNaN(opts.end))
        return pull.error(new Error(
          'multiblob.getSlice: {end} must be a number'
        ))

      return getSlice(opts)
    },

    size: createTester(size),

    has: createTester(has),
    meta: meta,

    add: function (id, cb) {
      if('function' === typeof id) cb = id, id = null

      if(!cb) cb = function (err) {
        if(err) throw clarify(err, 'no callback provided')
      }

      if(id && !isHash(id)) {
        //abort input stream and callback once source is aborted.
        var err = new Error(`not a valid hash: ${id}`)
        return function (read) {
          read(err, cb)
        }
      }

      var deferred = defer.sink()
      init(function () {
        var tmpfile = path.join(dir, 'tmp', Date.now() + '-' + n++)
        var hasher = createHash(alg, true)
        var size = 0

        deferred.resolve(pull(
          hasher,
          pull.map(function (data) {
            if('string' === typeof data) data = new Buffer(data, 'utf8')
            size += data.length
            return data
          }),
          Write(tmpfile, function (err) {
            if(err) return cb(clarify(err, 'could not write to tmpfile'))

            var _id = encode(hasher.digest, alg)

            if(id && id !== _id)
              return cb(new Error('actual hash:'+ _id
                + ' did not match expected id:'+id), _id)

            var p = toPath(dir, id || _id)

            mkdirp(path.dirname(p)).then(function () {
              fs.rename(tmpfile, p, function (err) {
                if(err) cb(clarify(err, 'could not move file'))
                else    newBlob({id:toHash(p), size: size, ts: Date.now()}), cb(null, _id)
              })
            })
          })
        ))
      })

      return deferred
    },

    ls: Live(function old (opts) {
      var long = (opts.size || opts.long || opts.meta)
      return pull(
        glob(path.join(dir, '*', '*', '*')),
        long ? paramap(function (filename, cb) {
          stat(filename, function (err, stat) {
            cb(err, toMeta(toHash(filename), stat))
          })
        }, 32) : pull.map(toHash)
      )
    }, function live (opts) {
      var long = (opts.size || opts.long || opts.meta)
      return long
        ? newBlob.listen()
        : pull(newBlob.listen(), pull.map(function (e) { return e.id }))
    }),

    rm: function (id, cb) {
      if(!isHash(id)) cb(new Error('not valid id:'+id))
      else              fs.unlink(toPath(dir, id), cb)
    },

    resolve: function (id) {
      if(!isHash(id)) throw new Error('not valid id:'+id)
      return toPath(dir, id)
    }
  }
}

