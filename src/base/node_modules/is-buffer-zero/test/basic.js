const tape = require('tape')
const isZero = require('../')

function blank(n) {
  return Buffer.alloc(n)
}

function nonBlank(n) {
  const b = Buffer.alloc(n)
  b[b.length - 1] = 1
  return b
}

tape('check blank buffer', function (t) {
  t.ok(isZero(blank(100)))
  t.ok(isZero(blank(1024)))
  t.ok(isZero(blank(4096)))
  t.ok(isZero(blank(4097)))
  t.ok(isZero(blank(40960)))
  t.end()
})

tape('check non blank', function (t) {
  t.notOk(isZero(nonBlank(100)))
  t.notOk(isZero(nonBlank(1024)))
  t.notOk(isZero(nonBlank(4096)))
  t.notOk(isZero(nonBlank(4097)))
  t.notOk(isZero(nonBlank(40960)))
  t.end()
})
