var Looper = require('looper')
module.exports = function (n) {
  if(!Number.isInteger(n))
    throw new Error('Skip:N must be number')

  return function (read) {
    return function (abort, cb) {
      if(n <= 0) return read(abort, cb)

      var next = Looper(function () {
        read(abort, function (end, data) {
          if(end) return cb(end)
          else if(n-->0) next()
          else cb(null, data)
        })
      })

      next()
    }
  }
}


