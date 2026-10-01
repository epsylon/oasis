var pull = require('pull-stream')

var v = require('./')
var state = {
  queue: [],
  feeds: {},
  error: null
}

var c = 0, e = 0, start = Date.now()
require('ssb-client')(function (err, sbot) {
  if(err) throw err
  pull(
    sbot.createLogStream(),
    pull.drain(function (msg) {
      state = v.append(state, null, msg.value)
      if(state.error) {
        e++
        var err = state.error
        state.error = null
        console.log(err.message)
        return false
      }
      state.queue.shift()
      var s = ((Date.now() - start)/1000)
      if(!(c++%1000)) {
        console.log(s, e, c, c / s)
      }
      return true
    }, sbot.close)
  )
})
