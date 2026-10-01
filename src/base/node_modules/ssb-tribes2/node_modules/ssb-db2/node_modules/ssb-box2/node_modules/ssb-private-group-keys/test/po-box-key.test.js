/* eslint-disable camelcase */

const test = require('tape')
const pgSpec = require('private-group-spec')
const vectors = [
  require('private-group-spec/vectors/po-box-key1.json')
]

const { poBoxKey } = require('..')
const { decodeLeaves, DHFeedKeys, DHPOBoxKeys, ssbKeys, bbKeys } = require('./helpers')

const SCHEME = Buffer.from(pgSpec.keySchemes.po_box, 'utf8')

test('po-box-key', t => {
  const mySSBKeys = ssbKeys.generate()
  const my = DHFeedKeys(mySSBKeys)

  const bendyKeys = bbKeys.generate()
  const bendy = DHFeedKeys(bendyKeys)

  const poBox = DHPOBoxKeys()

  /* general checks */
  const key1 = poBoxKey(my.dh.secret, my.dh.public, my.feedId, poBox.dh.public, poBox.id)
  const key2 = poBoxKey(poBox.dh.secret, poBox.dh.public, poBox.id, my.dh.public, my.feedId)
  t.deepEqual(key1, key2, 'the key is shared!')

  t.true(Buffer.isBuffer(key1.key), 'key is a buffer')
  t.isNotDeepEqual(key1.key, Buffer.alloc(32), 'its not not empty')
  t.deepEqual(key1.scheme, SCHEME, 'scheme is valid')

  const key3 = poBoxKey(bendy.dh.secret, bendy.dh.public, bendy.feedId, poBox.dh.public, poBox.id)
  const key4 = poBoxKey(poBox.dh.secret, poBox.dh.public, poBox.id, bendy.dh.public, bendy.feedId)
  t.deepEqual(key3, key4, 'the key is shared! (bendy)')

  /* easy checks */
  t.deepEqual(
    poBoxKey.easy(mySSBKeys)(poBox.stringId),
    key1,
    'POBox.easy produces same result (classic)'
  )

  t.deepEqual(
    poBoxKey.easy(bendyKeys)(poBox.stringId),
    key3,
    'POBox.easy produces same result (bendy butt)'
  )

  /* test vectors we've imported */
  console.log('test vectors:', vectors.length)
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
