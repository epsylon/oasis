/* eslint-disable camelcase */

const test = require('tape')
const na = require('sodium-universal')
const ssbKeys = require('ssb-keys')

const { DHKeys } = require('..')

test('diffie-hellman-keys', t => {
  const a = new DHKeys().generate()
  const b = new DHKeys().generate()

  t.test('> DHKeys().generate()', t => {
    t.notDeepEqual(a.sk, Buffer.alloc(na.crypto_scalarmult_SCALARBYTES), 'generate non-empty DH sk')
    t.notDeepEqual(a.pk, Buffer.alloc(na.crypto_scalarmult_BYTES), 'generate non-empty DH pk')
    t.end()
  })

  t.test('> DHKeys.scalarMult', t => {
    t.true(Buffer.isBuffer(DHKeys.scalarMult(a, b)), 'scalarMult returns a buffer')
    t.notDeepEqual(DHKeys.scalarMult(a, b), Buffer.alloc(na.crypto_scalarmult_BYTES), 'scalarMult returns non-empty buffer')
    t.deepEqual(DHKeys.scalarMult(a, b), DHKeys.scalarMult(b, a), 'scalarMult fulfills DH property')

    const a_pk = new DHKeys({ public: a.pk })
    const b_pk = new DHKeys({ public: b.pk })
    t.deepEqual(DHKeys.scalarMult(a, b_pk), DHKeys.scalarMult(b, a_pk), 'scalarMult fulfills DH property (realistic key knowledge)')
    t.end()
  })

  t.test('> new DHKeys (opts.fromEd25519)', t => {
    const classicKeys = ssbKeys.generate()
    const x = new DHKeys(classicKeys, { fromEd25519: true })

    t.equal(x.format, 0, 'format = 0 (dm)')
    t.deepEqual(DHKeys.scalarMult(a, x), DHKeys.scalarMult(x, a), 'can generate DH keys from classic ed25519 keys')

    const a_pk = new DHKeys({ public: a.pk })
    const x_pk = new DHKeys({ public: x.pk })

    t.deepEqual(DHKeys.scalarMult(a, x_pk), DHKeys.scalarMult(x, a_pk), 'can generate DH keys from classic ed25519 key (realistic key knowledge)')

    t.end()
  })

  t.end()
})
