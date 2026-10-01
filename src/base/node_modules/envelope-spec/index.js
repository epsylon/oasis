const bfe = require('ssb-bfe')

module.exports = {
  cloaked_msg_id: require('./cloaked_msg_id/constants.json'),
  derive_secret: require('./derive_secret/constants.json'),
  tfk: bfe.bfeTypes,
  bfe
}
