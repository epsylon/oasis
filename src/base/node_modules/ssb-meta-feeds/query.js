// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

const pull = require('pull-stream')
const {
  and,
  author,
  type,
  where,
  toCallback,
  toPullStream,
  paginate,
  descending,
} = require('ssb-db2/operators')
const validate = require('./validate')
const FeedDetails = require('./FeedDetails')

exports.init = function (sbot, config) {
  return {
    /**
     * Gets the stored seed message (on the main feed) for the root meta feed.
     *
     * ```js
     * sbot.metafeeds.query.getSeed((err, seed) => {
     *   console.log("seed buffer", seed)
     * })
     * ```
     */
    getSeed(cb) {
      // FIXME: maybe use metafeed id
      sbot.db.query(
        where(and(author(sbot.id), type('metafeed/seed'))),
        paginate(1),
        descending(),
        toCallback((err, answer) => {
          if (err) return cb(err)
          const msgs = answer.results
          if (msgs.length === 0) return cb(null, null)

          const msg = msgs[0]
          const seedBuf = Buffer.from(msg.value.content.seed, 'hex')
          cb(null, seedBuf)
        })
      )
    },

    /**
     * Gets the meta feed announce messages on main feed.
     *
     * ```js
     * sbot.metafeeds.query.getAnnounces((err, msg) => {
     *   console.log("announce msg", msg)
     * })
     * ```
     */
    getAnnounces(cb) {
      sbot.db.query(
        where(and(author(sbot.id), type('metafeed/announce'))),
        toCallback(cb)
      )
    },

    isRootFeedId(feedId, cb) {
      let isRoot = false

      pull(
        sbot.db.query(where(type('metafeed/announce')), toPullStream()),
        pull.filter((m) => m.value.content.metafeed === feedId),
        pull.take(1),
        pull.drain(
          (m) => {
            isRoot = true
          },
          (err) => {
            if (err) cb(err)
            else cb(null, isRoot)
          }
        )
      )
    },

    /**
     * Gets the current state (active feeds) of a meta feed.
     *
     * ```js
     * sbot.metafeeds.query.hydrate(mfKey.id, (err, hydrated) => {
     *   console.log(hydrated.feeds) // the feeds
     *   console.log(hydrated.feeds[0].purpose) // 'main'
     * })
     * ```
     */
    hydrate(feedId, seed, cb) {
      sbot.db.query(
        where(author(feedId)),
        toCallback((err, msgs) => {
          if (err) return cb(err)

          const validatedMsgs = msgs.filter((msg) => validate.isValid(msg))

          const addedFeeds = validatedMsgs
            .filter((msg) => msg.value.content.type.startsWith('metafeed/add/'))
            .map((msg) => FeedDetails.fromMyMsg(msg, seed, config))

          const tombstoned = validatedMsgs
            .filter((msg) => msg.value.content.type === 'metafeed/tombstone')
            .map((msg) => FeedDetails.fromMyMsg(msg, seed, config))

          const feeds = addedFeeds.filter(
            // allow only feeds that have not been tombstoned
            (feed) => !tombstoned.find((t) => t.id === feed.id)
          )

          cb(null, { feeds, tombstoned })
        })
      )
    },
  }
}
