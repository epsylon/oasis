var test = require('tape')
var random = require('../')('testing-' + Math.random(), { size: 5 })

test('simple', function (t) {
  t.plan(6)
  var cool = random('cool.txt', { size: 5 })
  t.equal(cool.name, 'cool.txt')
  cool.write(100, new Buffer('GREETINGS'), function (err) {
    t.ifError(err)
    cool.read(100, 9, function (err, buf) {
      t.ifError(err)
      t.equal(buf.toString(), 'GREETINGS')
    })
    cool.read(104, 3, function (err, buf) {
      t.ifError(err)
      t.equal(buf.toString(), 'TIN')
    })
  })
})
