const ssbKeys = require('ssb-keys')
const bfe = require('ssb-bfe')

const DHFeedKeys = require('./dh-feed-keys')
const DHPOBoxKeys = require('./dh-po-box-keys')
const encodeLeaves = require('./encode-leaves')
const decodeLeaves = require('./decode-leaves')
const print = require('./print')

module.exports = {
  ssbKeys,
  bbKeys: {
    generate () {
      const keys = ssbKeys.generate()

      return {
        public: keys.public,
        secret: keys.private,

        id: bfe.decode(
          Buffer.concat([
            bfe.toTF('feed', 'bendybutt-v1'),
            Buffer.from(prune(keys.public), 'base64')
          ])
        )
      }
    }
  },
  DHFeedKeys,
  DHPOBoxKeys,
  encodeLeaves,
  decodeLeaves,
  print
}

function prune (key) {
  return key.replace('.ed25519', '')
}
