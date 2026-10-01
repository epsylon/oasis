
//var AtomicFile = require('atomic-file')

//I was obviously thinking about browser stuff here
//although this looks quite unfinished

if(false && AtomicFile && !process.env.FV_REDUCE_LS) module.exports = AtomicFile
else module.exports = function (key) {
  return {
    get: function (cb) {
      setTimeout(function () {
        cb(null, localStorage[key])
      })
    },
    set: function (value, cb) {
      setTimeout(function () {
        try {
          localStorage[key] = JSON.stringify(value)
        } catch (err) {
          return cb(err)
        }
        cb()
      })
    }
  }
}

