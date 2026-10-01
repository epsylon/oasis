/* eslint-disable camelcase */

const na = require('sodium-universal')
const hkdf = require('futoin-hkdf')
const { slp } = require('envelope-js')
const pgSpec = require('private-group-spec')

const { SHA256, easyify } = require('./lib')

const { SALT, INFO_CONTEXT } = pgSpec.constants.poBox
const SCHEME = Buffer.from(pgSpec.keySchemes.po_box, 'utf8')

const hash = 'SHA256'
const length = 32
const salt = SHA256(SALT)

function poBoxKey (x_dh_secret, x_dh_public, x_id, y_dh_public, y_id) {
  const input_keying_material = Buffer.alloc(na.crypto_scalarmult_BYTES)
  na.crypto_scalarmult(
    input_keying_material,
    x_dh_secret.slice(2), // just the data part of BFE
    y_dh_public.slice(2) // just the data part of BFE
  )

  const info_context = Buffer.from(INFO_CONTEXT, 'utf8')
  const info_keys = [
    Buffer.concat([x_dh_public, x_id]),
    Buffer.concat([y_dh_public, y_id])
  ].sort()
  const info = slp.encode([info_context, ...info_keys])

  return {
    key: hkdf(input_keying_material, length, { salt, info, hash }),
    scheme: SCHEME
  }
}

poBoxKey.easy = easyify(poBoxKey)

module.exports = poBoxKey
