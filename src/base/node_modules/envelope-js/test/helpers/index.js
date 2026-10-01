const na = require('sodium-universal')

const decodeLeaves = require('./decode-leaves')
const encodeLeaves = require('./encode-leaves')
const print = require('./print')

module.exports = {
  FeedId,
  MsgId,
  PrevMsgId: MsgId,
  Key,

  decodeLeaves,
  encodeLeaves,
  print
}

function FeedId () {
  const type = Buffer.from([0]) // feed
  const format = Buffer.from([0]) // "classic"
  const id = Buffer.alloc(32)
  na.randombytes_buf(id)

  return Buffer.concat([type, format, id])
}

function MsgId () {
  const type = Buffer.from([1]) // message
  const format = Buffer.from([0]) // "classic"
  const id = Buffer.alloc(32)
  na.randombytes_buf(id)

  return Buffer.concat([type, format, id])
}

function Key () {
  const key = na.sodium_malloc(na.crypto_secretbox_KEYBYTES)
  na.randombytes_buf(key)

  return key
}
