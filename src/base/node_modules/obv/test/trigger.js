var tape = require('tape')

module.exports = function (observable) {

  tape('set listener and trigger', function (t) {
    var o = observable()
    var value = Math.random(), checked = 0
    var rm = o(function (_value) {
      checked ++
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

    var o = observable()

    var value = Math.random(),  checked = 0

    o.set(value)

    var rm = o(function (_value) {
      t.equal(_value, value)
      checked ++
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
    var o = observable()

    var value = Math.random(),  checked = 0, checking = false

    o(function (_value) {
      checked ++
      t.equal(_value, value)
      o(function (_value) {
        checked ++
        t.equal(_value, value)
      })
      t.equal(checked, 2)
    })

    o.set(value)

    t.end()
  })

  tape('flatten recursion', function (t) {

    var o = observable()

    var value = Math.random(),  checked = 1, checking = false

    function recurse () {
      checking = true
      checked ++
      if(checked < 3)
        o.set(checked)
      checking = false
    }

    var last, last2
    o(function (v) {
      console.log(last, v)
      if(last) t.ok(v > last, 'monotonic increasing listeners')
      last = v
    })
    o(recurse)
    o(function (v) {
      console.log(last2, v)
      if(last2) t.ok(v > last2, 'monotonic increasing listeners')
      last2 = v
    })



    o.set(checked)

    t.equal(checked, 3)
    t.end()
  })

  tape('once', function (t) {
    var o = observable()
    var fired = 0
    o.once(function (v) {
      fired ++
      t.equal(v, 1)
    })

    o.set(1)

    o.once(function (v) {
      fired ++
      t.equal(v, 2)
    }, false)

    o.once(function (v) {
      fired ++
      t.equal(v, 1)
    })

    t.equal(fired, 2)

    o.set(2)

    o.set(3)

    t.equal(fired, 3)

    t.end()

  })

  tape('once, !immediately, inside trigger', function (t) {

    var o = observable()
    var fired = 0
    o.once(function (v) {
      t.equal(v, 1)
      fired ++
      o.once(function (v) {
        fired ++
        t.equal(v, 2)
      }, false)
    })

    o.set(1)
    t.equal(fired, 1)
    o.set(2)
    t.equal(fired, 2)
    t.end()
  })
}

if(!module.parent) module.exports (require('../'))

