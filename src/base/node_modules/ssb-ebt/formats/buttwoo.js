const buttwoo = require('ssb-buttwoo/format')
const ebtFormatFrom = require('./base')

module.exports = {
  ...ebtFormatFrom(buttwoo),

  appendOpts: { encoding: 'bipf', feedFormat: buttwoo.name },

  // Optimization
  isMsg(bufferOrMsgVal) {
    return Buffer.isBuffer(bufferOrMsgVal)
  },
}
