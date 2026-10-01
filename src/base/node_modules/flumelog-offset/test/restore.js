
var fs = require('fs')
var tape = require('tape')
var crypto = require('crypto')
var OffsetLog = require('../')
var pull = require('pull-stream')
var offsetCodecs = require('../frame/offset-codecs')

tape('Create, break and restore', function(t) {
  test(t, '32bit', {offsetCodec: offsetCodecs[32]})
  test(t, '48bit', {offsetCodec: offsetCodecs[48]})
  test(t, '53bit', {offsetCodec: offsetCodecs[53]})
})

function test(t, name, opts) {
  var file = '/tmp/flumelog_restore_'+name+Date.now()
  var n = 13, ary = [], since
  while(n--)
    ary.push(crypto.randomBytes(17))

  t.test(name +' setup', function (t) {
    var log = OffsetLog(file, Object.assign({blockSize: 23}, opts))

    log.since.once(function (value) {
      t.equal(value, -1)
      log.append(ary, function (err, value) {
  //      t.equal(log.since.value, 1024*9 + 9*12 + 4)
        console.log('after append: since=' + log.since.value)
        log.get(log.since.value, function (err, value) {
          if(err) throw err
          t.deepEqual(value, ary[ary.length-1])

          pull(
            log.stream(),
            pull.collect(function (err, _ary) {
              if(err) throw err
              t.deepEqual(ary, _ary.map(function (e) { return e.value }))
              since = log.since.value
              t.end()
            })
          )

        })
      })

    })
  })

  t.test(name + ' restore, valid', function (t) {

    var log = OffsetLog(file, Object.assign({blockSize: 23}, opts))

    log.since(function (v) {
      t.equal(v, since)
      t.end()
    })
  })

  t.test(name + ' truncate', function (t) {
    fs.stat(file, function (err, stat) {
      if(err) throw err
      fs.readFile(file, function (err, buf) {
        if(err) throw err
        var slice = stat.size - ~~(ary[ary.length-1].length/2)
        console.log('slice at:', slice)
        fs.truncate(file, slice, function (err) {
          if(err) throw err
          t.end()
        })
      })

    })
  })


  var end = null
  t.test(name + ' restore', function (t) {
    var log = OffsetLog(file, Object.assign({blockSize: 23}, opts))
    log.since.once(function (v) {
      t.ok(v < since)
      t.ok(v > 0)
      end = v
      pull(
        log.stream(),
        pull.collect(function (err, _ary) {
          if(err) throw err
          t.deepEqual(ary.slice(0, ary.length-1), _ary.map(function (e) { return e.value }))
          since = log.since.value
          t.end()
        })
      )

    })
  })


  t.test(name = ' restore, again', function (t) {
    var log = OffsetLog(file, Object.assign({blockSize: 23}, opts))
    log.since.once(function (v) {
      t.equal(v, end)
      t.end()
    })
  })

}




