var tape = require('tape')
var inc = require('../')

function B (int, len) {
  var b = new Buffer(len || 4)
  b.writeUInt32BE(int, b.length - 4)
  return b
}

function I (buf) {
  return buf.readUInt32BE(buf.length - 4)
}

tape('increment a buffer', function (t) {

  t.deepEqual(inc(B(0)), B(1))
  t.end()

})

tape('increment a buffer', function (t) {

  t.deepEqual(inc(B(255)), B(256))
  t.end()

})


tape('increment 1,2,3 bytes', function (t) {
  t.deepEqual(inc(new Buffer([255])), new Buffer([0]))
  t.deepEqual(inc(new Buffer([255, 255])), new Buffer([0, 0]))
  t.deepEqual(inc(new Buffer([0, 255])), new Buffer([1, 0]))
  t.deepEqual(inc(new Buffer([0, 255, 255])), new Buffer([1, 0, 0]))
  t.deepEqual(inc(new Buffer([255, 0, 255])), new Buffer([255, 1, 0]))
  t.deepEqual(inc(new Buffer([255, 255, 255])), new Buffer([0, 0, 0]))
  t.end()

})

tape('increment a buffer, big number', function (t) {

  t.deepEqual(inc(B(234987234)), B(234987235))
  t.end()

})

tape('increment a buffer, wrap around', function (t) {

  var max = new Buffer(4)
  max.fill(255)
  t.deepEqual(inc(max), B(0))
  t.end()

})


