module.exports = function ebtFormatFrom(feedFormat) {
  return {
    name: feedFormat.name,

    // used in request, block, cleanClock, sbot.post, vectorClock
    isFeed(feedId) {
      return feedFormat.isAuthor(feedId)
    },

    getAtSequence(sbot, pair, cb) {
      if (sbot.getAtSequenceNativeMsg) {
        sbot.getAtSequenceNativeMsg(
          [pair.id, pair.sequence],
          feedFormat.name,
          (err, nativeMsg) => {
            if (err) cb(err)
            else cb(null, nativeMsg)
          }
        )
      } else {
        sbot.getAtSequence([pair.id, pair.sequence], (err, msg) => {
          if (err) cb(err)
          else cb(null, msg.value)
        })
      }
    },

    appendOpts: { feedFormat: feedFormat.name },

    appendMsg(sbot, msgVal, cb) {
      function done(err) {
        if (err && err.fatal) cb(err)
        else cb()
      }
      if (sbot.db) {
        sbot.db.add(msgVal, this.appendOpts, done)
      } else {
        sbot.add(msgVal, done)
      }
    },

    // used in ebt:stream to distinguish between messages and notes
    isMsg: feedFormat.isNativeMsg,

    // used in ebt:events
    getMsgAuthor: feedFormat.getFeedId,

    // used in ebt:events
    getMsgSequence: feedFormat.getSequence,
  }
}
