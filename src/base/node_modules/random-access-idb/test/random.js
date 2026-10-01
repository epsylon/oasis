var test = require('tape')
var rai = require('../')('testing-' + Math.random(), { size: 256 })
var ram = require('random-access-memory')
var randombytes = require('randombytes')
var bequal = require('buffer-equals')
var balloc = require('buffer-alloc')

test('random', function (t) {
  var nwrites = 500, nreads = 500
  t.plan(2 + nwrites*2 + nreads)
  var istore = rai('cool.txt')
  var mstore = ram('cool.txt')

  ;(function () {
    var zeros = balloc(5000+1000)
    var pending = 2
    istore.write(0, zeros, function (err) {
      t.ifError(err)
      if (--pending === 0) write(0)
    })
    mstore.write(0, zeros, function (err) {
      t.ifError(err)
      if (--pending === 0) write(0)
    })
  })()

  function write (i) {
    if (i === nwrites) return read(0)
    var offset = Math.floor(Math.random() * 5000)
    var buf = randombytes(Math.floor(Math.random() * 1000))
    var pending = 2
    istore.write(offset, buf, function (err) {
      t.ifError(err)
      if (--pending === 0) write(i+1)
    })
    mstore.write(offset, buf, function (err) {
      t.ifError(err)
      if (--pending === 0) write(i+1)
    })
  }

  function read (i) {
    if (i === nreads) return 
    // 15% error rate, due to offset or length running past end of file
    var offset = Math.floor(Math.random() * 6500)
    var len = Math.floor(Math.random()*1000)
    var pending = 2, data = { mstore: null, istore: null }
    istore.read(offset, len, function (err, buf) {
      data.ierr = err
      data.istore = buf
      if (--pending === 0) check()
    })
    mstore.read(offset, len, function (err, buf) {
      data.merr = err
      data.mstore = buf
      if (--pending === 0) check()
    })
    function check () {
      if (data.merr || data.ierr) {
        t.ok((data.ierr && data.merr),
          'read: offset=' + offset + ', length=' + len)
      } else {
        t.ok(bequal(data.istore, data.mstore),
          'read: offset=' + offset + ', length=' + len)
      }
      read(i+1)
    }
  }
})
