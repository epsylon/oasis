// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const classic = require('ssb-classic/format')
const { isIndexedV1FeedSSBURI } = require('ssb-uri2')
const getMsgId = require('./get-msg-id')
const { validate, validateBatch } = require('./validation')

module.exports = {
  name: 'indexed-v1',
  encodings: ['js'],

  isAuthor(feedId) {
    return typeof feedId === 'string' && isIndexedV1FeedSSBURI(feedId)
  },

  isNativeMsg(msgTuple) {
    if (Array.isArray(msgTuple) && msgTuple.length === 2) {
      const [indexMsg, payload] = msgTuple
      return (
        isIndexedV1FeedSSBURI(indexMsg.author) &&
        (payload === null || classic.isNativeMsg(payload))
      )
    } else return isIndexedV1FeedSSBURI(msgTuple.author)
  },

  getFeedId(msgTuple) {
    const indexMsg = Array.isArray(msgTuple) ? msgTuple[0] : msgTuple
    return indexMsg.author
  },

  getSequence(msgTuple) {
    const indexMsg = Array.isArray(msgTuple) ? msgTuple[0] : msgTuple
    return indexMsg.sequence
  },

  getMsgId,

  toPlaintextBuffer(opts) {
    return Buffer.from(JSON.stringify(opts.content), 'utf8')
  },

  newNativeMsg(opts) {
    const msgVal = classic.newNativeMsg(opts)
    const payload = opts.payload || null
    return [msgVal, payload]
  },

  fromNativeMsg(msgTuple, encoding = 'js') {
    if (encoding === 'js') {
      const indexMsg = Array.isArray(msgTuple) ? msgTuple[0] : msgTuple
      return indexMsg
    } else {
      // prettier-ignore
      throw new Error(`Feed format "indexed" does not support encoding "${encoding}"`)
    }
  },

  fromDecryptedNativeMsg(plaintextBuf, msgTuple, encoding = 'js') {
    if (encoding === 'js') {
      const indexMsg = Array.isArray(msgTuple) ? msgTuple[0] : msgTuple
      const content = JSON.parse(plaintextBuf.toString('utf8'))
      indexMsg.content = content
      return indexMsg
    } else {
      // prettier-ignore
      throw new Error(`Feed format "indexed" does not support encoding "${encoding}"`)
    }
  },

  toNativeMsg(msgVal, encoding = 'js') {
    if (encoding === 'js') {
      return msgVal
    } else {
      // prettier-ignore
      throw new Error(`Feed format "indexed" does not support encoding "${encoding}"`)
    }
  },

  validate,
  validateBatch,
}
