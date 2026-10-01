var Blake2s = require('blake2s')
var createHash = require('crypto').createHash
var pull = require('pull-stream')
var Read = require('pull-file')
var Catch = require('pull-catch')

var isBuffer = Buffer.isBuffer

var algs = {
  blake2s: function () { return new Blake2s() },
  sha256: function () { return createHash('sha256') }
}

exports.encode = function (buf, alg) {
  if(!isBuffer(buf)) throw new Error('hash should be a buffer, was:'+buf)
  return buf.toString('base64')+'.'+alg
}

exports.decode = function (str) {
  var i = str.indexOf('.')
  var alg = str.substring(i+1)
  return {hash: new Buffer(str.substring(0, i), 'base64'), alg: alg}
}

exports.createHash = function (alg, noCompat) {
  alg = alg || 'blake2s'
  var hash = algs[alg]()

  var hasher = pull.through(function (data) {
    data = isBuffer(data) ? data : new Buffer(data)
    hasher.size += data.length
    hash.update(data)
  }, function () {
    return hasher.digest = noCompat === true ? hash.digest() : hash.digest('base64') + '.' + alg
//    hasher.digest = digest
  })

  hasher.size = 0
  return hasher
}

function isString (s) {
  return 'string' === typeof s
}

exports.isHash = function (data) {
  return isString(data) && /^[A-Za-z0-9\/+]{43}=\.(?:blake2s|sha256)$/.test(data)
}

exports.algs = algs


/**
 * Wraps the `pull-file` function module with two changes: errors are redacted,
 * to avoid leaking private information about the file system.
 *
 * @param {...object} args - arguments to pass to `pull-file`
 *
 * @return {function} pull-stream source, to be consumed by a through or sink
 */

exports.readFile = function readFile (...args) {

  return pull(
    Read(...args),
    Catch(err => {
      //redact stack trace
      err.message = 'could not get blob'

      return false // pass along error
    })
  )
};

exports.toArray = function (h) {
  return Array.isArray(h) ? h : [h]
}

exports.single = function (fn) {
  var waiting = {}
  function async (key, cb) {
    if(!waiting[key]) {
      waiting[key] = [cb]
      var cbs = waiting[key]
      fn(key, function done (err, result) {
        if(cbs.length)
        delete waiting[key]
        while(cbs.length) cbs.shift()(err, result)
      })
    }
    else
      waiting[key].push(cb)
  }

  //dump all the things that have been done already,
  //when something has been added?
  async.done = function (key, err, value) {
    if(!waiting[key]) return
    var cbs = waiting[key]
    delete waiting[key]
    while(cbs.length) cbs.shift()(err, result)
  }

  return async
}

exports.getId = (opts) => opts.id || opts.key || opts.hash
