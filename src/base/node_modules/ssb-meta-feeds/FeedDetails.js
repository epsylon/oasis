// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros <contact@staltz.com>
//
// SPDX-License-Identifier: LGPL-3.0-only

const deepEqual = require('fast-deep-equal')
const { NOT_METADATA, BB1 } = require('./constants')
const validate = require('./validate')
const metafeedKeys = require('./keys')

const correctPassword = Symbol('FeedDetails')

function collectMetadata(content) {
  const metadata = {}
  for (const key in content) {
    if (NOT_METADATA.has(key)) continue
    metadata[key] = content[key]
  }
  return metadata
}

class FeedDetails {
  constructor(
    password,
    id,
    parent,
    purpose,
    feedFormat,
    seed = null,
    keys = null,
    recps = null,
    metadata = {},
    tombstoned = false,
    tombstoneReason = null
  ) {
    if (password !== correctPassword) {
      throw new Error('dont use `new FeedDetails()`, use FeedDetails.from*()')
    }
    this.id = id
    this.parent = parent
    this.purpose = purpose
    this.feedFormat = feedFormat
    this.seed = seed
    this.keys = keys
    this.recps = recps
    this.metadata = metadata
    this.tombstoned = tombstoned
    this.tombstoneReason = tombstoneReason
  }

  /**
   * Builds FeedDetails based on my metafeed message that "added" or "announced"
   * the feed.
   */
  static fromMyMsg(msg, seed, config) {
    const content = msg.value.content
    const { type, metafeed, feedpurpose, subfeed, nonce, recps } = content
    if (type === 'metafeed/announce') {
      return new FeedDetails(
        correctPassword,
        metafeed,
        null,
        'root',
        BB1,
        seed,
        metafeedKeys.deriveRootMetaFeedKeyFromSeed(seed)
      )
    }
    const feedFormat = validate.detectFeedFormat(subfeed)
    const metadata = collectMetadata(content)
    const existing = type === 'metafeed/add/existing'
    const isTombstoned = type === 'metafeed/tombstone'
    const keys = existing
      ? config.keys
      : type === 'metafeed/add/derived'
      ? metafeedKeys.deriveFeedKeyFromSeed(
          seed,
          nonce.toString('base64'),
          feedFormat
        )
      : null
    return new FeedDetails(
      correctPassword,
      subfeed,
      msg.value.author,
      feedpurpose,
      feedFormat,
      existing ? undefined : seed,
      keys,
      recps || null,
      metadata,
      isTombstoned,
      isTombstoned ? content.reason : null
    )
  }

  /**
   * Builds FeedDetails based on some other peer's metafeed message that "added"
   * or "announced" the feed.
   */
  static fromOtherMsg(msg) {
    const content = msg.value.content
    const { type, subfeed, metafeed, feedpurpose, recps } = content
    const feedFormat = validate.detectFeedFormat(subfeed)
    const metadata = collectMetadata(content)
    const isTombstoned = type === 'metafeed/tombstone'
    return new FeedDetails(
      correctPassword,
      subfeed,
      metafeed,
      feedpurpose,
      feedFormat,
      undefined,
      undefined,
      recps || null,
      metadata,
      isTombstoned ? true : undefined,
      isTombstoned ? content.reason : undefined
    )
  }

  /**
   * Builds FeedDetails based on an "opts" argument that'll be given to
   * `ssb.db.create`.
   */
  static fromCreateOpts(opts, seed, config) {
    const { feedpurpose, subfeed, metafeed, nonce, type, recps } = opts.content
    const feedFormat = validate.detectFeedFormat(subfeed)
    const existing = type === 'metadata/add/existing'
    const keys = existing
      ? config.keys
      : metafeedKeys.deriveFeedKeyFromSeed(
          seed,
          nonce.toString('base64'),
          feedFormat
        )
    const metadata = collectMetadata(opts.content)
    return new FeedDetails(
      correctPassword,
      subfeed,
      metafeed,
      feedpurpose,
      feedFormat,
      existing ? undefined : seed,
      keys,
      recps || null,
      metadata
    )
  }

  /**
   * Builds FeedDetails based on a bendybutt-v1 feed ID, assuming it's a root.
   */
  static fromRootId(id) {
    return new FeedDetails(correctPassword, id, null, 'root', BB1)
  }

  /**
   * Builds FeedDetails for my root metafeed, based on the seed buffer.
   */
  static fromRootSeed(seed) {
    const keys = metafeedKeys.deriveRootMetaFeedKeyFromSeed(seed)
    return new FeedDetails(
      correctPassword,
      keys.id,
      null,
      'root',
      BB1,
      seed,
      keys
    )
  }

  /**
   * Incorporates the given FeedDetails into this one, updating our properties.
   */
  update(feedDetails) {
    this.parent = this.parent || feedDetails.parent
    this.purpose = feedDetails.purpose || this.purpose
    this.metadata = { ...this.metadata, ...feedDetails.metadata }
    if (typeof feedDetails.tombstoned === 'boolean') {
      this.tombstoned = feedDetails.tombstoned
      this.tombstoneReason = feedDetails.tombstoneReason || this.tombstoneReason
    }
  }

  /**
   * Checks whether another FeedDetails instance has all the same properties as
   * this one.
   */
  equals(feedDetails) {
    const seedIsTheSame =
      this.seed === feedDetails.seed ||
      (Buffer.isBuffer(this.seed) &&
        Buffer.isBuffer(feedDetails.seed) &&
        this.seed.equals(feedDetails.seed))

    const keysIsTheSame =
      this.keys === feedDetails.keys || deepEqual(this.keys, feedDetails.keys)
    return (
      this.id === feedDetails.id &&
      this.parent === feedDetails.parent &&
      this.purpose === feedDetails.purpose &&
      this.feedFormat === feedDetails.feedFormat &&
      seedIsTheSame &&
      keysIsTheSame &&
      this.recps === feedDetails.recps &&
      deepEqual(this.metadata, feedDetails.metadata) &&
      this.tombstoned === feedDetails.tombstoned &&
      this.tombstoneReason === feedDetails.tombstoneReason
    )
  }
}

module.exports = FeedDetails
