var fs = require('fs')

module.exports = function (filename, suffix, isBuffer) {
  suffix = suffix || '~'
  return {
    get: function (cb) {
      fs.readFile(filename, isBuffer ? null : 'utf8', cb)
    },
    set: function (value, cb) {
      fs.writeFile(filename+suffix, value, function (err) {
        if(err) cb(err)
        else fs.rename(filename+suffix, filename, function (err) {
          if(err) cb(err)
          else cb(null, value)
        })
      })
    },
    destroy: function (cb) {
      fs.unlink(filename, function (err) {
        if(err) return cb(err)
        else cb()
      })
    }
  }
}



