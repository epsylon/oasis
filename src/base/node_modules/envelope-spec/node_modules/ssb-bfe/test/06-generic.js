const tape = require('tape')
const bfe = require('../')

tape('06 generic type', function (t) {
  const values = [
    true,
    false,
    null,
    'this is a string',
    '@mention',
    '%done',
    '&co',
    Buffer.from([3, 2, 1]),

    /* not covered by BFE */
    100,
    0,
  ]

  const encoded = bfe.encode(values)

  t.deepEqual(encoded[0], Buffer.from([6, 1, 1]), 'true')
  t.deepEqual(encoded[1], Buffer.from([6, 1, 0]), 'false')
  t.deepEqual(encoded[2], Buffer.from([6, 2]), 'null')
  t.deepEqual(encoded[3].slice(0, 2), Buffer.from([6, 0]), 'string')
  t.deepEqual(encoded[4].slice(0, 2), Buffer.from([6, 0]), '@string')
  t.deepEqual(encoded[5].slice(0, 2), Buffer.from([6, 0]), '%string')
  t.deepEqual(encoded[6].slice(0, 2), Buffer.from([6, 0]), '&string')
  t.deepEqual(encoded[7].slice(0, 2), Buffer.from([6, 3]), 'buffer')

  /* not covered by BFE */
  t.equal(encoded[8], 100, 'numbers not encoded')
  t.equal(encoded[9], 0, 'falsy number not encoded')

  t.deepEquals(bfe.decode(encoded.slice()), values.slice(), 'decode works')
  t.end()
})
