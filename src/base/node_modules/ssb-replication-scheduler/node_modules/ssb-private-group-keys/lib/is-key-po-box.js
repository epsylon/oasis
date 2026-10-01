const bfe = require('ssb-bfe')

const TF = bfe.toTF('encryption-key', 'box2-pobox-dh')

module.exports = function isKeyPOBox (bfeId) {
  return (
    bfeId.length === 34 &&
    bfeId.slice(0, 2).equals(TF)
  )
}
