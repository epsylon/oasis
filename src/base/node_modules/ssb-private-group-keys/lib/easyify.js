const { isFeed: isClassicFeed } = require('ssb-ref')
const bfe = require('ssb-bfe')

const DHKeys = require('../diffie-hellman-keys')
const isPOBox = require('./is-po-box')

module.exports = function easyify (keyFn) {
  return function makeEasy (ssbKeys) {
    const x = {
      dh: new DHKeys(ssbKeys, { fromEd25519: true }).toBFE(),
      id: bfe.encode(ssbKeys.id)
    }

    return function makeKey (id) {
      let y
      if (isFeed(id)) {
        const bfeId = bfe.encode(id)
        const keys = {
          public: bfeId.slice(2).toString('base64')
          // secret: undefined
        }
        y = {
          dh: new DHKeys(keys, { fromEd25519: true }).toBFE(),
          id: bfeId
        }
      } else if (isPOBox(id)) {
        const poBox = bfe.encode(id)
        y = {
          dh: {
            public: Buffer.concat([
              Buffer.from([3, 1]),
              poBox.slice(2)
            ])
          },
          id: poBox
        }
      } else throw new Error('unknown key type: ' + id)

      return keyFn(
        x.dh.secret, x.dh.public, x.id,
        y.dh.public, y.id
      )
    }
  }
}

function isFeed (id) {
  return isClassicFeed(id) || id.startsWith('ssb:feed/')
}
