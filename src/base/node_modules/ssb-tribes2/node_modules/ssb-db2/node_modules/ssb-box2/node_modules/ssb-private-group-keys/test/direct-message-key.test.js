/* eslint-disable camelcase */

const test = require('tape')
const pgSpec = require('private-group-spec')
const vectors = [
  require('private-group-spec/vectors/direct-message-key1.json')
]

const { directMessageKey } = require('../')
const { decodeLeaves, DHFeedKeys, ssbKeys, bbKeys } = require('./helpers')
const SCHEME = Buffer.from(pgSpec.keySchemes.feed_id_dm, 'utf8')

test('direct-message-key', t => {
  const mySSBKeys = ssbKeys.generate()
  const my = DHFeedKeys(mySSBKeys)

  const yourSSBKeys = ssbKeys.generate()
  const your = DHFeedKeys(yourSSBKeys)

  const bendyKeys = bbKeys.generate()
  const bendy = DHFeedKeys(bendyKeys)

  /* general checks */
  const key1 = directMessageKey(my.dh.secret, my.dh.public, my.feedId, your.dh.public, your.feedId)
  const key2 = directMessageKey(your.dh.secret, your.dh.public, your.feedId, my.dh.public, my.feedId)
  t.deepEqual(key1, key2, 'the key is shared!')

  t.true(Buffer.isBuffer(key1.key), 'key is a buffer')
  t.isNotDeepEqual(key1.key, Buffer.alloc(32), 'its not not empty')
  t.deepEqual(key1.scheme, SCHEME, 'scheme is valid')

  const key3 = directMessageKey(my.dh.secret, my.dh.public, my.feedId, bendy.dh.public, bendy.feedId)
  const key4 = directMessageKey(bendy.dh.secret, bendy.dh.public, bendy.feedId, my.dh.public, my.feedId)
  t.deepEqual(key3, key4, 'the key is shared (classic/ bendy)')

  /* easy checks */
  t.deepEqual(
    directMessageKey.easy(mySSBKeys)(yourSSBKeys.id),
    key1,
    'DirectMessageKey.easy produces same result (classic/classic)'
  )

  t.deepEqual(
    directMessageKey.easy(mySSBKeys)(bendyKeys.id),
    key3,
    'DirectMessageKey.easy produces same result (classic/bendy butt)'
  )

  t.deepEqual(
    directMessageKey.easy(bendyKeys)(mySSBKeys.id),
    key3,
    'DirectMessageKey.easy produces same result (bendy butt/classic)'
  )

  /* test vectors we've imported */
  console.log('test vectors:', vectors.length)
  vectors.forEach(vector => {
    decodeLeaves(vector)

    const { my_dh_secret, my_dh_public, my_feed_id, your_dh_public, your_feed_id } = vector.input

    const sharedKeyScheme = directMessageKey(
      my_dh_secret, my_dh_public, my_feed_id,
      your_dh_public, your_feed_id
    )

    t.deepEqual(
      sharedKeyScheme,
      {
        key: vector.output.shared_key,
        scheme: vector.output.key_scheme
      },
      vector.description
    )
  })

  t.end()
})
