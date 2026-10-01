var crypto = require('crypto')

var pull = require('pull-stream')
var inactivity = require('../')
var tape = require('tape')

function rand (n) {
  return ~~(Math.pow(2, Math.random()) * n)
}

var pair = require('pull-pair')

tape('abort stream when flow reduces to 10k/s', function (t) {
  t.plan(2)

  var flow = inactivity(pair(), 200, function (err) {
    console.log("onEnd")
    t.notOk(err)
  })

  var s = 0.1, n = 0
  pull(
    pull.infinite(),
    pull.asyncMap(function (d, cb) {
      setTimeout(function () {
        cb(null, crypto.randomBytes(rand(100)).toString('hex'))
      }, n++ < 10 ? rand(10) : rand(300))
    }),
    flow,
    pull.drain(null, function (err) {
      clearInterval(int)
      t.notOk(err)
    })
  )

  var int = setInterval(function () {
    console.log(flow.rate())
  }, 100)

})
