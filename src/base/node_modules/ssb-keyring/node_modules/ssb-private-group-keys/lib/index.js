const crypto = require('crypto')

module.exports = {
  SHA256 (input) {
    const hash = crypto.createHash('sha256')

    hash.update(input)
    return hash.digest()
  },
  easyify: require('./easyify'),
  isPOBox: require('./is-po-box'),
  isKeyDM: require('./is-key-dm'),
  isKeyPOBox: require('./is-key-po-box')
}
