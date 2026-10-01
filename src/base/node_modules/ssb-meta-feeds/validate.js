// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

const bencode = require('bencode')
const bfe = require('ssb-bfe')
const ssbKeys = require('ssb-keys')
const SSBURI = require('ssb-uri2')
const ref = require('ssb-ref')
const isCanonicalBase64 = require('is-canonical-base64')

const CONTENT_SIG_PREFIX = Buffer.from('bendybutt', 'utf8')

function detectFeedFormat(feedId) {
  if (feedId.startsWith('@') || SSBURI.isClassicFeedSSBURI(feedId)) {
    return 'classic'
  } else if (SSBURI.isBendyButtV1FeedSSBURI(feedId)) {
    return 'bendybutt-v1'
  } else if (SSBURI.isGabbyGroveV1FeedSSBURI(feedId)) {
    return 'gabbygrove-v1'
  } else if (SSBURI.isIndexedV1FeedSSBURI(feedId)) {
    return 'indexed-v1'
  } else {
    console.warn('Unknown feed format: ' + feedId)
    return null
  }
}

/**
 * Validate a single meta feed message.
 *
 * @param {Object} msg - a meta feed message in the form of a JSON object
 * @param {Buffer | string | null} hmacKey - a valid HMAC key for signature
 * verification
 * @returns {Boolean} `true` in the case of successful validation, `false`
 * otherwise
 */
function isValid(msg, hmacKey) {
  if (msg.value.content && msg.value.contentSignature) {
    const contentSection = [msg.value.content, msg.value.contentSignature]
    const validationResult = validateSingle(contentSection, hmacKey)

    return validationResult === undefined
  } else {
    return false
  }
}

/**
 * Validate a single meta feed message `contentSection`.
 *
 * @param {Array | string} contentSection - an array of `content` and
 * `contentSignature` or an encrypted string
 * @param {Buffer | string | null} hmacKey - a valid HMAC key for signature
 * verification
 * @returns {Error | undefined} an `Error` object or `undefined` in the case of
 * successful validation
 */
function validateSingle(contentSection, hmacKey) {
  if (contentSection === null || contentSection === undefined)
    return new Error(
      `invalid message: contentSection cannot be null or undefined`
    )

  // check if content is (maybe) encrypted
  if (typeof contentSection === 'string')
    return new Error(
      'invalid message: cannot validate encrypted contentSection'
    )

  if (!(Array.isArray(contentSection) && contentSection.length === 2))
    return new Error(
      `invalid message: contentSection ${typeof contentSection} with length ${
        contentSection.length
      } is incorrect, expected a list of content and contentSignature`
    )

  const [content, contentSignature] = contentSection

  if (
    !(
      content.type === 'metafeed/add/existing' ||
      content.type === 'metafeed/add/derived' ||
      content.type === 'metafeed/update' ||
      content.type === 'metafeed/tombstone'
    )
  )
    return new Error(
      `invalid message: content type ${content.type} is incorrect`
    )

  const subfeedBFE = bfe.encode(content.subfeed)
  const subfeedType = subfeedBFE.slice(0, 1).toString('hex')
  if (subfeedType !== '00')
    return new Error(
      `invalid message: content subfeed type "0x${subfeedType}" is incorrect, expected 0x00`
    )

  const metafeedBFE = bfe.encode(content.metafeed)
  const metafeedType = metafeedBFE.slice(0, 2).toString('hex')
  if (metafeedType !== '0003')
    return new Error(
      `invalid message: content metafeed type "0x${metafeedType}" is incorrect, expected 0x0003`
    )

  if (content.type === 'metafeed/add/derived') {
    if (content.nonce.length !== 32) {
      const nonceString = content.nonce.toString('hex')
      return new Error(
        `invalid message: content nonce "${nonceString}" is ${content.nonce.length} bytes, expected 32`
      )
    }
  }

  const signatureErr = validateSignature(
    content.subfeed,
    content,
    contentSignature,
    hmacKey
  )
  if (signatureErr) return signatureErr
}

/**
 * Verify that the contentSignature correctly signs the content.
 *
 * @param {string} subfeedKey - `subfeed` key for the message
 * @param {Buffer} content - Dictionary of meta feed metadata
 * @param {string} contentSignature - Base64-encoded signature for the given
 * `content`
 * @param {Buffer | string | null} hmacKey - HMAC key that was used to sign the
 * payload
 * @returns {Error | undefined} Either an Error containing a message or an
 * `undefined` value for successful verification
 */
function validateSignature(subfeedKey, content, contentSignature, hmacKey) {
  const hmacKeyErr = validateHmacKey(hmacKey)
  if (hmacKeyErr) return hmacKeyErr

  const isSignatureRx = isCanonicalBase64('', '\\.sig.\\w+')

  if (!isSignatureRx.test(contentSignature))
    return new Error(
      `invalid message: contentSignature "${contentSignature}", expected a base64 string`
    )

  // if the subfeedKey is a supported uri, convert it to sigil for verification
  if (!ref.isFeed(subfeedKey)) {
    if (
      !SSBURI.isClassicFeedSSBURI(subfeedKey) &&
      !SSBURI.isBendyButtV1FeedSSBURI(subfeedKey) &&
      !SSBURI.isIndexedV1FeedSSBURI(subfeedKey) &&
      !SSBURI.isGabbyGroveV1FeedSSBURI(subfeedKey)
    ) {
      return new Error(
        `invalid message: subfeed key "${subfeedKey}", expected a canonical uri format or classic ssb sigil`
      )
    } else {
      subfeedKey = SSBURI.decompose(subfeedKey).data
    }
  }

  const contentBFE = bfe.encode(content)

  if (
    !ssbKeys.verify(
      { public: subfeedKey, curve: 'ed25519' },
      contentSignature,
      hmacKey,
      Buffer.concat([CONTENT_SIG_PREFIX, bencode.encode(contentBFE)])
    )
  )
    return new Error(
      `invalid message: contentSignature must correctly sign the content using the subfeed key; ${subfeedKey}`
    )
}

/**
 * Validate an HMAC key.
 *
 * @param {Buffer | string | null | undefined} hmacKey
 * @returns {Object | undefined} Either an Error containing a message or
 * `undefined` for successful validation
 */
function validateHmacKey(hmacKey) {
  if (hmacKey === undefined || hmacKey === null) return

  const bytes = Buffer.isBuffer(hmacKey)
    ? hmacKey
    : Buffer.from(hmacKey, 'base64')

  if (typeof hmacKey === 'string') {
    if (bytes.toString('base64') !== hmacKey)
      return new Error(
        `invalid hmac key: "${hmacKey}", expected string to be base64 encoded`
      )
  }

  if (bytes.length !== 32)
    return new Error(
      `invalid hmac key: "${hmacKey}" with length ${hmacKey.length}, expected 32 bytes`
    )
}

/**
 * Validates a main-feed message for metafeed/announce.
 *
 * @param {Object} msg classic msg for a metafeed/announce
 * @returns {Error | undefined} Either an Error or `undefined` for successful
 * validation
 */
function validateMetafeedAnnounce(msg) {
  if (!ref.isFeedId(msg.value.author)) {
    return new Error(
      `metafeed/announce ${msg.key} is invalid ` +
        `because author is not a classic feed: ${msg.value.author}`
    )
  }

  const { content } = msg.value
  const metaFeedId = content.metafeed
  if (!SSBURI.isBendyButtV1FeedSSBURI(metaFeedId)) {
    return new Error(
      `metafeed/announce ${msg.key} is invalid ` +
        `because content.metafeed is not a bendy butt feed: ${metaFeedId}`
    )
  }

  if (content.subfeed !== msg.value.author) {
    return new Error(
      `metafeed/announce ${msg.key} is invalid ` +
        `because content.subfeed is not msg.value.author: ${content.subfeed}`
    )
  }

  const { data } = SSBURI.decompose(metaFeedId)
  const ed25519Public = `${data}.ed25519`
  if (!ssbKeys.verifyObj(ed25519Public, content)) {
    return new Error(
      `metafeed/announce ${msg.key} is invalid ` +
        `because content is not signed by the meta feed: ${content}`
    )
  }
}

exports.detectFeedFormat = detectFeedFormat
exports.isValid = isValid
exports.validateSingle = validateSingle
exports.validateMetafeedAnnounce = validateMetafeedAnnounce
