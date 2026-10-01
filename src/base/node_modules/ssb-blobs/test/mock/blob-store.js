const debug = require('debug')('ssb-blobs')
const pull = require('pull-stream')
const cont = require('cont')
const Notify = require('pull-notify')
const assert = require('assert')
const { hash } = require('../util')

function single (fn) {
  const waiting = {}
  return function (value, cb) {
    if (!waiting[value]) {
      waiting[value] = [cb]
      fn(value, function done (err, result) {
        const cbs = waiting[value]
        delete waiting[value]
        while (cbs.length) cbs.shift()(err, result)
      })
    } else { waiting[value].push(cb) }
  }
}

module.exports = function MockBlobStore (name, async) {
  const notify = Notify()
  const empty = hash(Buffer.alloc(0))

  const store = {}
  function add (buf, _h) {
    const h = hash(buf)
    if (_h && _h !== h) return false
    store[h] = buf
    return h
  }

  function all (fn) {
    return function (value) {
      return Array.isArray(value) ? cont.para(value.map(function (e) { return fn(e) })) : fn(value)
    }
  }

  function toAsync (fn, name) {
    return async(function (value, cb) {
      fn(value)(function (err, value) {
        async(cb, name + '-cb')(err, value)
      })
    }, name)
  }

  return {
    store: store,
    get: function (blobId) {
      const max = blobId.max
      blobId = blobId.key || blobId
      if (blobId === empty) return pull.empty()

      if (store[blobId] && max && store[blobId].length > max) {
        return pull(
          pull.error(new Error('bigger than max:' + blobId)),
          async.through('get-error')
        )
      }
      if (!store[blobId]) {
        return pull(
          pull.error(new Error('no blob:' + blobId)),
          async.through('get-error')
        )
      }
      return pull(
        pull.values([store[blobId]]),
        async.through('get')
      )
    },
    isEmptyHash: function (h) {
      return h === empty
    },
    has: single(toAsync(all(cont(function (blobId, cb) {
      if (blobId === empty) return cb(null, true)

      cb(null, !!store[blobId])
    })), 'has')),
    rm: single(toAsync(all(cont(function (blobId, cb) {
      delete store[blobId]
      cb(null)
    })), 'rm')),
    size: single(toAsync(all(cont(function (blobId, cb) {
      if (blobId === empty) return cb(null, 0)
      cb(null, store[blobId] ? store[blobId].length : null)
    })), 'size')),
    ls: function (opts) {
      // don't implement all the options, just the ones needed by ssb-blobs
      assert.equal(opts.old, false, 'must have old')
      // used internally.
      if (opts.meta) return notify.listen()
      // used as blobs.changes (legacy api)
      else {
        return pull(
          notify.listen(),
          pull.map(function (e) { return e.id })
        )
      }
    },
    add: function (_hash, cb) {
      if (typeof _hash === 'function') {
        cb = _hash
        _hash = null
      }
      if (!cb) cb = (err) => { if (err) throw err }

      return pull(
        async.through('add'),
        pull.collect(async(function (err, data) {
          if (err) return cb(err)
          data = Buffer.concat(data)
          const h = add(data, _hash)
          debug('..ADDED', name, h)
          if (!h) cb(new Error('wrong hash'))
          else {
            notify({ id: h, size: data.length, ts: Date.now() })
            cb(null, h)
          }
        }, 'add-cb'))
      )
    }
  }
}
