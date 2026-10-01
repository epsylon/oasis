const bfe = require('ssb-bfe')

const POBOX_TF = bfe.toTF('identity', 'po-box')

// TODO find a good home for this
module.exports = function isPOBox (id) {
  // NOTE ssb-uri cannot use is-canonical-base64 because of substitutions!
  try {
    const bfeId = bfe.encode(id)

    return (
      bfeId.length === 34 &&
      bfeId.slice(0, 2).equals(POBOX_TF)
    )
  } catch (err) {
    return false
  }
}
