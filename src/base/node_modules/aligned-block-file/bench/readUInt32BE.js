var init = require('./init')
var looper = require('looper')

module.exports = function (blocks, cb) {
  init(blocks, 100, function (err) {
    if(err) throw err

    var start = Date.now()
    var c = 0
    var next = looper(function () {
      var seconds = (Date.now() - start)/1000
      if(seconds > 1)
        return cb(null, c / seconds, c, seconds)
      var index = Math.min(Math.floor(Math.random()*blocks.size()), blocks.size() - 4)
      blocks.readUInt32BE(index, function (err, n) {
        if(err) return cb(err)
        c++
        next()
      })

    })
    console.log('start loop')
    next()
  })
}

if(!module.parent) {
  var blocks = require('../')('/tmp/bench-abf'+Date.now(), 1024, 'a+')
  module.exports(blocks, function (err, ps, ops, seconds) {
    console.log(err, ps, ops, seconds)
  })
}




