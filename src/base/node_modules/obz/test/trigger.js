const tape = require('tape')

module.exports = function (observable) {
  tape('set listener and trigger', function (t) {
    const o = observable()
    const value = Math.random(); let checked = 0
    const rm = o(function (_value) {
      checked++
      t.equal(_value, value)
    })

    t.equal(checked, 0)
    o.set(value)

    t.equal(checked, 1)

    o.set(value)

    t.equal(checked, 2)
    t.ok(rm)

    rm()

    o.set(Math.random())

    t.equal(checked, 2)
    t.end()
  })

  tape('set value before listener', function (t) {
    const o = observable()

    const value = Math.random(); let checked = 0

    o.set(value)

    const rm = o(function (_value) {
      t.equal(_value, value)
      checked++
    })

    t.equal(checked, 1)
    t.ok(rm)

    o.set(value)

    t.equal(checked, 2)

    rm()

    o.set(Math.random())

    t.equal(checked, 2)
    t.end()
  })

  tape('add listener within trigger', function (t) {
    const o = observable()

    const value = Math.random()
    let checked = 0

    o(function (_value) {
      checked++
      t.equal(_value, value)
      o(function (_value) {
        checked++
        t.equal(_value, value)
      })
      t.equal(checked, 2)
    })

    o.set(value)

    t.end()
  })

  tape('remove itself, simple', function (t) {
    const o = observable()
    t.plan(1)

    o(function (val) {
      t.equals(val, 10)
      return false
    })

    o.set(10)

    o.set(20)

    t.end()
  })

  tape('remove itself, complex', function (t) {
    const o = observable()
    t.plan(5)

    const remove = o(function (val) {
      t.equals(val, 10)
      return false
    })

    const expected = [10, 20]
    // 2nd listener remains functional after 1st listener is removed
    o(function (val) {
      t.true(expected.length > 0)
      t.equals(val, expected.shift())
    })

    o.set(10)

    remove() // should do nothing

    o.set(20)

    t.end()
  })

  tape('remove itself (immediately)', function (t) {
    const o = observable()

    o.set(10)

    o(function (val) {
      t.equals(val, 10)
      return false
    }, true)

    o.set(20)

    t.end()
  })

  tape('flatten recursion', function (t) {
    const o = observable()

    let checked = 1

    function recurse () {
      checked++
      if (checked < 3) { o.set(checked) }
    }

    let last, last2
    o(function (v) {
      console.log(last, v)
      if (last) t.ok(v > last, 'monotonic increasing listeners')
      last = v
    })
    o(recurse)
    o(function (v) {
      console.log(last2, v)
      if (last2) t.ok(v > last2, 'monotonic increasing listeners')
      last2 = v
    })

    o.set(checked)

    t.equal(checked, 3)
    t.end()
  })

  tape('bug', (t) => {
    t.plan(4)
    const o = observable()

    const a = o(() => {
      t.pass('first was called')
    })

    o(() => {
      t.pass('second was called')
      // This removes the previous listener, which changes the number of
      // listeners.
      a()
    })

    o(() => {
      t.pass('third was called')
      // `listeners.length` started at 3, but when the above listener removes
      // it reduces the listener count to 2. When Obv tries to run the third
      // listener (this one), it tries `listeners[2](value)`, which throws an
      // error because this listener now has an index of `1`.
    })

    try {
      o.set(42)
      t.pass('did not throw!')
    } catch (e) {
      t.fail(e)
    }
  })
}

if (
  !module.parent ||
  module.parent.path.endsWith('node_modules/tape/bin')
) module.exports(require('../'))
