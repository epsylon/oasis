var looper = require('looper')

function init(blocks, n, cb) {
  ;(function next (i) {
    if(i == n) return cb(null, blocks)
    blocks.append(Buffer.alloc(10), function (err) {
      if(err) cb(err)
      else next(i + 1)
    })
  })(0)
}

module.exports = function (blocks, cb) {
  init(blocks, 100, function (err) {
    if(err) throw err

    var start = Date.now()
    var c = 0
    var next = looper(function () {
      var seconds = (Date.now() - start)/1000
      if(seconds > 1)
        return cb(null, c / seconds, c, seconds)
      var index = Math.min(Math.floor(Math.random()*blocks.size()), blocks.size() - 8)
      blocks.readUInt64BE(index, function (err, n) {
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




