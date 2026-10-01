const { generate } = require('ssb-keys')
const bfe = require('ssb-bfe')
const DHKeys = require('../../diffie-hellman-keys')

module.exports = function DHFeedKeys (keys) {
  // this assumes we're taking ed25519 keys used for signing feed messages
  // and converting them to curve25519 keys used for encrypting

  const ssbKeys = keys || generate()

  return {
    dh: new DHKeys(ssbKeys, { fromEd25519: true }).toBFE(),
    feedId: bfe.encode(ssbKeys.id),
    sigilFeedId: ssbKeys.id
  }
}
