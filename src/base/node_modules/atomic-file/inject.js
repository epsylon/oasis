'use strict'
var mutexify = require('mutexify')

module.exports = function (store, _codec) {
  var codec = _codec || require('flumecodec/json')
  var lock = mutexify()
  var value

  return {
    get: function (cb) {
      if(value) return cb(null, value)
      else store.get(function (err, _value) {
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
    set: function (_value, cb) {
      lock(function (unlock) {
        store.set(codec.encode(_value), function (err) {
          if(!err) value=_value
          unlock(cb, err, _value)
        })
      })
    },
    destroy: function (cb) {
      lock(function (unlock) {
        store.destroy(function (err) {
          value=null
          unlock(cb, err)
        })
      })
    }
  }
}

