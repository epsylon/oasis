var Source = require('./')
var Sink = require('./sink')

function Set () {
  var err, value, cb
  return {
    set: function (_err, _value) {
      if(cb) cb(_err, _value)
      else err = _err, value = _value
    },
    get: function (_cb) {
      if(err || value) _cb(err, value)
      else cb = _cb
    }
  }
}

module.exports = function (continuable) {
  var set = Set()

  return {
    sink: Sink(function (cb) {
      continuable(function (err, stream) {
        if(err) {
          cb(err)
          set.set(err)
        }
        else {
          cb(null, stream.sink)
          set.set(null, stream.source)
        }
      })
    }),
    source: Source(set.get)
  }
}










