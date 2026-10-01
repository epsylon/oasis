var tape = require('tape')

var Atomic = require('../buffer')

var filename = '/tmp/test_atomic_file'+Date.now()+'.buffer'
var atomic = Atomic(filename, '~')

var bytes = require('crypto').randomBytes(1024)

tape('test, no file', function (t) {

  atomic.get(function (err, value) {
    t.ok(err)
    t.notOk(value)
    atomic.set(bytes, function (err) {
      if(err) throw err
      atomic.get(function (err, value) {
        if(err) throw err
        t.deepEqual(value, bytes)
        t.ok(Buffer.isBuffer(value))
        console.log(value)
        t.end()
      })
    })
  })

})


tape('reload', function (t) {
  var atomic = Atomic(filename, '~')
  atomic.get(function (err, value) {
    if(err) throw err
    t.deepEqual(value, bytes)
    t.ok(Buffer.isBuffer(value))
    console.log(value)
    t.end()
  })

})
