// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const bipf = require('bipf')
const bfe = require('ssb-bfe')
const ssbKeys = require('ssb-keys')
const makeContentHash = require('./content-hash')
const { extract, extractVal } = require('./extract')
const { getMsgIdBFE } = require('./get-msg-id')

function validate(nativeMsg, prevNativeMsg, hmacKey, cb) {
  let err
  if ((err = validateSync(nativeMsg, prevNativeMsg, hmacKey))) {
    return cb(err)
  }
  cb()
}

function validateSync(nativeMsg, prevNativeMsg, hmacKey) {
  let err
  if ((err = _validateBase(nativeMsg, prevNativeMsg, hmacKey))) return err
  if ((err = _validateSignature(nativeMsg, hmacKey))) return err
}

function validateBatch(nativeMsgs, prevNativeMsg, hmacKey, cb) {
  let err
  if ((err = validateBatchSync(nativeMsgs, prevNativeMsg, hmacKey))) {
    return cb(err)
  }
  cb()
}

function validateBatchSync(nativeMsgs, prevNativeMsg, hmacKey) {
  let err
  for (let i = 0; i < nativeMsgs.length; ++i) {
    const nativeMsg = nativeMsgs[i]
    if ((err = _validateBase(nativeMsg, prevNativeMsg, hmacKey))) return err
    prevNativeMsg = nativeMsg
  }

  // FIXME: maybe some random element?
  const lastNativeMsg = nativeMsgs[nativeMsgs.length - 1]
  if ((err = _validateSignature(lastNativeMsg, hmacKey))) return err
}

function _validateBase(nativeMsg, prevNativeMsg, hmacKey) {
  let err
  if ((err = _validateShape(nativeMsg))) return err
  if ((err = _validateHmac(hmacKey))) return err
  if ((err = _validateSize(nativeMsg))) return err

  const [encodedVal, sigBuf, contentBuf] = extract(nativeMsg)
  const [
    authorBFE,
    parentBFE,
    sequence,
    timestamp,
    previousBFE,
    tag,
    contentSize,
    contentHash,
  ] = extractVal(encodedVal)

  if ((err = _validateTag(tag))) return err
  if ((err = _validateSequence(sequence))) return err
  if ((err = _validateContent(contentBuf))) return err
  if ((err = _validateContentSize(contentSize, contentBuf))) return err
  if ((err = _validateContentHash(contentHash, contentBuf))) return err

  if ((err = _validateAuthor(authorBFE))) return err
  if ((err = _validateParent(parentBFE))) return err
  if ((err = _validateTimestamp(timestamp))) return err
  if (sequence === 1) {
    if ((err = _validateFirstPrevious(previousBFE, prevNativeMsg))) return err
  } else {
    if ((err = _validatePrevious(encodedVal, prevNativeMsg))) return err
  }
}

function _validateShape(nativeMsg) {
  if (!Buffer.isBuffer(nativeMsg)) {
    return new Error(`invalid message: expected a buffer`)
  }
  const type = bipf.getEncodedType(nativeMsg)
  if (type !== bipf.types.array) {
    return new Error(`invalid message: expected first layer to be an array`)
  }
}

function _validateHmac(hmacKey) {
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

function _validateSize(nativeMsg) {
  if (nativeMsg.length > 16384) {
    // prettier-ignore
    return new Error(`invalid message size: ${nativeMsg.length} bytes, must not be greater than 16384 bytes`)
  }
}

function _validateTag(tag) {
  if (!Buffer.isBuffer(tag)) {
    return new Error('invalid message: tag must be a buffer but got ' + tag)
  }
  if (tag.length !== 1) {
    // prettier-ignore
    return new Error('invalid message: tag must be a single byte: ' + tag.toString('hex'))
  }
  const byte = tag[0]
  if (byte < 0 || byte > 2) {
    // prettier-ignore
    return new Error('invalid message: tag must be 0, 1, or 2 but got ' + byte)
  }
}

function _validateAuthor(authorBFE) {
  if (!Buffer.isBuffer) {
    return new Error(`invalid message: expected author to be a buffer`)
  }
  if (!bfe.isEncodedFeedButtwooV1(authorBFE)) {
    // prettier-ignore
    return new Error(`invalid message: author is ${authorBFE.toString('hex')}, must be buttwoo-v1 feed`)
  }
}

function _validateParent(parentBFE) {
  if (!Buffer.isBuffer) {
    return new Error(`invalid message: expected parent to be a buffer`)
  }
  if (
    !bfe.isEncodedGenericNil(parentBFE) &&
    !bfe.isEncodedMessageButtwooV1(parentBFE)
  ) {
    // prettier-ignore
    return new Error(`invalid message: parent is ${parentBFE.toString('hex')}, must be nil or buttwoo-v1 message`)
  }
}

function _validateTimestamp(timestamp) {
  if (
    typeof timestamp !== 'number' ||
    isNaN(timestamp) ||
    !isFinite(timestamp) ||
    timestamp < 0
  ) {
    // prettier-ignore
    return new Error(`invalid message: timestamp is ${timestamp}, expected a non-negative number`)
  }
}

function _validateContent(contentBuf) {
  if (!contentBuf) {
    return new Error('invalid message: content must be present')
  }
  if (!Buffer.isBuffer(contentBuf)) {
    return new Error('invalid message: content must be a buffer')
  }
}

function _validateContentHash(contentHash, contentBuf) {
  if (!contentHash) {
    return new Error('invalid message: contentHash must be present')
  }
  if (!Buffer.isBuffer(contentHash)) {
    return new Error('invalid message: contentHash must be a buffer')
  }
  if (contentHash.length !== 33) {
    return new Error('invalid message: contentHash must be 33 bytes')
  }
  const testedContentHash = makeContentHash(contentBuf)
  if (Buffer.compare(testedContentHash, contentHash) !== 0) {
    return new Error('invalid message: contentHash does not match content')
  }
}

function _validateContentSize(contentSize, contentBuf) {
  if (!contentSize) {
    return new Error('invalid message: contentSize must be present')
  }
  if (typeof contentSize !== 'number') {
    return new Error('invalid message: contentSize must be a number')
  }
  if (contentBuf.length !== contentSize) {
    return new Error('invalid message: contentSize must match content length')
  }
}

function _validateSequence(sequence) {
  if (!sequence) {
    return new Error('invalid message: sequence must be present')
  }
  if (!Number.isInteger(sequence)) {
    return new Error('invalid message: sequence must be an integer')
  }
  if (sequence <= 0) {
    return new Error('invalid message: sequence must be greater than 0')
  }
}

function _validateFirstPrevious(previousBFE, prevNativeMsg) {
  if (!Buffer.isBuffer(previousBFE)) {
    return new Error(`invalid message: expected previous to be a buffer`)
  }
  if (!bfe.isEncodedGenericNil(previousBFE)) {
    // prettier-ignore
    return new Error(`invalid message: previous is "${previousBFE.toString('hex')}", expected a value of null because sequence is 1`)
  }
  if (prevNativeMsg) {
    // prettier-ignore
    return new Error('invalid message: sequence cannot be 1 if there exists a previous message')
  }
}

function _validatePrevious(encodedVal, prevNativeMsg) {
  const [authorBFE, parentBFE, sequence, timestamp, previousBFE] =
    extractVal(encodedVal)
  if (!Buffer.isBuffer(previousBFE)) {
    return new Error(`invalid message: expected previous to be a buffer`)
  }
  if (!bfe.isEncodedMessageButtwooV1(previousBFE)) {
    // prettier-ignore
    return new Error(`invalid message: previous is "${previousBFE.toString('hex')}", expected a valid message identifier`)
  }
  if (!prevNativeMsg) {
    // prettier-ignore
    return new Error('invalid previousMsg: value must not be null if sequence > 1')
  }

  const prevMsgIdBFE = getMsgIdBFE(prevNativeMsg)
  const [encodedValuePrev] = extract(prevNativeMsg)
  const [
    authorBFEPrev,
    parentBFEPrev,
    sequencePrev,
    timestampPrev,
    previousBFEPrev,
    tagPrev,
  ] = extractVal(encodedValuePrev)
  if (tagPrev[0] === 2) {
    // prettier-ignore
    return new Error('invalid message: previous message is a tombstone')
  }
  if (Buffer.compare(authorBFE, authorBFEPrev) !== 0) {
    // prettier-ignore
    return new Error(`invalid message: authorBFE does not match previous message's authorBFE`)
  }
  if (Buffer.compare(parentBFE, parentBFEPrev) !== 0) {
    // prettier-ignore
    return new Error(`invalid message: parentBFE does not match previous message's parentBFE`)
  }
  if (sequence !== sequencePrev + 1) {
    // prettier-ignore
    return new Error(`invalid message: sequence does not match previous message's sequence + 1`)
  }
  if (timestamp <= timestampPrev) {
    // prettier-ignore
    return new Error(`invalid message: timestamp must be greater than previous message's timestamp`)
  }
  if (Buffer.compare(previousBFE, prevMsgIdBFE) !== 0) {
    // prettier-ignore
    return new Error('invalid message: previousBFE does not match previous message ID')
  }
}

function _validateSignature(nativeMsg, hmacKey) {
  const [encodedVal, sigBuf] = extract(nativeMsg)
  const [authorBFE] = extractVal(encodedVal)

  if (!Buffer.isBuffer(sigBuf)) {
    return new Error('invalid message: signature must be a buffer')
  }

  // Fast:
  const public = authorBFE.slice(2)
  // Proper:
  // const { data: public } = SSBURI.decompose(bfe.decode(authorBFE))
  const keys = { public, curve: 'ed25519' }

  if (!ssbKeys.verify(keys, sigBuf, hmacKey, encodedVal)) {
    return cb(new Error('Signature does not match encoded value'))
  }
}

module.exports = {
  validate,
  validateSync,
  validateBatch,
  validateBatchSync,
}
