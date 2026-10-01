/* eslint-disable camelcase */

const test = require('tape')
const pgSpec = require('private-group-spec')
const vectors = [
  require('private-group-spec/vectors/po-box-key1.json')
]

const { poBoxKey } = require('..')
const { decodeLeaves, DHFeedKeys, DHPOBoxKeys, ssbKeys } = require('./helpers')

const SCHEME = Buffer.from(pgSpec.keySchemes.po_box, 'utf8')

test('po-box-key', t => {
  const poBox = DHPOBoxKeys()

  const classicKeys = ssbKeys.generate()
  const bendyKeys = ssbKeys.generate(null, null, 'bendybutt-v1')

  /* general checks */
  function test (poBox, feedKeys, type) {
    t.test('> po-box + ' + type, t => {
      const dmKeys = DHFeedKeys(feedKeys) // convert to curve25519 + bfe

      const key1 = poBoxKey(dmKeys.dh.secret, dmKeys.dh.public, dmKeys.feedId, poBox.dh.public, poBox.id)
      const key2 = poBoxKey(poBox.dh.secret, poBox.dh.public, poBox.id, dmKeys.dh.public, dmKeys.feedId)

      t.deepEqual(key1, key2, 'the key is shared!')

      t.true(Buffer.isBuffer(key1.key), 'key is a buffer')
      t.isNotDeepEqual(key1.key, Buffer.alloc(32), 'key not empty')
      t.deepEqual(key1.scheme, SCHEME, 'scheme is valid')

      /* easy checks */
      t.deepEqual(poBoxKey.easy(feedKeys)(poBox.stringId), key1, 'POBox.easy produces same result')
      t.end()
    })
  }
  test(poBox, classicKeys, 'classic')
  test(poBox, bendyKeys, 'bendy')

  /* failing cases */
  t.test('> po-box fails', t => {
    const A = DHFeedKeys(classicKeys)
    const B = DHFeedKeys(bendyKeys)

    t.throws(
      () => poBoxKey(A.dh.secret, A.dh.public, A.feedId, B.dh.public, B.id),
      /exactly 1 poBox expected/,
      'two feedId => throws'
    )

    t.throws(
      () => poBoxKey(poBox.dh.secret, poBox.dh.public, poBox.feedId, poBox.dh.public, poBox.id),
      /exactly 1 poBox expected/,
      'two poBox => throws'
    )

    t.throws(
      () => poBoxKey.easy(classicKeys)(classicKeys.id),
      /exactly 1 poBox expected/,
      'POBox.easy(feedKeys)(feedId) => throws'
    )

    t.end()
  })

  t.test('> test vectors: ' + vectors.length, t => {
    /* test vectors we've imported */
    vectors.forEach(vector => {
      decodeLeaves(vector)

      const { my_dh_secret, my_dh_public, my_feed_id, po_box_dh_public, po_box_id } = vector.input

      const sharedKey = poBoxKey(
        my_dh_secret, my_dh_public, my_feed_id,
        po_box_dh_public, po_box_id
      )

      t.deepEqual(
        sharedKey,
        {
          key: vector.output.shared_key,
          scheme: vector.output.key_scheme
        },
        vector.description
      )
    })

    t.end()
  })

  t.end()
})
