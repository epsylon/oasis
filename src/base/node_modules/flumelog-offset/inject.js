'use strict'
var Obv = require('obv')
var Append = require('append-batch')
var createStreamCreator = require('pull-cursor')
var Cache = require('hashlru')
var Looper = require('pull-looper')
var pull = require('pull-stream')
var filter = require('pull-stream/throughs/filter')

module.exports = function (blocks, frame, codec, file, cache) {
  var since = Obv()
  cache = cache || Cache(256)

  var append = Append(function (batch, cb) {
    since.once(function () { // wait for file to load before appending...
      batch = batch.map(codec.encode).map(function (e) {
        return Buffer.isBuffer(e) ? e : Buffer.from(e)
      })
      var framed = frame.frame(batch, blocks.offset.value)
      var _since = frame.frame.offset
      blocks.append(framed, function (err, offset) {
        if(err) return cb(err)
        //else, get offset of last item.
        since.set(_since)
        cb(null, since.value)
      })
    })
  })

  var isDeleted = (b) => Buffer.isBuffer(b) && b.every(x => x === 0)
  var isNotDeleted = (b) => isDeleted(b) === false

  function getMeta (offset, useCache, cb) {
    if (useCache) {
      var data = cache.get(offset)
      if (data) {
        cb(null, data.value, data.prev, data.next)
        return
      }
    }

    frame.getMeta(offset, function (err, value, prev, next) {
      if(err) return cb(err)
      if (isDeleted(value)) return cb(null, value, prev, next) // skip decode

      var data = {
        value: codec.decode(codec.buffer ? value : value.toString()),
        prev: prev,
        next: next
      }

      if (useCache)
        cache.set(offset, data)
      cb(null, data.value, data.prev, data.next)
    })
  }

  var createStream = createStreamCreator(since, getMeta)

  frame.restore(function (err, offset) {
    if(err) throw err
    since.set(offset)
  })

  return {
    filename: file,
    since: since,
    stream: function (opts) {
      return pull(
        Looper(createStream(opts)),
        filter(item => {
          if (opts && opts.seqs === false) {
            return isNotDeleted(item)
          } else {
            return isNotDeleted(item.value)
          }
        })
      )
    },

    //if value is an array of buffers, then treat that as a batch.
    append: append,

    get: function (offset, cb) {
      frame.getMeta(offset, function (err, value) {
        if (err) return cb(err)
        if (isDeleted(value)) {
          const err = new Error('item has been deleted')
          err.code = 'flumelog:deleted'
          return cb(err, -1)
        }

        cb(null, codec.decode(value))
      })
    },
    /**
     * Overwrite items from the log with null bytes, which are filtered out by
     * `get()` and `stream()` methods, effectively deleting the database items.
     *
     * @param {(number|number[])} offsets - item offset(s) to be deleted
     * @param {function} cb - the callback that returns operation errors, if any
     */
    del: (offsets, cb) => {
      if (Array.isArray(offsets) === false) {
        // The `seqs` argument may be a single value or an array.
        // To minimize complexity, this ensures `seqs` is always an array.
        offsets = [ offsets ]
      }

      Promise.all(offsets.map(offset =>
        new Promise((resolve, reject) => {
          // Simple callback handler for promises.
          const promiseCb = (err) => {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          }

          cache.remove(offset)
          frame.overwrite(offset, promiseCb)
        })
      )).catch((err) => cb(err))
      .then(() => cb(null))
    },
    methods: {
      del: 'async'
    }
  }
}





