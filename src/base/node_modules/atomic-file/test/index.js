
var tape = require('tape')

var Atomic = require('../')


var filename = '/tmp/test_atomic_file'+Date.now()+'.json'
var atomic = Atomic(filename, '~')

tape('test, no file', function (t) {

  atomic.get(function (err, value) {
    t.ok(err)
    atomic.set({okay: true}, function (err) {
      if(err) throw err
      atomic.get(function (err, value) {
        if(err) throw err
        t.deepEqual(value, {okay: true})
        t.end()
      })
    })
  })

})

//use a second reader to check what the state _really is_
//normally you would _not_ access it like this
//this is only in the test, though
tape('test written', function (t) {
  var atomic2 = Atomic(filename, '~')
  atomic2.get(function (err, value) {
    if(err) throw err
    t.deepEqual(value, {okay: true})
    t.end()
  })
})

tape('destroy', function (t) {
  atomic.destroy(function (err) {
    if(err) throw err
    atomic.get(function (err, value) {
      t.notOk(value)
      t.end()
    })
  })
})

tape('test destroyed', function (t) {
  var atomic3 = Atomic(filename, '~')
  atomic3.get(function (err, value) {
    t.ok(err)
    t.end()
  })
})



tape('single write', function (t) {

  var called = 0

  var r1 = {random: Math.random()}
  var r2 = {random: Math.random()}
  console.log(r1, r2)
  atomic.set(r1, function (err) {
    if(err) throw err
    t.equal(++called, 1)
    console.log("SET1")
    atomic.get(function (err, val) {
      if(err) throw err
      t.deepEqual(val, r1)
    })
  })

  atomic.set(r2, function (err) {
    if(err) throw err
    console.log("SET2")
    t.equal(++called, 2)
    atomic.get(function (err, val) {
      if(err) throw err
      t.deepEqual(val, r2)
      t.end()
    })
  })
})







