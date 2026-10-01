const pull = require('pull-stream')
const validate = require('ssb-validate')
const ssbClient = require('ssb-client')

let state = {
  queue: [],
  feeds: {}
}

ssbClient(function (err, sbot) {
  if (err) console.error(err)
  let n = 0
  let ts = Date.now()
  const start = Date.now()
  pull(
    sbot.ebt._dump(),
    pull.drain(function (msg) {
      state = validate.append(state, msg)
      let _ts
      n++
      if ((_ts = Date.now()) > ts + 1000) {
        console.log(Object.keys(state.feeds).length, state.queue.length)
        console.log(n, n / ((Date.now() - start) / 1000))
        ts = _ts
      }
    }, sbot.close)
  )
})
