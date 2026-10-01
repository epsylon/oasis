var test = require("tape")

var series = require("../index")

test("series: applies recursively", function (assert) {
  var called = {}
  function check(name) {
    return function (cb) {
      console.log('called', name)
      called[name] = true
      cb(null, name)
    }
  }

  var cont = series([check('a'), check('b'), check('c')])

  assert.equal(typeof cont, 'function')

  cont(function (err) {
    assert.deepEqual(called, {a: true, b: true, c: true})
    assert.end()
  })

})

test("series: turn into array by defaut", function (assert) {
  var called = {}
  function check(name) {
    return function (cb) {
      console.log('called', name)
      called[name] = true
      cb(null, name)
    }
  }

  var cont = series(check('a'), check('b'), check('c'))

  assert.equal(typeof cont, 'function')

  cont(function (err) {
    assert.deepEqual(called, {a: true, b: true, c: true})
    assert.end()
  })

})

test("series: works with callback", function (assert) {
  var counter = 0

  series([
    function (cb) { counter++; cb(null) },
    function (cb) { counter++; cb(null) },
    function (cb) { counter++; cb(null, counter * 2) }
  ], function (err, results) {
    assert.ifError(err)

    assert.equal(counter, 3)
    assert.equal(results, 6)

    assert.end()
  })
})

test("series: works with callback<Error>", function (assert) {
  var counter = 0

  series([
    function (cb) { counter++; cb(null) },
    function (cb) { counter++; cb(new Error("oops")) },
    function (cb) { counter++; cb(null, counter * 2) }
  ], function (err, results) {
    assert.equal(err.message, "oops")
    assert.equal(results, undefined)

    assert.end()
  })
})


