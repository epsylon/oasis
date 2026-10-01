// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const Ref = require('ssb-ref')
const ssbKeys = require('ssb-keys')
const isCanonicalBase64 = require('is-canonical-base64')
const getMsgId = require('./get-msg-id')

const isSignatureRx = isCanonicalBase64('', '\\.sig.\\w+')
const SIZE_LIMIT = 8192 // max "encoded character" size limit of classic message

function validateShape(msgVal) {
  if (!msgVal || typeof msgVal !== 'object') {
    return new Error('invalid message: not a classic msg')
  }
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
  if (!Ref.isFeedId(msgVal.author)) {
    return new Error('invalid message: must have author as a sigil ID')
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
  if (!isSignatureRx.test(signature)) {
    // prettier-ignore
    return new Error('invalid message: signature must be a canonical base64 string')
  }
  if (signature.length !== 100) {
    // prettier-ignore
    return new Error('invalid message: signature must be 64 bytes, on feed: ' + msgVal.author);
  }

  const keys = { public: msgVal.author.substring(1) }
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

function validatePrevious(msgVal, prevMsgVal) {
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

function validateSequence(msgVal, prevMsgVal) {
  const { sequence } = msgVal
  if (!Number.isInteger(sequence)) {
    // prettier-ignore
    return new Error('invalid message: sequence must be a number on feed: ' + msgVal.author);
  }
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
  if (typeof content === 'string') {
    if (!content.endsWith('.box') && !content.endsWith('.box2')) {
      return new Error(
        'invalid message: string content must end with .box or .box2, on feed: ' +
          msgVal.author
      )
    }
    if (content.length > SIZE_LIMIT) {
      return new Error(
        'invalid message: string content must be at most 8192 characters. Current size is ' +
          content.length
      )
    }
  }
  if (typeof content === 'object') {
    if (!content.type || typeof content.type !== 'string') {
      // prettier-ignore
      return new Error('invalid message: content must have type, on feed: ' + msgVal.author);
    }
    if (content.type.length > 52) {
      // prettier-ignore
      return new Error('invalid message: content type must be shorter than 52 characters, on feed: ' + msgVal.author);
    }
    if (content.type.length < 3) {
      // prettier-ignore
      return new Error('invalid message: content type must be longer than 2 characters, on feed: ' + msgVal.author);
    }
    const size = JSON.stringify(content, null, 2).length
    if (size > SIZE_LIMIT) {
      return new Error(
        'invalid message: encoded content must be at most 8192 characters. Current size is ' +
          size
      )
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
  if ((err = validateHmac(hmacKey))) return err
  if ((err = validateAuthor(nativeMsg))) return err
  if ((err = validateHash(nativeMsg))) return err
  if ((err = validateTimestamp(nativeMsg))) return err
  if (prevNativeMsg) {
    if ((err = validatePrevious(nativeMsg, prevNativeMsg))) return err
    if ((err = validateSequence(nativeMsg, prevNativeMsg))) return err
  } else {
    if ((err = validateFirstPrevious(nativeMsg))) return err
    if ((err = validateFirstSequence(nativeMsg))) return err
  }
  if ((err = validateOrder(nativeMsg))) return err
  if ((err = validateContent(nativeMsg))) return err
  if ((err = validateAsJSON(nativeMsg))) return err
  if ((err = validateSignature(nativeMsg, hmacKey))) return err
}

function validateOOOSync(nativeMsg, hmacKey) {
  let err
  if ((err = validateShape(nativeMsg))) return err
  if ((err = validateHmac(hmacKey))) return err
  if ((err = validateAuthor(nativeMsg))) return err
  if ((err = validateHash(nativeMsg))) return err
  if ((err = validateTimestamp(nativeMsg))) return err
  if ((err = validateOrder(nativeMsg))) return err
  if ((err = validateContent(nativeMsg))) return err
  if ((err = validateAsJSON(nativeMsg))) return err
  if ((err = validateSignature(nativeMsg, hmacKey))) return err
}

function validate(nativeMsg, prevNativeMsg, hmacKey, cb) {
  let err
  if ((err = validateSync(nativeMsg, prevNativeMsg, hmacKey))) {
    return cb(err)
  }
  cb()
}

function validateOOO(nativeMsg, hmacKey, cb) {
  let err
  if ((err = validateOOOSync(nativeMsg, hmacKey))) {
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

function validateOOOBatch(nativeMsgs, hmacKey, cb) {
  let err
  for (const nativeMsg of nativeMsgs) {
    err = validateOOOSync(nativeMsg, hmacKey)
    if (err) return cb(err)
  }
  cb()
}

module.exports = {
  validate,
  validateBatch,
  validateOOO,
  validateOOOBatch,
  validateContent,
}
