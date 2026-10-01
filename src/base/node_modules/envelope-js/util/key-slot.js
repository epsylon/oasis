/* eslint-disable camelcase */
const xor = require('buffer-xor/inplace')
const labels = require('envelope-spec/derive_secret/constants.json')

module.exports = function KeySlot (derive) {
  if (typeof derive !== 'function') throw new Error(`KeySlot requires a derive function, got: '${typeof derive}'`)

  function slot (key_slot, msg_key, recipient) {
    msg_key.copy(key_slot)

    xor(key_slot, flip(recipient))
  }

  let _flip = null
  function setFlip (recipient) {
    _flip = flip(recipient)
  }

  function unslot (msg_key, key_slot, recipient) {
    if (_flip) _flip.copy(msg_key)
    else flip(recipient).copy(msg_key)

    xor(msg_key, key_slot)
  }

  function flip (recipient) {
    if (!recipient.key) throw new Error('envelope/key-slot: recipient is expected to have a key')
    if (!recipient.scheme) throw new Error('envelope/key-slot: recipient is expected to have a scheme')

    // TODO complain here if recipient is wrong format, as the error is hard to decipher
    return derive(recipient.key, [labels.slot_key, recipient.scheme])
  }

  return {
    slot,
    setFlip,
    unslot
  }
}
