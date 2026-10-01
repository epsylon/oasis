var Log = require('../')
var pull = require('pull-stream')
var tape = require('tape')

var log = Log('/tmp/test_offset-log_'+Date.now(), {blockSize: 1024})

function encode (obj) {
  return Buffer.from(JSON.stringify(obj))
}

function decode (b) {
  return JSON.parse(b.toString())
}

tape('stream on an empty database', function (t) {
  pull(
    log.stream(),
    pull.collect(function (err, ary) {
      t.notOk(err)
      t.deepEqual(ary, [])
      t.end()
    })
  )
})

tape('append objects, and stream them out the same', function (t) {

  var n = 4
  var a = [
    {foo: true, bar: false, r: Math.random()},
    {foo: true, bar: true, r: Math.random()},
    {foo: false, bar: true, r: Math.random()},
    {foo: false, bar: false, r: Math.random()}
  ]

  var ary = []

  log.append(encode(a[0]), next)
  log.append(encode(a[1]), next)
  log.append(encode(a[2]), next)
  log.append(encode(a[3]), next)

  function next () {
    if(--n) return
    pull(
      log.stream({keys:true, values: true}),

      pull.map(function (data) {
        if(data.sync) return data
        return {key: data.key, value: decode(data.value)}
      }),
      pull.through(console.log),
      pull.collect(function (err, a) {
        if(err) throw err
        t.deepEqual(ary, a)
        t.end()
      })
    )
  }

  pull(
    log.stream({live: true, keys: true, values: true, sync: false}),
    pull.map(function (data) {
      if(data.sync) return data
      return {key: data.key, value: decode(data.value)}
    }),
    pull.drain(function (data) {
      ary.push(data)
    })
  )
})
