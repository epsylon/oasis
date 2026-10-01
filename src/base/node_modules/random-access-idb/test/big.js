var test = require('tape')
var random = require('../')('testing-' + Math.random(), { size: 1024 })

test('big', function (t) {
  t.plan(6)
  var cool = random('cool.txt')
  cool.write(32, new Buffer('GREETINGS'), function (err) {
    t.ifError(err)
    cool.write(32+3,new Buffer('AT SCOTT'), function (err) {
      t.ifError(err)
      cool.read(32, 9, function (err, buf) {
        t.ifError(err)
        t.equal(buf.toString(), 'GREAT SCO')
      })
      cool.read(32+6, 5, function (err, buf) {
        t.ifError(err)
        t.equal(buf.toString(), 'SCOTT')
      })
    })
  })
})
