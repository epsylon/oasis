var uint48be = require('./')
var tape = require('tape')

tape('encode', function (t) {
  t.same(uint48be.encodingLength(42), 6)
  t.same(uint48be.encode(42), Buffer.from([0, 0, 0, 0, 0, 42]))
  // according to bc
  // obase=16
  // 42424242424242
  // 2695A9E649B2
  t.same(uint48be.encode(42424242424242), Buffer.from([0x26, 0x95, 0xa9, 0xe6, 0x49, 0xb2]))
  t.same(uint48be.encode.bytes, 6)
  t.end()
})

tape('decode', function (t) {
  t.same(uint48be.decode(Buffer.from([0, 0, 0, 0, 0, 42])), 42)
  // according to bc
  // ibase=16
  // 2695A9E67047
  // 42424242434119
  t.same(uint48be.decode(Buffer.from([0x26, 0x95, 0xa9, 0xe6, 0x70, 0x47])), 42424242434119)
  t.same(uint48be.decode(Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff])), Math.pow(2, 48) - 1)
  t.same(uint48be.decode.bytes, 6)
  t.end()
})
