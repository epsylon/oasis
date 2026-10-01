var tape = require('tape')
var m = require('../')

//map over each key in a pair of objects
tape('mergeKeys', function (t) {

  var a = {
    foo: true,
    bar: 1,
    baz: 'hello'
  }

  var b = {
    bar: 5,
    quxx: 'whatever'
  }

  var c = m.mergeKeys(a, b, function (v, w) {
    return w || v
  })

  t.deepEqual(c, {
    foo: true,
    bar: 5,
    baz: 'hello',
    quxx: 'whatever'
  })
  t.end()

})

tape('mergeArrays', function (t) {

  var a = [1,2,3]
  var b = [2,5,4]

  var c = m.mergeArrays(a, b, function (v, w, i) {
    return w || v
  })

  t.deepEqual(c, [1, 2, 3, 5, 4])
  t.end()
})

tape('mergeDeep', function (t) {

  var a = {
    foo: true,
    bar: 1,
    stuff: ['hi', 'hello', "g'day"],
    things: [2, 4, 8, 16],
    baz: 'hello'
  }

  var b = {
    bar: 5,
    stuff: ['ahoy', 'hi', "houdy"],
    quxx: 'whatever',
    things: [1, 4, 38]
  }

  var c = m.merge(a, b, function (v, w, i) {
    return w || v
  })

  t.deepEqual(c, {
    foo: true,
    bar: 5,
    stuff: ['hi', 'hello', "g'day", 'ahoy', 'houdy'],
    things: [2,4,8,16, 1, 38],
    baz: 'hello',
    quxx: 'whatever'
  })

  t.end()
})
