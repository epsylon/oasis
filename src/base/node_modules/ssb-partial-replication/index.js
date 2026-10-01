const pull = require('pull-stream')
const pullCont = require('pull-cont')
const sort = require('ssb-sort')

exports.name = 'partial-replication'
exports.version = require('./package.json').version
exports.manifest = {
  getFeed: 'source',
  getFeedReverse: 'source',
  getTangle: 'async',
  getMessagesOfType: 'source'
}
exports.permissions = {
  anonymous: {allow: Object.keys(exports.manifest)}
}

exports.init = function (sbot, config) {
  return self = {
    getFeed: function (opts) {
      // since createHistoryStream is already exposed, this does not leak private messages
      return pull(
        sbot.createHistoryStream(opts)
      )
    },

    getFeedReverse: function (opts) {
      return pull(
        pullCont(function(cb) {
          sbot.getVectorClock((err, latestSeq) => {
            if (err) throw err

            var seqStart = latestSeq[opts.id] ? latestSeq[opts.id] - opts.limit : 0
            if (seqStart < 0)
              seqStart = 0

            opts.seq = seqStart

            // since createHistoryStream is already exposed, this does not leak private messages
            cb(null, sbot.createHistoryStream(opts))
          })
        })
      )
    },

    getTangle: function(msgId, cb) {
      console.log("getting msg", msgId)
      if (!msgId) return cb("msg not found:" + msgId)

      if (!sbot.query) {
        const err = "ssb-query plugin not installed!"
        console.log(err)
        return cb(err)
      }

      sbot.get(msgId, (err, rootMsg) => {
        if (err) return cb(err)

        pull
        (
          sbot.query.read({
            query: [{
              $filter: {
                value: {
                  content: { root: msgId },
                }
              }
            }]
          }),
          pull.filter((msg) => {
            return msg.value.private !== true
          }),
          pull.collect((err, messages) => {
            if (err) return cb(err)

            cb(null, [rootMsg, ...sort(messages).map(m => m.value)])
          })
        )
      })
    },

    getMessagesOfType: function(opts)
    {
      // {id: feedId, type: string, seq: int?, limit: int?}
      if (!sbot.query) {
        const err = "ssb-query plugin not installed!"
        console.log(err)
        throw new Error(err)
      }

      if (!opts.id) throw new Error("id is required!")
      if (!opts.type) throw new Error("type is required!")

      let query = {
        timestamp: { $gt: 0 },
        author: opts.id,
        content: {
          type: opts.type
        }
      }

      if (opts.seq)
        query.sequence = { $gt: opts.seq }

      return pull(
        sbot.query.read({
          query: [{
            $filter: {
              value: query
            }
          }],
          limit: opts.limit
        }),
        pull.filter((msg) => {
          return msg.value.private !== true
        }),
        pull.map(msg => msg.value)
      )
    }
  }
}
