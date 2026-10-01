'use strict'
var fs = require('fs')

function isFunction (f) {
  return 'function' === typeof f
}

function onceAtATime (fn, queue) {
  queue = queue || []
  return function () {
    var args = [].slice.call(arguments)
    if(queue.length)
      return queue.push(function () {
        fn.apply(null, args)
      })
    //should be a the callback...
    var cb = args.pop()
    if(!isFunction(cb)) throw new Error('cb must be provided')
    queue.push(cb)
    args.push(function done (err) {
      var _queue = queue
      queue = []
      while(_queue.length) _queue.shift()(err)
    })

    fn.apply(null, args)
  }
}


module.exports = function (filename, suffix, _codec) {
  var codec = _codec || require('./codec/json')
  suffix = suffix || '~'
  var queue = []
  var value

  return {
    get: function (cb) {
      if(value) return cb(null, value)
      else fs.readFile(filename, codec.buffer ? null : 'utf8', function (err, _value) {
        if(err) return cb(err)
        try {
          value = codec.decode(_value)
        } catch (err) {
          return cb(err)
        }
        cb(null, value)
      })
    },
    //only allow one update at a time.
    set: onceAtATime(function put (_value, cb) {
      fs.writeFile(filename+suffix, codec.encode(_value), function (err) {
        if(err) return cb(err)
        fs.rename(filename+suffix, filename, function (err) {
          if(err) cb(err)
          else cb(null, value = _value)
        })
      })
    }, queue),
    destroy: onceAtATime(function destroy (cb) {
      fs.unlink(filename, function (err) {
        if(err) return cb(err)
        else cb(value=null)
      })
    }, queue)
  }
}

