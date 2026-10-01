const pull = require('pull-stream')
const EBT = require('epidemic-broadcast-trees')
const Bounce = require('epidemic-broadcast-trees/bounce')
const ssbClient = require('ssb-client')

function createStream (onDone, cb) {
  console.log('messages/second, messages total, time elapsed')
  // let stream
  const createStream = EBT(
    function get (id, seq, cb) {
      // should never be called...
      throw new Error('not expecting to ever send anything')
    },
    function append (msg, cb) {
      stream.onAppend(msg)
      cb()
    }
  )
  const stream = createStream(
    {
      onChange: Bounce(function () {
        // var p = stream.progress()
        // console.log(p, stream.meta)
        // if(p.current === p.target)
        //   onDone(p)
      }, 1000),
      onRequest: function (id, seq) {
        stream.request(id, 0)
      }
    },
    cb
  )
  return stream
}

let opts = null
if (process.argv[2]) {
  opts = { remote: process.argv[2] }
}

ssbClient(null, opts, function (err, sbot) {
  if (err) throw err
  const ebt = createStream(function () {
    sbot.close()
  }, function (err) {
    if (err) throw err
    sbot.close()
  })

  const int = setInterval(function () {
    const p = ebt.progress()
    console.log(p, ebt.meta)
    if (p.target && p.current === p.target) {
      clearInterval(int)
      sbot.close(true)
    }
  }, 1000)

  pull(ebt, sbot.ebt.replicate({ version: 2 }, function (err) {
    if (err) throw err
    sbot.close()
  }), ebt)
})
