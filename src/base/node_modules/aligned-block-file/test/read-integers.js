var tape = require('tape')
var Blocks = require('../blocks')

function Cache () {
  var c = []
  return {
    get: function (key) { return c[key] },
    set: function (key, value) { c[key] = value }
  }
}

tape('readUInt32BE', function (t) {
  var cache = Cache()
  cache.set(0, new Buffer.from('00000002', 'hex'))
  cache.set(1, new Buffer.from('01000000', 'hex'))
  cache.set(2, new Buffer.from('ffffffff', 'hex'))
  cache.set(3, new Buffer.from('aaaaffff', 'hex'))
  cache.set(4, new Buffer.from('ffffaaaa', 'hex'))
  var blocks = Blocks(null, 4, cache)

  t.plan(4)
  test(0, 2) // aligned
  test(1, 513) //unaligned
  test(8, Math.pow(2,32)-1) // maxint
  test(14, Math.pow(2,32)-1) // maxint, unaligned

  function test(offset, expected) {
    blocks.readUInt32BE(offset, function (err, n) {
      if (err) throw err
      t.equal(n, expected)
    })
  }
})

tape('readUInt48BE', function (t) {
  var cache = Cache()
  cache.set(0, new Buffer.from('000000000002', 'hex'))
  cache.set(1, new Buffer.from('010000000000', 'hex'))
  cache.set(2, new Buffer.from('ffffffffffff', 'hex'))
  cache.set(3, new Buffer.from('aaaaaaffffff', 'hex'))
  cache.set(4, new Buffer.from('ffffffaaaaaa', 'hex'))
  var blocks = Blocks(null, 6, cache)

  t.plan(4)
  test(0, 2) // aligned
  test(1, 513) //unaligned
  test(12, Math.pow(2,48)-1) // maxint
  test(21, Math.pow(2,48)-1) // maxint, unaligned

  function test(offset, expected) {
    blocks.readUInt48BE(offset, function (err, n) {
      if (err) throw err
      t.equal(n, expected)
    })
  }
})

tape('readUInt64BE', function (t) {
  var cache = Cache()
  cache.set(0, new Buffer.from('0000000000000002', 'hex'))
  cache.set(1, new Buffer.from('0100000000000000', 'hex'))
  cache.set(2, new Buffer.from('001fffffffffffff', 'hex'))
  cache.set(3, new Buffer.from('aaaaaaaa001fffff', 'hex'))
  cache.set(4, new Buffer.from('ffffffffaaaaaaaa', 'hex'))
  var blocks = Blocks(null, 8, cache)

  t.plan(5)
  test(0, 2) // aligned
  test(1, 513) //unaligned
  test(16, Math.pow(2,53)-1) // maxint
  test(28, Math.pow(2,53)-1) // maxint, unaligned
  test(29, NaN, true) // overflow!

  function test(offset, expected, expectError) {
    blocks.readUInt64BE(offset, function (err, n) {
      if (err && !expectError) throw err
      if (!err && expectError) throw new Error('Expected error dir not occur')
      if (!err)
        t.equal(n, expected)
      else
        t.equal(isNaN(n), true)
    })
  }
})
