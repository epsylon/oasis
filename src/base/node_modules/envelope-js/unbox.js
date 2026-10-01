/* eslint-disable camelcase */
const { Buffer } = require('buffer')
const na = require('sodium-universal')
const LABELS = require('envelope-spec/derive_secret/constants.json')

const { DeriveSecret, KeySlot } = require('./util')

const zerodNonce = Buffer.alloc(na.crypto_secretbox_NONCEBYTES)

function unbox (ciphertext, feed_id, prev_msg_id, trial_keys, opts = {}) {
  if (trial_keys.length === 0) return null

  const {
    maxAttempts = 8
  } = opts

  const derive = DeriveSecret(feed_id, prev_msg_id)
  const read_key = unboxKey(ciphertext, feed_id, prev_msg_id, trial_keys, { maxAttempts, derive })
  if (!read_key) return null

  return unboxBody(ciphertext, feed_id, prev_msg_id, read_key, { derive })
}

function unboxKey (ciphertext, feed_id, prev_msg_id, trial_keys, opts = {}) {
  if (trial_keys.length === 0) return null

  const {
    maxAttempts = 8,
    derive = DeriveSecret(feed_id, prev_msg_id)
  } = opts

  const header_box = ciphertext.slice(0, 32)
  const header = Buffer.alloc(16)

  const _maxAttempts = Math.min(
    maxAttempts,
    (ciphertext.length - 32 - 16) / 32 - 1
    // (ciphertext - header_box - body-hmac) / key_slot - 1
  )
  const msg_key = Buffer.alloc(32)

  const { unslot, setFlip } = KeySlot(derive)

  for (let i = 0; i < trial_keys.length; i++) {
    setFlip(trial_keys[i]) // hack which saves us some computation in #unslot below

    for (let j = 0; j < _maxAttempts; j++) {
      unslot(
        msg_key,
        ciphertext.slice(32 + j * 32, 32 + j * 32 + 32) // key_slot
      )

      // read_key
      //   └──> header_key
      const read_key = derive(msg_key, [LABELS.read_key])
      const header_key = derive(read_key, [LABELS.header_key])

      if (na.crypto_secretbox_open_easy(header, header_box, zerodNonce, header_key)) {
        return read_key
      }
    }
  }
}

function unboxBody (ciphertext, feed_id, prev_msg_id, read_key, opts = {}) {
  const {
    derive = DeriveSecret(feed_id, prev_msg_id)
  } = opts

  const header = Buffer.alloc(16)
  const header_box = ciphertext.slice(0, 32)
  const header_key = derive(read_key, [LABELS.header_key])
  na.crypto_secretbox_open_easy(header, header_box, zerodNonce, header_key)

  const offset = header.readUInt16LE(0)

  const body = Buffer.alloc(ciphertext.length - offset - 16)
  const body_box = ciphertext.slice(offset)
  const body_key = derive(read_key, [LABELS.body_key])
  na.crypto_secretbox_open_easy(body, body_box, zerodNonce, body_key)

  return body
}

module.exports = {
  unbox,
  unboxKey,
  unboxBody
}
