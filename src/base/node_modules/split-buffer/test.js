

var tape = require('tape')

var split = require('./')

var M = 1024*1024
var bytes = require('crypto').randomBytes(M)

tape('split into equal length sections', function (t) {

  var ary = split(bytes, 1024)

  t.equal(ary.length, 1024)
  t.deepEqual(Buffer.concat(ary), bytes)

  t.end()

})

tape('split into equal lengths plus remainder', function (t) {

  var divisor = 72347

  var ary = split(bytes, divisor)
  t.equal(ary.length, ~~(M/divisor) + 1)
  t.equal(ary[0].length, divisor)
  t.equal(ary[ary.length - 1].length, M%divisor)

  t.deepEqual(Buffer.concat(ary), bytes)
  t.end()

})

tape('input is already under max', function (t) {

  var bytes = require('crypto').randomBytes(256)
  var out = split(bytes, 256)
  t.deepEqual(out, [bytes])
  var out = split(bytes, 257)
  t.deepEqual(out, [bytes])

  t.end()
})

tape('split errors when you give it zero', function (t) {
  var bytes = require('crypto').randomBytes(256)
  t.throws(function () {
    var out = split(bytes, 0)
  })
  t.end()
})
