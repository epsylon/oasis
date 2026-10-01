// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const bencode = require('bencode')
const BFE = require('ssb-bfe')
const ssbKeys = require('ssb-keys')
const SSBURI = require('ssb-uri2')
const extract = require('./extract')
const getMsgId = require('./get-msg-id')
const getSequence = require('./get-sequence')
const { validate } = require('./validation')

const CONTENT_SIG_PREFIX = Buffer.from('bendybutt', 'utf8')

const name = 'bendybutt-v1'

const encodings = ['js']

function getFeedId(nativeMsg) {
  return BFE.decode(bencode.decode(nativeMsg, 2, 39))
}

function isNativeMsg(x) {
  if (!Buffer.isBuffer(x)) return false
  if (x.length === 0) return false
  try {
    const { authorBFE } = extract(x)
    return BFE.isEncodedFeedBendybuttV1(authorBFE)
  } catch (err) {
    return false
  }
}

function isAuthor(author) {
  return typeof author === 'string' && SSBURI.isBendyButtV1FeedSSBURI(author)
}

function toPlaintextBuffer(opts) {
  const { content, contentKeys, keys, hmacKey } = opts
  const contentBFE = BFE.encode(content)
  const contentSignature = ssbKeys.sign(
    contentKeys || keys,
    hmacKey,
    Buffer.concat([CONTENT_SIG_PREFIX, bencode.encode(contentBFE)])
  )
  const contentSection = [content, contentSignature]
  return bencode.encode(BFE.encode(contentSection))
}

function newNativeMsg(opts) {
  const author = opts.keys.id
  const previous = opts.previous || { key: null, value: { sequence: 0 } }
  const sequence = previous.value.sequence + 1
  const previousId = previous.key
  const timestamp = +opts.timestamp
  const content = opts.content
  const contentBFE = BFE.encode(content)
  const contentSignature = ssbKeys.sign(
    opts.contentKeys || opts.keys,
    opts.hmacKey,
    Buffer.concat([CONTENT_SIG_PREFIX, bencode.encode(contentBFE)])
  )
  let contentSection = [content, contentSignature]
  const payload = [author, sequence, previousId, timestamp, contentSection]
  const payloadBen = bencode.encode(BFE.encode(payload))
  const signature = ssbKeys.sign(opts.keys, opts.hmacKey, payloadBen)
  return bencode.encode(BFE.encode([payload, signature]))
}

function fromNativeMsg(nativeMsg, encoding = 'js') {
  if (encoding === 'js') {
    const msgBFE = bencode.decode(nativeMsg)
    const [payload, signature] = BFE.decode(msgBFE)
    const [author, sequence, previous, timestamp, contentSection] = payload

    const msgVal = {
      author,
      sequence,
      previous,
      timestamp,
      signature,
    }
    if (typeof contentSection === 'string') {
      msgVal.content = contentSection
    } else {
      const [content, contentSignature] = contentSection
      msgVal.content = content
      msgVal.contentSignature = contentSignature
    }

    return msgVal
  } else {
    // prettier-ignore
    throw new Error(`Feed format "${name}" does not support encoding "${encoding}"`)
  }
}

function fromDecryptedNativeMsg(plaintextBuf, nativeMsg, encoding = 'js') {
  if (encoding === 'js') {
    const msgVal = fromNativeMsg(nativeMsg, encoding)
    const contentSection = BFE.decode(bencode.decode(plaintextBuf))
    const [content, contentSignature] = contentSection
    msgVal.content = content
    msgVal.contentSignature = contentSignature
    return msgVal
  } else {
    // prettier-ignore
    throw new Error(`Feed format "${name}" does not support encoding "${encoding}"`)
  }
}

function toNativeMsg(msg, encoding = 'js') {
  if (encoding === 'js') {
    const {
      author,
      sequence,
      previous,
      timestamp,
      signature,
      content,
      contentSignature,
    } = msg
    const contentSection = [content, contentSignature]
    const payload = [author, sequence, previous, timestamp, contentSection]
    const msgBFE = BFE.encode([payload, signature])
    const nativeMsg = bencode.encode(msgBFE)
    return nativeMsg
  } else {
    // prettier-ignore
    throw new Error(`Feed format "${name}" does not support encoding "${encoding}"`)
  }
}

module.exports = {
  name,
  encodings,
  getFeedId,
  getMsgId,
  getSequence,
  isNativeMsg,
  isAuthor,
  toPlaintextBuffer,
  newNativeMsg,
  toNativeMsg,
  fromNativeMsg,
  fromDecryptedNativeMsg,
  validate,
}
