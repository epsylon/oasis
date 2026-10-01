// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const Ref = require('ssb-ref')
const SSBURI = require('ssb-uri2')
const classic = require('ssb-classic/format')
const ssbKeys = require('ssb-keys')
const isCanonicalBase64 = require('is-canonical-base64')
const getMsgId = require('./get-msg-id')

const isSignatureRegex = isCanonicalBase64('', '\\.sig.\\w+')

function validateShape(nativeMsg) {
  if (Array.isArray(nativeMsg)) {
    if (nativeMsg.length !== 2) {
      return new Error('invalid message: tuple must have 2 elements')
    }
    const [msgVal] = nativeMsg
    return validateShape(msgVal)
  }

  if (!nativeMsg || typeof nativeMsg !== 'object') {
    return new Error('invalid message: not an object')
  }
  const msgVal = nativeMsg

  if (typeof msgVal.author === 'undefined') {
    return new Error('invalid message: must have author')
  }
  if (typeof msgVal.previous === 'undefined') {
    return new Error('invalid message: must have previous')
  }
  if (typeof msgVal.sequence === 'undefined') {
    return new Error('invalid message: must have sequence')
  }
  if (typeof msgVal.timestamp === 'undefined') {
    return new Error('invalid message: must have timestamp')
  }
  if (typeof msgVal.hash === 'undefined') {
    return new Error('invalid message: must have hash')
  }
  if (typeof msgVal.content === 'undefined') {
    return new Error('invalid message: must have content')
  }
  if (typeof msgVal.signature === 'undefined') {
    return new Error('invalid message: must have signature')
  }
}

function validateAuthor(msgVal) {
  if (!SSBURI.isIndexedV1FeedSSBURI(msgVal.author)) {
    return new Error('invalid message: must have author as an SSB URI')
  }
}

function validateSignature(msgVal, hmacKey) {
  const { signature } = msgVal
  if (typeof signature !== 'string') {
    return new Error('invalid message: must have signature as a string')
  }
  if (!signature.endsWith('.sig.ed25519')) {
    // prettier-ignore
    return new Error('invalid message: signature must end with .sig.ed25519')
  }
  if (!isSignatureRegex.test(signature)) {
    // prettier-ignore
    return new Error('invalid message: signature must be a canonical base64 string')
  }
  if (signature.length !== 100) {
    // prettier-ignore
    return new Error('invalid message: signature must be 64 bytes, on feed: ' + msgVal.author);
  }

  const { data } = SSBURI.decompose(msgVal.author)
  const keys = { public: data, curve: 'ed25519' }
  if (!ssbKeys.verifyObj(keys, hmacKey, msgVal)) {
    // prettier-ignore
    return new Error('invalid message: signature does not match, on feed: ' + msgVal.author);
  }
}

function validateOrder(msgVal) {
  const keys = Object.keys(msgVal)
  if (keys.length !== 7) {
    return new Error('invalid message: wrong number of object fields')
  }
  if (
    keys[0] !== 'previous' ||
    keys[3] !== 'timestamp' ||
    keys[4] !== 'hash' ||
    keys[5] !== 'content' ||
    keys[6] !== 'signature'
  ) {
    return new Error('invalid message: wrong order of object fields')
  }
  // author and sequence may be swapped.
  if (
    !(
      (keys[1] === 'sequence' && keys[2] === 'author') ||
      (keys[1] === 'author' && keys[2] === 'sequence')
    )
  ) {
    return new Error('invalid message: wrong order of object fields')
  }
}

function validatePrevious(msgVal, prevNativeMsg) {
  const prevMsgVal = Array.isArray(prevNativeMsg)
    ? prevNativeMsg[0]
    : prevNativeMsg
  const prevMsgId = prevMsgVal.id ? prevMsgVal.id : getMsgId(prevMsgVal)
  if (msgVal.previous !== prevMsgId) {
    // prettier-ignore
    return new Error('invalid message: expected different previous message, on feed: ' + msgVal.author);
  }
}

function validateFirstPrevious(msgVal) {
  if (msgVal.previous !== null) {
    // prettier-ignore
    return new Error('initial message must have previous: null, on feed: ' + msgVal.author);
  }
}

function validateFirstSequence(msgVal) {
  if (msgVal.sequence !== 1) {
    // prettier-ignore
    return new Error('initial message must have sequence: 1, on feed: ' + msgVal.author);
  }
}

function validateSequence(msgVal, prevNativeMsg) {
  const { sequence } = msgVal
  if (!Number.isInteger(sequence)) {
    // prettier-ignore
    return new Error('invalid message: sequence must be a number on feed: ' + msgVal.author);
  }
  const prevMsgVal = Array.isArray(prevNativeMsg)
    ? prevNativeMsg[0]
    : prevNativeMsg
  const next = prevMsgVal.sequence + 1
  if (sequence !== next) {
    // prettier-ignore
    return new Error('invalid message: expected sequence ' + next + ' but got: ' + sequence + ' on feed: ' + msgVal.author);
  }
}

function validateTimestamp(msgVal) {
  if (typeof msgVal.timestamp !== 'number') {
    // prettier-ignore
    return new Error('initial message must have timestamp, on feed: ' + msgVal.author);
  }
}

function validateHash(msgVal) {
  if (msgVal.hash !== 'sha256') {
    // prettier-ignore
    return new Error('invalid message: hash must be sha256, on feed: ' + msgVal.author);
  }
}

function validateContent(msgVal) {
  const { content } = msgVal
  if (!content) {
    return new Error('invalid message: must have content')
  }
  if (Array.isArray(content)) {
    return new Error('invalid message: content must not be an array')
  }
  if (typeof content !== 'object' && typeof content !== 'string') {
    // prettier-ignore
    return new Error('invalid message: content must be an object or string, on feed: ' + msgVal.author);
  }
  if (
    typeof content === 'string' &&
    !content.endsWith('.box') &&
    !content.endsWith('.box2')
  ) {
    // prettier-ignore
    return new Error('invalid message: string content must end with .box or .box2, on feed: ' + msgVal.author);
  }
  if (typeof content === 'object') {
    if (!content.type || typeof content.type !== 'string') {
      // prettier-ignore
      return new Error('invalid message: content must have type, on feed: ' + msgVal.author);
    }
    if (content.type !== 'metafeed/index') {
      // prettier-ignore
      return new Error('invalid message: content type must be exactly "metafeed/index" on feed: ' + msgVal.author);
    }
    if (!Ref.isMsg(content.indexed)) {
      // prettier-ignore
      return new Error('invalid message: content must have indexed as a classic message ID, on feed: ' + msgVal.author);
    }
  }
}

function validateHmac(hmacKey) {
  if (!hmacKey) return
  if (typeof hmacKey !== 'string' && !Buffer.isBuffer(hmacKey)) {
    return new Error('invalid hmac key: must be a string or buffer')
  }
  const bytes = Buffer.isBuffer(hmacKey)
    ? hmacKey
    : Buffer.from(hmacKey, 'base64')

  if (typeof hmacKey === 'string' && bytes.toString('base64') !== hmacKey) {
    return new Error('invalid hmac')
  }

  if (bytes.length !== 32) {
    return new Error('invalid hmac, it should have 32 bytes')
  }
}

function validatePayload(msgVal, payload) {
  if (!payload) return
  const expected = classic.getMsgId(payload)
  const actual = msgVal.content.indexed
  if (expected !== actual) {
    return new Error('invalid message: payload msg key does not match')
  }
}

function validateAsJSON(msgVal) {
  const asJson = JSON.stringify(msgVal, null, 2)
  if (asJson.length > 8192) {
    // prettier-ignore
    return new Error('invalid message: message is longer than 8192 latin1 codepoints');
  }
}

function validateSync(nativeMsg, prevNativeMsg, hmacKey) {
  let err
  if ((err = validateShape(nativeMsg))) return err

  const msgVal = Array.isArray(nativeMsg) ? nativeMsg[0] : nativeMsg
  const payload = Array.isArray(nativeMsg) ? nativeMsg[1] : null

  if ((err = validateHmac(hmacKey))) return err
  if ((err = validateAuthor(msgVal))) return err
  if ((err = validateHash(msgVal))) return err
  if ((err = validateTimestamp(msgVal))) return err
  if (prevNativeMsg) {
    if ((err = validatePrevious(msgVal, prevNativeMsg))) return err
    if ((err = validateSequence(msgVal, prevNativeMsg))) return err
  } else {
    if ((err = validateFirstPrevious(msgVal))) return err
    if ((err = validateFirstSequence(msgVal))) return err
  }
  if ((err = validateOrder(msgVal))) return err
  if ((err = validateContent(msgVal))) return err
  if ((err = validatePayload(msgVal, payload))) return err
  if ((err = validateAsJSON(msgVal))) return err
  if ((err = validateSignature(msgVal, hmacKey))) return err
}

function validate(nativeMsg, prevNativeMsg, hmacKey, cb) {
  let err
  if ((err = validateSync(nativeMsg, prevNativeMsg, hmacKey))) {
    return cb(err)
  }
  cb()
}

function validateBatch(nativeMsgs, prevNativeMsg, hmacKey, cb) {
  let err
  let prev = prevNativeMsg
  for (const nativeMsg of nativeMsgs) {
    err = validateSync(nativeMsg, prev, hmacKey)
    if (err) return cb(err)
    prev = nativeMsg
  }
  cb()
}

module.exports = {
  validate,
  validateBatch,
}
