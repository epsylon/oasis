
var tape = require('tape')
var pull = require('pull-stream')
var endable = require('../endable')

tape('simple', function (t) {

  t.plan(2)

  var e1 = endable(-1)
  var e2 = endable(-1)

  function onEnd () {
    console.log('on end')
  }

  pull(
    pull.values([1,2,3]),
    e1,
    pull.filter(function (n) {
      if(n !== -1) return true
      e2.end()
    }),
    pull.collect(function (err, ary) {
      if(err) throw err
      t.deepEqual(ary, [1,2,3])
    })
  )


  pull(
    pull.values([1,2,3]),
    e2,
    pull.filter(function (n) {
      if(n !== -1) return true
      e1.end()
    }),
    pull.collect(function (err, ary) {
      if(err) throw err
      t.deepEqual(ary, [1,2,3])
    })
  )
})
