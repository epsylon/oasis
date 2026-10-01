/* eslint-disable camelcase */

const na = require('sodium-universal')
const hkdf = require('futoin-hkdf')
const { slp } = require('envelope-js')
const pgSpec = require('private-group-spec')

const { SHA256, easyify } = require('./lib')

const { SALT, INFO_CONTEXT } = pgSpec.constants.directMessages
const SCHEME = Buffer.from(pgSpec.keySchemes.feed_id_dm, 'utf8')

const hash = 'SHA256'
const length = 32
const salt = SHA256(SALT)

function directMessageKey (my_dh_secret, my_dh_public, my_feed, your_dh_public, your_feed) {
  const input_keying_material = Buffer.alloc(na.crypto_scalarmult_BYTES)
  na.crypto_scalarmult(
    input_keying_material,
    my_dh_secret.slice(2), // just the key part of TFK
    your_dh_public.slice(2) // just the key part of TFK
  )

  const info_context = Buffer.from(INFO_CONTEXT, 'utf8')
  const info_keys = [
    Buffer.concat([my_dh_public, my_feed]),
    Buffer.concat([your_dh_public, your_feed])
  ].sort()
  const info = slp.encode([info_context, ...info_keys])

  return {
    key: hkdf(input_keying_material, length, { salt, info, hash }),
    scheme: SCHEME
  }
}

directMessageKey.easy = easyify(directMessageKey)

module.exports = directMessageKey
