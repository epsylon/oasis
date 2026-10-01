const tape = require('tape')

module.exports = function (observable) {
  tape('once', function (t) {
    const o = observable()
    let fired = 0
    o.once(function (v) {
      fired++
      t.equal(v, 1)
    })

    o.set(1)

    o.once(function (v) {
      fired++
      t.equal(v, 2)
    }, false)

    o.once(function (v) {
      fired++
      t.equal(v, 1)
    })

    t.equal(fired, 2)

    o.set(2)
    o.set(3)

    t.equal(fired, 3)

    t.end()
  })

  tape('once, !immediately, inside trigger', function (t) {
    const o = observable()
    let fired = 0
    o.once(function (v) {
      t.equal(v, 1)
      fired++
      o.once(function (v) {
        fired++
        t.equal(v, 2)
      }, false)
    })

    o.set(1)
    t.equal(fired, 1)
    o.set(2)
    t.equal(fired, 2)
    t.end()
  })

  tape('once, remove', function (t) {
    const o = observable()

    const remove = o.once(function (v) {
      t.fail('should not fire')
    })

    remove()
    o.set('dog')

    t.end()
  })
}

if (
  !module.parent ||
  module.parent.path.endsWith('node_modules/tape/bin')
) module.exports(require('../'))
