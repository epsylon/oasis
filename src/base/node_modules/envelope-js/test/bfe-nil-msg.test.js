const tape = require('tape')
const bfe = require('ssb-bfe')
const convertNilForEnvelopeSpec = require('../util/bfe-nil-msg')

tape('nil envelope', function (t) {
  const bbFeed = 'ssb:feed/bendybutt-v1/6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0='
  const bbNull = convertNilForEnvelopeSpec(bfe.encode(null), bfe.encode(bbFeed))
  t.equal(bbNull.slice(0,2).toString('hex'), '0104', 'bendy msg')
  t.ok(bbNull.slice(2).equals(Buffer.alloc(32)), 'ends with 32 zeros')
  t.equal(bbNull.length, 32 + 2, 'length ok')

  const classicFeed = '@6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0=.ed25519'
  const classicNull = convertNilForEnvelopeSpec(bfe.encode(null), bfe.encode(classicFeed))
  t.equal(classicNull.slice(0,2).toString('hex'), '0100', 'classic msg')
  t.ok(classicNull.slice(2).equals(Buffer.alloc(32)), 'ends with 32 zeros')
  t.equal(classicNull.length, 32 + 2, 'length ok')

  const msg = '%HZVnEzm0NgoSVfG0Hx4gMFbMMHhFvhJsG2zK/pijYII=.sha256'
  const classicMsg = convertNilForEnvelopeSpec(bfe.encode(msg), bfe.encode(classicFeed))
  t.equal(classicMsg.slice(0,2).toString('hex'), '0100', 'classic msg')
  t.notOk(classicMsg.slice(2).equals(Buffer.alloc(32)), 'is not null')
  t.equal(bfe.decode(classicMsg), msg, 'decodes back to the same')
  t.end()
})
