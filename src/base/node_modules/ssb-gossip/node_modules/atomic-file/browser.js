module.exports = function (file, suffix, _codec) {
  var codec = _codec || require('./codec/json')
  return {
    set: function (v, cb) {
      console.log('set', file, v)
      localStorage[file] = codec.encode(v)
      cb()
    },
    get: function (cb) {
      var value
      try { value = codec.decode(localStorage[file]) }
      catch (err) { return cb(err) }
      cb(null, value)
    }
  }

}



