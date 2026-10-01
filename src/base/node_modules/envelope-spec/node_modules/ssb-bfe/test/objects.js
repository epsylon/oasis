const tape = require('tape')
const bfe = require('../')

tape('objects (encode/decode)', function (t) {
  const obj = {
    a: 'carla', // a generic type
    b: 1,
    c: 0,
    d: undefined,
  }
  const encoded = bfe.encode(obj)

  t.equal(
    encoded.a.slice(0, 2).toString('hex'),
    '0600',
    'object string values encoded'
  )
  t.equal(encoded.b, 1, 'numbers in object not encoded')
  t.equal(encoded.c, 0, 'falsy numbers as an object field')
  t.false('d' in encoded, 'fields containing "undefined" are dropped')

  delete obj.d // cannot bring back "undefined" !
  t.deepEquals(bfe.decode(encoded), obj, 'can decode')
  t.end()
})

tape('objects - arrays! (encode/decode)', function (t) {
  const arr = ['alice', undefined, 100]

  const encoded = bfe.encode(arr)
  t.equals(encoded.length, 3, 'length remains the same')
  t.equals(
    encoded[0].slice(0, 2).toString('hex'),
    '0600',
    'string is mapped to BFE 6,0'
  )
  t.equals(
    encoded[1].slice(0, 2).toString('hex'),
    '0602',
    'undefined is mapped to BFE 6, 2 (null)'
  )
  t.equals(encoded[2], 100, 'number is untouched')

  const decoded = bfe.decode(encoded)
  t.deepEquals(
    decoded,
    ['alice', null, 100],
    'decode works (but undefined is not recovered)'
  )
  t.end()
})
