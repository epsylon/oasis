var test = require('tape')
var random = require('../')('testing-' + Math.random(), { size: 5 })
var bfrom = require('buffer-from')

test('multiple files cool and good', function (t) {
  t.plan(14)
  var cool = random('cool.txt')
  var and = random('and.txt')
  var good = random('good.txt')
  cool.write(100, bfrom('GREETINGS'), function (err) {
    t.ifError(err)
    cool.read(100, 9, function (err, buf) {
      t.ifError(err)
      t.equal(buf.toString(), 'GREETINGS')
    })
    cool.read(104, 3, function (err, buf) {
      t.ifError(err)
      t.equal(buf.toString(), 'TIN')
    })
    and.write(106, bfrom('ORANG'), function (err) {
      t.ifError(err)
      and.read(107, 3, function (err, buf) {
        t.ifError(err)
        t.equal(buf.toString(), 'RAN')
        good.write(90, bfrom('DO YOU EVER JUST... TEAPOT'), function (err) {
          t.ifError(err)
          good.read(110, 6, function (err, buf) {
            t.ifError(err)
            t.equal(buf.toString(), 'TEAPOT')
            good.read(86, 10, function (err, buf) {
              t.ifError(err)
              t.equal(buf.toString(), '\0\0\0\0DO YOU')
              good.read(110, 10, function (err, buf) {
                t.ok(err, "should error when reading past end of file")
              })
            })
          })
        })
      })
    })
  })
})
