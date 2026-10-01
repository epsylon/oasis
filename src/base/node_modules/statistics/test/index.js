

var reduce = require('../')
var reduceMutate = require('../mutate')

var tape = require('tape')

tape('statistics as reduce', function (t) {

  var stats = [1,2,3].reduce(reduce)

  t.deepEqual(stats, {
    mean: 2,
    stdev: Math.sqrt((1*1+2*2+3*3)/3 - 2*2),

    sum: 1+2+3,
    count: 3,
    sqsum: 1*1+2*2+3*3
  })

  console.log(stats)

  t.end()
})

tape('statistics as reduce, with mutations', function (t) {

  var stats = [1,2,3].reduce(reduceMutate)

  t.deepEqual(stats, {
    mean: 2,
    stdev: Math.sqrt((1*1+2*2+3*3)/3 - 2*2),

    sum: 1+2+3,
    count: 3,
    sqsum: 1*1+2*2+3*3
  })

  console.log(stats)

  t.end()
})


tape('statistics as reduce, with mutations and references', function (t) {

  var init = reduceMutate.initial()

  var stats = [1,2,3].reduce(reduceMutate, init)

  t.deepEqual(stats, init)

  t.deepEqual(stats, {
    mean: 2,
    stdev: Math.sqrt((1*1+2*2+3*3)/3 - 2*2),

    sum: 1+2+3,
    count: 3,
    sqsum: 1*1+2*2+3*3
  })

  t.strictEqual(stats, init)
  console.log(stats)

  t.end()
})



