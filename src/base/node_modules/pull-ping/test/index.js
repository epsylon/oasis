

var tape = require('tape')
var pull = require('pull-stream')

var pingpong = require('../')

function delay (time) {
  return pull.asyncMap(function (d, cb) {
    setTimeout(function () {
      cb(null, d)
    }, (time/2) + Math.random() * (time/2))
  })

}

tape('symmetrical pingpong', function (t) {
  var server = pingpong({timeout: 20})
  var client = pingpong({timeout: 20, serve: true})

  t.ok(server.rtt)
  t.ok(server.skew)

  t.equal(server.rtt.mean, 0)
  t.equal(server.skew.mean, 0)

  pull(
    client,
    delay(10),
    server,
    delay(10),
    client
  )

  setTimeout(function () {
    client.sink.abort(function (err) {
      console.log(client.rtt.mean)
      console.log(server.rtt.mean)
      console.log(client.skew.mean)
      console.log(server.skew.mean)
      t.ok(client.rtt.mean > 0)
      t.ok(server.rtt.mean > 0)
      t.end()
    })
  }, 1000)


})






