// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const Ref = require('ssb-ref')
const bipf = require('bipf')
const ssbKeys = require('ssb-keys')
const {
  validate,
  validateOOO,
  validateBatch,
  validateOOOBatch,
  validateContent,
} = require('./validation')
const getMsgId = require('./get-msg-id')

const name = 'classic'
const encodings = ['js', 'bipf']

function getFeedId(nativeMsg) {
  return nativeMsg.author
}

function getSequence(nativeMsg) {
  return nativeMsg.sequence
}

function isNativeMsg(x) {
  return typeof x === 'object' && !!x && Ref.isFeedId(x.author)
}

function isAuthor(author) {
  return Ref.isFeedId(author)
}

function toPlaintextBuffer(opts) {
  return Buffer.from(JSON.stringify(opts.content), 'utf8')
}

function newNativeMsg(opts) {
  const previous = opts.previous || { key: null, value: { sequence: 0 } }
  const nativeMsg = {
    previous: previous.key,
    sequence: previous.value.sequence + 1,
    author: opts.keys.id,
    timestamp: +opts.timestamp,
    hash: 'sha256',
    content: opts.content,
  }
  let err
  if ((err = validateContent(nativeMsg))) throw err
  return ssbKeys.signObj(opts.keys, opts.hmacKey, nativeMsg)
}

function fromNativeMsg(nativeMsg, encoding = 'js') {
  if (encoding === 'js') {
    return nativeMsg
  } else if (encoding === 'bipf') {
    return bipf.allocAndEncode(nativeMsg)
  } else {
    // prettier-ignore
    throw new Error(`Feed format "${name}" does not support encoding "${encoding}"`)
  }
}

function fromDecryptedNativeMsg(plaintextBuf, nativeMsg, encoding = 'js') {
  if (encoding === 'js') {
    const msgVal = nativeMsg
    const content = JSON.parse(plaintextBuf.toString('utf8'))
    msgVal.content = content
    return msgVal
  } else if (encoding === 'bipf') {
    return bipf.allocAndEncode(
      fromDecryptedNativeMsg(plaintextBuf, nativeMsg, 'js')
    )
  } else {
    // prettier-ignore
    throw new Error(`Feed format "${name}" does not support encoding "${encoding}"`)
  }
}

function toNativeMsg(msg, encoding = 'js') {
  if (encoding === 'js') {
    return msg
  } else if (encoding === 'bipf') {
    return bipf.decode(msg)
  } else {
    // prettier-ignore
    throw new Error(`Feed format "${name}" does not support encoding "${encoding}"`)
  }
}

module.exports = {
  name,
  encodings,
  getMsgId,
  getFeedId,
  getSequence,
  isAuthor,
  isNativeMsg,
  toPlaintextBuffer,
  newNativeMsg,
  fromNativeMsg,
  fromDecryptedNativeMsg,
  toNativeMsg,
  validate,
  validateOOO,
  validateBatch,
  validateOOOBatch,
}
