

var tape = require('tape')

module.exports = function (create) {

  tape('simple', function (t) {
    var value, called = false, cb

    var async = create(function (_value, _cb) {
      value = _value; cb = _cb
    })
    t.equal(async.writing, false)

    async.onDrain = function () {
      called = true
    }

    async.write(1)
    t.equal(async.writing, true, 'is writing')

    cb()
    t.equal(value, 1)
    t.equal(async.writing, false)
    t.equal(called, true, 'onDrain called')
    t.end()
  })

  tape('call 3 times', function (t) {
    var value, called = false, cb, called = 0, onDrainCalled = 0

    var async = create(function (_value, _cb) {
      called ++
      value = _value; cb = _cb
    })
    t.equal(async.writing, false)

    async.onDrain = function () {
      onDrainCalled ++
    }

    async.write(1)
    t.equal(async.writing, true, 'is writing')
    async.write(2)
    async.write(3)
    console.log('WRITING')
    t.equal(async.writing, true, 'is writing')

    cb()
    console.log('not yet drained')
    t.equal(async.writing, true, 'is writing')
    t.equal(onDrainCalled, 0, 'onDrain called')

    //should trigger the 2nd write.
    console.log("CB")
    cb()
    console.log('now drained')

    t.equal(value, 3, 'written=3')
    t.equal(async.writing, false, 'not writing')
    t.equal(onDrainCalled, 1, 'onDrain called')
    t.end()
  })
}

