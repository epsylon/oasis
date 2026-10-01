// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

const run = require('promisify-tuple')
const deepEqual = require('fast-deep-equal')
const mutexify = require('mutexify')
const debug = require('debug')('ssb:meta-feeds')
const pickShard = require('./pick-shard')
const { BB1, v1Details, NOT_METADATA } = require('./constants')
const FeedDetails = require('./FeedDetails')

const alwaysTrue = () => true
const v1Visit = detailsToVisit(v1Details)

function detailsToVisit(details) {
  return (feed) => {
    return (
      feed.purpose === details.purpose &&
      feed.feedFormat === details.feedFormat &&
      (details.metadata ? deepEqual(feed.metadata, details.metadata) : true) &&
      (details.recps ? deepEqual(feed.recps, details.recps) : true)
    )
  }
}

exports.init = function (sbot, config = {}) {
  const configSeed = (config.metafeeds || {}).seed

  function filter(metafeed, visit, maybeCB) {
    const cb = maybeCB
    if (!metafeed) {
      cb(new Error('expected metafeed argument'))
    } else if (typeof metafeed === 'function') {
      cb(new Error('expected metafeed argument and visit argument'))
    } else {
      sbot.metafeeds.query.hydrate(
        metafeed.keys.id,
        metafeed.seed,
        (err, hydrated) => {
          if (err) return cb(err)
          if (visit === alwaysTrue) return cb(null, hydrated.feeds)
          const filtered = hydrated.feeds.filter((feed) => visit(feed))
          cb(null, filtered)
        }
      )
    }
  }

  function find(metafeed, visit, maybeCB) {
    const cb = maybeCB
    if (!metafeed) {
      cb(new Error('expected metafeed argument'))
    } else if (typeof metafeed === 'function') {
      cb(new Error('expected metafeed argument and visit argument'))
    } else {
      filter(metafeed, visit, (err, feeds) => {
        if (err) return cb(err)
        if (feeds.length === 0) return cb(null, null)
        const found = feeds[0]
        cb(null, found)
      })
    }
  }

  function findById(feedId, cb) {
    sbot.metafeeds.lookup.findById(feedId, cb)
  }

  function branchStream(opts) {
    return sbot.metafeeds.lookup.branchStream(opts)
  }

  function getTree(root, cb) {
    return sbot.metafeeds.lookup.getTree(root, cb)
  }

  function printTree(root, opts, cb) {
    return sbot.metafeeds.lookup.printTree(root, opts, cb)
  }

  function create(metafeed, details, maybeCB) {
    if (!metafeed) {
      const cb = maybeCB
      getOrCreateRootMetafeed(cb)
    } else if (typeof metafeed === 'function') {
      const cb = metafeed
      getOrCreateRootMetafeed(cb)
    } else {
      const cb = maybeCB
      const detailsErr = findDetailsError(details)
      if (detailsErr) return cb(detailsErr)

      const { keys, seed } = metafeed
      const { purpose, feedFormat, metadata, recps, encryptionFormat } = details

      const opts = sbot.metafeeds.messages.optsForAddDerived(
        keys,
        purpose,
        seed,
        feedFormat,
        metadata,
        recps,
        encryptionFormat
      )
      sbot.db.create(opts, (err, msg) => {
        if (err) return cb(err)
        cb(null, FeedDetails.fromCreateOpts(opts, seed, config))
      })
    }
  }

  const findOrCreateLock = mutexify()

  function findOrCreate(metafeed, maybeVisit, details, maybeCB) {
    if (!metafeed) {
      const cb = maybeCB
      getOrCreateRootMetafeed(cb)
    } else if (typeof metafeed === 'function') {
      const cb = metafeed
      getOrCreateRootMetafeed(cb)
    } else {
      const cb = maybeCB
      const visit = maybeVisit || alwaysTrue
      findOrCreateLock((release) => {
        find(metafeed, visit, (err, found) => {
          if (err) return release(cb, err)
          if (found) return release(cb, null, found)
          create(metafeed, details, release.bind(null, cb))
        })
      })
    }
  }

  function findOrCreateV1(root, cb) {
    findOrCreate(root, v1Visit, v1Details, cb)
  }

  function findShard(root, v1Feed, details, cb) {
    const shardDetails = {
      purpose: pickShard(root.keys.id, details.purpose),
      feedFormat: BB1,
    }
    const shardVisit = detailsToVisit(shardDetails)
    find(v1Feed, shardVisit, cb)
  }

  function findOrCreateShard(root, v1Feed, details, cb) {
    const shardDetails = {
      purpose: pickShard(root.keys.id, details.purpose),
      feedFormat: BB1,
    }
    const shardVisit = detailsToVisit(shardDetails)
    findOrCreate(v1Feed, shardVisit, shardDetails, cb)
  }

  const findAndTombstoneLock = mutexify()

  function findAndTombstone(metafeed, visit, reason, cb) {
    const { optsForTombstone } = sbot.metafeeds.messages
    findAndTombstoneLock((release) => {
      find(metafeed, visit, (err, found) => {
        if (err) return release(cb, err)
        if (!found)
          return release(cb, new Error('Cannot find subfeed to tombstone'))

        optsForTombstone(metafeed.keys, found.keys, reason, (err, opts) => {
          if (err) return release(cb, err)
          sbot.db.create(opts, (err, msg) => {
            if (err) return release(cb, err)
            release(cb, null, true)
          })
        })
      })
    })
  }

  function findRootFeedId(subfeedId, cb) {
    findById(subfeedId, (err, subFeed) => {
      if (err) return cb(err)

      if (subFeed) return findRootFeedId(subFeed.parent, cb)
      sbot.metafeeds.query.isRootFeedId(subfeedId, (err, isRoot) => {
        if (err) return cb(err)

        if (!isRoot) cb(new Error('unable to find root feed id'))
        else cb(null, subfeedId)
      })
    })
  }

  const rootMetafeedLock = mutexify()
  let cachedRootMetafeed = null

  function getRoot(cb) {
    sbot.metafeeds.query.getSeed((err, seed) => {
      if (err) return cb(err)
      if (!seed) return cb(null, null)
      cb(null, FeedDetails.fromRootSeed(seed))
    })
  }

  function getOrCreateRootMetafeed(cb) {
    if (cachedRootMetafeed) return cb(null, cachedRootMetafeed)
    rootMetafeedLock(async (release) => {
      // Pluck relevant internal APIs
      const { deriveRootMetaFeedKeyFromSeed } = sbot.metafeeds.keys
      const { getSeed, getAnnounces } = sbot.metafeeds.query
      const { optsForSeed, optsForAnnounce, optsForAddExisting } =
        sbot.metafeeds.messages

      // Ensure seed exists
      let mf
      const [err1, loadedSeed] = await run(getSeed)()
      if (err1 || !loadedSeed) {
        if (err1) debug('generating a seed because %o', err1)
        else debug('generating a seed')
        const seed = configSeed || sbot.metafeeds.keys.generateSeed()
        const mfKeys = deriveRootMetaFeedKeyFromSeed(seed)
        const opts = optsForSeed(mfKeys, sbot.id, seed)
        const [err2] = await run(sbot.db.create)(opts)
        if (err2) return release(cb, err2)
        mf = FeedDetails.fromRootSeed(seed)
      } else {
        debug('loaded seed')
        mf = FeedDetails.fromRootSeed(loadedSeed)
      }
      sbot.metafeeds.lookup.updateMyRoot(mf)

      // Ensure root meta feed announcement exists on the main feed
      const [err2, announcements] = await run(getAnnounces)()
      if (err2 || !announcements || announcements.length === 0) {
        if (err2) debug('announcing meta feed on main feed because %o', err2)
        else debug('announcing meta feed on main feed')
        const [err3, opts] = await run(optsForAnnounce)(mf.keys, config.keys)
        if (err3) return release(cb, err3)
        const [err4] = await run(sbot.db.create)(opts)
        if (err4) return release(cb, err4)
      } else {
        debug('announce post exists on main feed')
      }

      // Ensure the main feed was "added" on the path root/v1/:shard/main
      const [err3, v1Feed] = await run(findOrCreateV1)(mf)
      if (err3) return release(cb, err3)
      const d = { purpose: 'main' }
      const [err4, shardFeed] = await run(findOrCreateShard)(mf, v1Feed, d)
      if (err4) return release(cb, err4)
      const visit = (f) => f.purpose === 'main'
      const [err5, added] = await run(find)(shardFeed, visit)
      if (err5) return release(cb, err5)
      if (!added) {
        debug('adding main feed to a shard metafeed')
        const opts = optsForAddExisting(shardFeed.keys, 'main', config.keys)
        const [err5] = await run(sbot.db.create)(opts)
        if (err5) return release(cb, err5)
      } else {
        debug('main feed already added to a shard metafeed')
      }

      cachedRootMetafeed = mf
      release(cb, null, mf)
    })
  }

  function commonFindOrCreate(details, cb) {
    if (typeof details === 'function') {
      const cb = details
      getOrCreateRootMetafeed(cb)
      return
    }

    const validDetails = { feedFormat: 'classic', ...details }

    getOrCreateRootMetafeed((err, rootFeed) => {
      if (err) return cb(err)

      findOrCreateV1(rootFeed, (err, v1Feed) => {
        if (err) return cb(err)
        sbot.metafeeds.lookup.updateFromCreatedFeed(v1Feed)

        findOrCreateShard(rootFeed, v1Feed, validDetails, (err, shardFeed) => {
          if (err) return cb(err)
          sbot.metafeeds.lookup.updateFromCreatedFeed(shardFeed)

          const visit = detailsToVisit(validDetails)
          findOrCreate(shardFeed, visit, validDetails, (err, feed) => {
            if (err) return cb(err)
            sbot.metafeeds.lookup.updateFromCreatedFeed(feed)

            cb(null, feed)
          })
        })
      })
    })
  }

  function commonFindAndTombstone(details, reason, cb) {
    const validDetails = { feedFormat: 'classic', ...details }

    getOrCreateRootMetafeed((err, rootFeed) => {
      if (err) return cb(err)

      findOrCreateV1(rootFeed, (err, v1Feed) => {
        if (err) return cb(err)

        findShard(rootFeed, v1Feed, validDetails, (err, shardFeed) => {
          if (err) return cb(err)
          if (!shardFeed) return cb(null, false)

          const visit = detailsToVisit(validDetails)
          findAndTombstone(shardFeed, visit, reason, cb)
        })
      })
    })
  }

  return {
    branchStream,
    getTree,
    printTree,
    findRootFeedId,
    findOrCreate: commonFindOrCreate,
    findAndTombstone: commonFindAndTombstone,

    advanced: {
      getRoot,
      findOrCreate,
      findAndTombstone,
      findById,
    },
  }
}

function findDetailsError(details) {
  const { purpose, feedFormat, metadata = {} } = details
  if (!purpose) {
    return new Error('Missing opts.purpose: ' + JSON.stringify(details))
  }
  if (!feedFormat) {
    return new Error('Missing opts.feedFormat: ' + JSON.stringify(details))
  }

  for (const field in metadata) {
    if (NOT_METADATA.has(field))
      return new Error(`metadata.${field} not allowed (reserved field)`)
  }
}
