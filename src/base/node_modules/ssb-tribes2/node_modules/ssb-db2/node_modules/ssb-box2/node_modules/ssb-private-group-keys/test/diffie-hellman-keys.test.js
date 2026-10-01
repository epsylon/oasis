/* eslint-disable camelcase */

const test = require('tape')
const na = require('sodium-universal')
const ssbKeys = require('ssb-keys')

const { DHKeys: Keys } = require('..')

test('diffie-hellman-keys', t => {
  /* new DHKeys().generate() */
  const a = new Keys().generate()
  const b = new Keys().generate()
  t.notDeepEqual(a.sk, Buffer.alloc(na.crypto_scalarmult_SCALARBYTES), 'generate non-empty DH sk')
  t.notDeepEqual(a.pk, Buffer.alloc(na.crypto_scalarmult_BYTES), 'generate non-empty DH pk')

  /* DHKeys.scalarMult */
  t.true(Buffer.isBuffer(Keys.scalarMult(a, b)), 'scalarMult returns a buffer')
  t.notDeepEqual(Keys.scalarMult(a, b), Buffer.alloc(na.crypto_scalarmult_BYTES), 'scalarMult returns non-empty buffer')
  t.deepEqual(Keys.scalarMult(a, b), Keys.scalarMult(b, a), 'scalarMult fulfills DH property')

  const a_pk = new Keys({ public: a.pk })
  const b_pk = new Keys({ public: b.pk })
  t.deepEqual(Keys.scalarMult(a, b_pk), Keys.scalarMult(b, a_pk), 'scalarMult fulfills DH property (realistic key knowledge)')

  /* new DHKeys (opts.fromed25519) */
  const classicKeys = ssbKeys.generate()
  const x = new Keys(classicKeys, { fromEd25519: true })
  t.deepEqual(Keys.scalarMult(a, x), Keys.scalarMult(x, a), 'can generate DH keys from classic ed25519 keys')

  const x_pk = new Keys({ public: classicKeys.public }, { fromEd25519: true })
  t.deepEqual(Keys.scalarMult(a, x_pk), Keys.scalarMult(x, a_pk), 'can generate DH keys from classic ed25519 key (realistic key knowledge)')

  t.end()
})
