const pCont = require('pull-cont/source')

module.exports = function (sbot) {
  return function () {
    let next
    const ready = []
    let waiting = 0
    let done = 0

    return pCont(function (callback) {
      sbot.getVectorClock(function (err, clock) {
        if (err) return callback(err)
        const o = {}

        function get (k) {
          if (!Number.isInteger(o[k].seq)) { console.log(k, o[k]); throw new Error('not integer') }
          sbot.getAtSequence([k, o[k].seq], function (err, msg) {
            if (err) o[k].sync = true
            else {
              o[k].ready = msg.value
              o[k].reading = false
              o[k].seq = msg.value.sequence + 1
              ready.push(msg.value)

              if (isNaN(o[k].seq)) throw new Error('NaN:' + JSON.stringify(msg))
            }
            if (next) {
              const _next = next
              next = null
              _next()
            }
          })
        }

        for (const k in clock) {
          waiting++
          o[k] = { ready: false, reading: true, seq: 1 }
          get(k)
        }

        callback(null, function (abort, cb) {
          // find the oldest ready thing
          (function more () {
            if (!ready.length) {
              next = more // this should only happen at the end
              return
            }

            ready.sort((a, b) => b.timestamp - a.timestamp)

            const msg = ready.shift()
            o[msg.author].ready = null
            if (o[msg.author].seq <= clock[msg.author]) {
              get(msg.author)
            } else {
              console.log(done++, clock[msg.author])
              if (done === waiting) {
                const errOrEnd = true
                cb(errOrEnd)
                return
              }
            }
            cb(null, msg)
          })()
        })
      })
    })
  }
}
