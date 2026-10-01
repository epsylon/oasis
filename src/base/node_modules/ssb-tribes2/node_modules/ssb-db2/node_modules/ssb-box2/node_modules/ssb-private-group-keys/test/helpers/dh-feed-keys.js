const { generate } = require('ssb-keys')
const bfe = require('ssb-bfe')
const DHKeys = require('../../diffie-hellman-keys')

module.exports = function DHFeedKeys (keys) {
  const ssbKeys = keys || generate()

  return {
    dh: new DHKeys(ssbKeys, { fromEd25519: true }).toBFE(),
    feedId: bfe.encode(ssbKeys.id),
    sigilFeedId: ssbKeys.id
  }
}
