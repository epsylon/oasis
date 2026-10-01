const crypto = require('crypto')

const easyify = require('./easyify')
const isPOBox = require('./is-po-box')

module.exports = {
  SHA256 (input) {
    const hash = crypto.createHash('sha256')

    hash.update(input)
    return hash.digest()
  },
  easyify,
  isPOBox
}
