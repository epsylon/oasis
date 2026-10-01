/* eslint-disable camelcase */
const { Buffer } = require('buffer')
const na = require('sodium-universal')
const LABELS = require('envelope-spec/derive_secret/constants.json')

const { DeriveSecret, KeySlot, error } = require('./util')
const zerodNonce = Buffer.alloc(na.crypto_secretbox_NONCEBYTES)
const zerodMsgKey = Buffer.alloc(na.crypto_secretbox_KEYBYTES)

module.exports = function box (plain_text, feed_id, prev_msg_id, msg_key, recp_keys) { // TODO opts = {}
  if (!plain_text.length) throw error('boxEmptyPlainText')
  if (msg_key.equals(zerodMsgKey)) throw error('boxZerodMsgKey')

  const derive = DeriveSecret(feed_id, prev_msg_id)

  // read_key
  //   ├──> header_key
  //   └──> body_key
  const read_key = derive(msg_key, [LABELS.read_key])
  const header_key = derive(read_key, [LABELS.header_key])
  const body_key = derive(read_key, [LABELS.body_key])

  const offset = (
    32 + //               // header_box
    recp_keys.length * 32 // key_slots
    // ??                 // TODO - extensions section
  )

  const ciphertext = Buffer.alloc(
    offset + // length of bytes before body_box
    plain_text.length + 16 // body_box = body + HMAC
  )

  /* header_box */
  const header_box = ciphertext.slice(0, 32)
  const header = header_box.slice(16)
  header.writeUInt16LE(offset, 0)
  /* TODO
     header.write...(flags, 2)
     header.write...(header_extensions, 3)
  */

  na.crypto_secretbox_easy(header_box, header, zerodNonce, header_key)

  /* key_slots */
  const { slot } = KeySlot(derive)
  recp_keys.forEach((recp, i) => {
    slot(ciphertext.slice(32 + 32 * i, 64 + 32 * i), msg_key, recp)
  })

  /* TODO
  extentions
  */

  /* body_box */
  const body_box = ciphertext.slice(offset)
  na.crypto_secretbox_easy(body_box, plain_text, zerodNonce, body_key)

  return ciphertext
}
