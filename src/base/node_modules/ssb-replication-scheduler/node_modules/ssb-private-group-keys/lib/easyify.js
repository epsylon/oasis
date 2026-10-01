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
        const yId = bfe.encode(id)
        y = {
          dh: new DHKeys({ public: yId.slice(2) }, { fromEd25519: true }).toBFE(),
          id: yId
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
