// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const BFE = require('ssb-bfe')
const ssbKeys = require('ssb-keys')
const bencode = require('bencode')
const extract = require('./extract')
const getMsgId = require('./get-msg-id')
const getSequence = require('./get-sequence')

function _validateShape(nativeMsg) {
  if (!Buffer.isBuffer(nativeMsg)) {
    return new Error(`invalid message: expected a buffer`)
  }
  const topLayer = bencode.decode(nativeMsg)
  if (!Array.isArray(topLayer) || topLayer.length !== 2) {
    return new Error(`invalid message: expected a bencode list of length 2`)
  }
  const [payload] = topLayer
  const layer2 = payload
  if (!Array.isArray(layer2) || layer2.length !== 5) {
    // prettier-ignore
    return new Error(`invalid message: expected payload to be a bencode list of length 5`)
  }
}

function _validateSize(nativeMsg) {
  if (nativeMsg.length > 8192) {
    // prettier-ignore
    return new Error(`invalid message size: ${nativeMsg.length} bytes, must not be greater than 8192 bytes`)
  }
}

function _validateAuthor(authorBFE) {
  if (!Buffer.isBuffer) {
    return new Error(`invalid message: expected author to be a buffer`)
  }
  if (!BFE.isEncodedFeedBendybuttV1(authorBFE)) {
    // prettier-ignore
    return new Error(`invalid message: author is ${authorBFE.toString('hex')}, must be bendybutt v1 feed`)
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

/**
 * Validate a message in relation to the previous message on the feed.
 *
 * @param {Buffer} previousBFE - Message ID of the previous message on
 * the feed (`null` if `sequence` is `1`) encoded in BFE.
 * @param {Buffer | null} prevNativeMsg - Previous message value as an object
 * (`null` if `sequence` is `1`).
 * @returns {Object | undefined} Either an Error containing a message or an
 * `undefined` value for successful validation.
 */
function _validatePrevious(previousBFE, prevNativeMsg) {
  if (!Buffer.isBuffer(previousBFE)) {
    return new Error(`invalid message: expected previous to be a buffer`)
  }
  if (!BFE.isEncodedMessageBendybuttV1(previousBFE)) {
    // prettier-ignore
    return new Error(`invalid message: previous is "${previousBFE.toString('hex')}", expected a valid message identifier`)
  }
  if (!prevNativeMsg) {
    // prettier-ignore
    return new Error('invalid previousMsg: value must not be undefined if sequence > 1')
  }
  const prevMsgId = getMsgId(prevNativeMsg)
  if (!previousBFE.equals(BFE.encode(prevMsgId))) {
    // prettier-ignore
    return new Error(`invalid message: previousBFE is "${previousBFE.toString('hex')}" but previous message author is "${prevMsgId}", expected values to be identical`)
  }
}

function _validateSequence(sequence, prevNativeMsg) {
  if (!prevNativeMsg) {
    // prettier-ignore
    return new Error(`invalid message: sequence is ${sequence}, expected 1 because there is no previous message`)
  }
  const prevSequence = getSequence(prevNativeMsg)
  if (sequence !== prevSequence + 1) {
    // prettier-ignore
    return new Error(`invalid message: sequence is ${sequence} but prevMsg sequence is ${prevSequence}, expected sequence to be prevMsg.sequence + 1`)
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

function _validateFirstPrevious(previousBFE, prevNativeMsg) {
  if (!Buffer.isBuffer(previousBFE)) {
    return new Error(`invalid message: expected previous to be a buffer`)
  }
  if (!BFE.isEncodedGenericNil(previousBFE)) {
    // prettier-ignore
    return new Error(`invalid message: previous is "${previousBFE.toString('hex')}", expected a value of null because sequence is 1`)
  }
  if (prevNativeMsg) {
    // prettier-ignore
    return new Error('invalid message: sequence cannot be 1 if there exists a previous message')
  }
}

function _validateContentSection(contentSection) {
  if (!contentSection) {
    return new Error('invalid message: contentSection is missing')
  }
  if (!Array.isArray(contentSection) || contentSection.length !== 2) {
    // prettier-ignore
    return new Error('invalid message: contentSection should be an array with two items')
  }
  const [content, contentSignature] = contentSection
  if (!content || typeof content !== 'object') {
    // prettier-ignore
    return new Error('invalid message: content should be an object')
  }
  if (!Buffer.isBuffer(contentSignature)) {
    return new Error('invalid message: contentSignature should be a buffer')
  }
  if (!BFE.isEncodedSignatureMsgEd25519(contentSignature)) {
    // prettier-ignore
    return new Error('invalid message: contentSignature expected to be a valid BFE signature buffer')
  }
}

function _validateSignature(signatureBFE, authorBFE, payload, hmacKey) {
  if (!Buffer.isBuffer(signatureBFE)) {
    return new Error(`invalid message: expected signature to be a buffer`)
  }
  if (!BFE.isEncodedSignatureMsgEd25519(signatureBFE)) {
    // prettier-ignore
    return new Error(`invalid message: signature, expected a valid BFE signature buffer`)
  }
  const signature = signatureBFE.subarray(2)
  const public = authorBFE.subarray(2).toString('base64') + '.ed25519'
  const keys = { public, curve: 'ed25519' }
  const payloadBen = bencode.encode(payload)
  if (
    !ssbKeys.verify(keys, signature.toString('base64'), hmacKey, payloadBen)
  ) {
    // prettier-ignore
    return new Error('invalid message: signature by must correctly sign the payload')
  }
}

function validate(nativeMsg, prevNativeMsg, hmacKey, cb) {
  let err
  if ((err = _validateShape(nativeMsg))) return cb(err)
  if ((err = _validateHmac(hmacKey))) return cb(err)
  if ((err = _validateSize(nativeMsg))) return cb(err)

  const {
    authorBFE,
    sequence,
    previousBFE,
    timestamp,
    payload,
    contentSection,
    signatureBFE,
  } = extract(nativeMsg)

  if ((err = _validateAuthor(authorBFE))) return cb(err)

  if (sequence === 1) {
    if ((err = _validateFirstPrevious(previousBFE, prevNativeMsg)))
      return cb(err)
  } else {
    if ((err = _validatePrevious(previousBFE, prevNativeMsg))) return cb(err)
    if ((err = _validateSequence(sequence, prevNativeMsg))) return cb(err)
  }

  if ((err = _validateTimestamp(timestamp))) return cb(err)

  if ((err = _validateSignature(signatureBFE, authorBFE, payload, hmacKey)))
    return cb(err)

  if ((err = _validateContentSection(contentSection))) return cb(err)

  cb()
}

module.exports = { validate }
