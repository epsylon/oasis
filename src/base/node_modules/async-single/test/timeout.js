

var tape = require('tape')

module.exports = function (create) {

  tape('simple', function (t) {
    var value, called = false, cb, fn

    var async = create(function (_value, _cb) {
      value = _value; cb = _cb
    }, {
      setTimeout:function (_fn, time) {
        fn = _fn
        return 1
      }
    })

    t.equal(async.writing, false)

    async.onDrain = function () {
      called = true
    }

    async.write(1)

    t.equal(async.writing, false, 'is writing')

    fn()

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
    }, {
      setTimeout: function (_fn) {
        fn = _fn
        return 1
      }
    })
    t.equal(async.writing, false)

    async.onDrain = function () {
      onDrainCalled ++
    }

    async.write(1)
    t.equal(async.writing, false, 'is not writing')
    async.write(2)
    async.write(3)
    console.log('WRITING')
    t.equal(async.writing, false, 'is not writing')

    fn()
    t.equal(async.writing, true, 'is writing')
    console.log('not yet drained')
    t.equal(async.writing, true, 'is writing')
    t.equal(onDrainCalled, 0, 'onDrain called')

    async.write(4)

    t.equal(async.writing, true, 'is writing')
    //timeout
//    fn()
    //should trigger the 2nd write.
    console.log("CB")
    cb()
    console.log('now drained')
    fn()
    cb()
    t.equal(value, 4, 'written=3')
    t.equal(async.writing, false, 'not writing')
    t.equal(onDrainCalled, 1, 'onDrain called')
    t.end()
  })

  tape('close', function (t) {

    var value, called = false, cb, fn

    var async = create(function (_value, _cb) {
      value = _value; cb = _cb
    }, function (_fn, time) {
      fn = _fn
      return 1
    })

    async.close(function () {
      t.end()
    })

  })

  tape('close', function (t) {

    var value, called = false, cb, fn

    var async = create(function (_value, _cb) {
      value = _value; cb = _cb
    }, {
      setTimeout: function (_fn, time) {
        fn = _fn
        return 1
      }
    })

    async.write(1)

    fn()
    t.equal(async.writing, true)
    cb()
    t.equal(async.writing, false)
    async.close(function () {
      t.end()
    })

  })

  tape('close', function (t) {

    var value, called = false, cb, fn

    var async = create(function (_value, _cb) {
      value = _value; cb = _cb
    }, {
      setTimeout: function (_fn, time) {
        console.log('timeout')
        fn = _fn
        return 1
      }
    })

    async.write(1)

    t.equal(async.writing, false)
    fn()
    t.equal(async.writing, true)
    async.write(2)

    async.close(function () {
      t.end()
    })
    cb()
    fn()
    cb()
  })

  tape('close, next write', function (t) {

    var value, called = false, cb, fn

    var async = create(function (_value, _cb) {
      value = _value; cb = _cb
    }, {
      setTimeout: function (_fn, time) {
        fn = _fn
        return 1
      }
    })

    async.write(1)

    t.equal(async.writing, false)
    fn()
    t.equal(async.writing, true)
    async.write(2)
    cb()

    async.close(function () {
      t.end()
    })

    fn()
    cb()

  })
}

