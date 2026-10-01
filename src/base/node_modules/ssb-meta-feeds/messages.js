// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

const crypto = require('crypto')
const ssbKeys = require('ssb-keys')
const {
  where,
  author,
  and,
  or,
  type,
  toCallback,
} = require('ssb-db2/operators')
const { deriveFeedKeyFromSeed } = require('./keys')

// FIXME: define and use json schema

/**
 * Low level API for generating messages
 */
exports.init = function init(sbot) {
  function optsForAdd(
    mfKeys,
    feedKeys,
    nonce,
    feedpurpose,
    metadata,
    recps,
    encryptionFormat
  ) {
    const content = {
      type: nonce ? 'metafeed/add/derived' : 'metafeed/add/existing',
      feedpurpose,
      subfeed: feedKeys.id,
      metafeed: mfKeys.id,
      tangles: {
        metafeed: { root: null, previous: null },
      },
    }

    if (nonce) content.nonce = nonce
    if (recps) content.recps = recps

    if (metadata) Object.assign(content, metadata)

    return {
      feedFormat: 'bendybutt-v1',
      keys: mfKeys,
      contentKeys: feedKeys, // see ssb-bendy-butt/format.js
      content,
      recps,
      encryptionFormat: encryptionFormat || 'box2',
    }
  }

  function getNonce() {
    return crypto.randomBytes(32)
  }

  const supportedFormats = ['bendybutt-v1', 'classic', 'indexed-v1']

  return {
    /**
     * Generate opts for "ssb.db.create" to create a message to be posted on
     * a metafeed linking to a new feed.
     * Similar to in `deriveFeedKeyFromSeed`, `feedformat` can be either
     * `bendybutt-v1` for a metafeed or then `classic` or `indexed-v1`.
     * `metadata` is an optional object to be included (object spread) in the
     * message `content`.
     */
    optsForAddDerived(
      mfKeys,
      feedpurpose,
      seed,
      feedFormat,
      metadata,
      recps,
      encryptionFormat
    ) {
      if (!supportedFormats.includes(feedFormat)) {
        throw new Error('Unknown feed format: ' + feedFormat)
      }
      const nonce = getNonce()
      const feedKeys = deriveFeedKeyFromSeed(
        seed,
        nonce.toString('base64'),
        feedFormat
      )

      return optsForAdd(
        mfKeys,
        feedKeys,
        nonce,
        feedpurpose,
        metadata,
        recps,
        encryptionFormat
      )
    },

    /**
     * Generate opts for "ssb.db.create" to create a message linking an existing
     * feed to a metafeed. `metadata` is an optional object to be included
     * (object spread) in the message `.content`.
     */
    optsForAddExisting(mfKeys, feedpurpose, feedKeys, metadata) {
      return optsForAdd(mfKeys, feedKeys, null, feedpurpose, metadata)
    },

    /**
     * Generate opts for "ssb.db.create" to create a message to be posted on
     * a metafeed tombstoning a subfeed.
     */
    optsForTombstone(mfKeys, feedKeys, reason, cb) {
      sbot.db.query(
        where(
          and(
            author(mfKeys.id),
            or(type('metafeed/add/derived'), type('metafeed/add/existing'))
          )
        ),
        toCallback((err, msgs) => {
          if (err) return cb(err)
          msgs = msgs.filter((x) => x.value.content.subfeed === feedKeys.id)
          if (msgs.length === 0) {
            return cb(new Error('no add message found on meta feed'))
          }

          const opts = {
            feedFormat: 'bendybutt-v1',
            keys: mfKeys,
            contentKeys: feedKeys,
            content: {
              type: 'metafeed/tombstone',
              subfeed: feedKeys.id,
              metafeed: mfKeys.id,
              reason,
              tangles: {
                metafeed: {
                  root: msgs[0].key,
                  previous: msgs[msgs.length - 1].key,
                },
              },
            },
          }
          cb(null, opts)
        })
      )
    },

    /**
     * Generate opts for "ssb.db.create" to create a message on the main feed
     * linking it to a new root metafeed.
     */
    optsForAnnounce(metafeedKeys, mainKeys, cb) {
      sbot.db.query(
        where(and(author(sbot.id), type('metafeed/announce'))),
        toCallback((err, msgs) => {
          if (err) return cb(err)
          const rootAnnounceId = msgs.length > 0 ? msgs[0].key : null
          const previousAnnounceId =
            msgs.length > 0 ? msgs[msgs.length - 1].key : null

          const content = {
            type: 'metafeed/announce',
            metafeed: metafeedKeys.id,
            subfeed: sbot.id,
            tangles: {
              metafeed: {
                root: rootAnnounceId,
                previous: previousAnnounceId,
              },
            },
          }

          const signedContent = ssbKeys.signObj(metafeedKeys, content)

          const opts = {
            keys: mainKeys,
            feedFormat: 'classic',
            content: signedContent,
          }

          cb(null, opts)
        })
      )
    },

    /**
     * Generate opts for "ssb.db.create" to create a message to save your seed
     * value as a private message (ssb-box) on a main feed.
     */
    optsForSeed(mfKeys, mainfeedId, seed) {
      return {
        content: {
          type: 'metafeed/seed',
          metafeed: mfKeys.id,
          seed: seed.toString('hex'),
        },
        recps: [mainfeedId],
        encryptionFormat: 'box2',
      }
    },
  }
}
