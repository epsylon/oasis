const bfe = require('ssb-bfe')

const TF = bfe.toTF('encryption-key', 'box2-dm-dh')

module.exports = function isKeyDM (bfeId) {
  return (
    bfeId.length === 34 &&
    bfeId.slice(0, 2).equals(TF)
  )
}
