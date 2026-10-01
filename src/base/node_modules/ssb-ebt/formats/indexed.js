const indexed = require('ssb-index-feeds/format')
const ebtFormatFrom = require('./base')

module.exports = {
  ...ebtFormatFrom(indexed),

  appendMsg(sbot, msgTuple, cb) {
    if (Array.isArray(msgTuple) && msgTuple.length === 2) {
      const [msgVal, payload] = msgTuple
      const payloadKey = msgVal.content.indexed
      sbot.db.get(payloadKey, (err) => {
        if (err) {
          if (err.message.indexOf('not found') > -1) {
            // Payload not found, so add it
            sbot.db.addTransaction([msgVal], [payload], cb)
          } else {
            // Some actual error
            cb(err)
          }
        } else {
          // Payload found, so add only the indexed-v1 msg
          sbot.db.add(msgVal, this.appendOpts, cb)
        }
      })
    } else {
      cb(new Error('Invalid index feed message tuple received by ssb-ebt'))
    }
  },

  getAtSequence(sbot, pair, cb) {
    sbot.getAtSequence([pair.id, pair.sequence], (err, indexMsg) => {
      if (err) return cb(err)
      sbot.db.get(indexMsg.value.content.indexed, (err, payload) => {
        if (err) return cb(err)
        cb(null, [indexMsg.value, payload])
      })
    })
  },
}
