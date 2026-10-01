


var tape = require('tape')
var Blocks = require('../blocks')
var File = require('../file')

var store = {}
var cache = {
  get: function (i) { return store[i] },
  set: function (i, v) { store[i] = v }
}

module.exports = function (reduce) {

  var filename = '/tmp/test_block-reader_'+Date.now()
  var blocks = reduce(null)

  var a = Buffer.alloc(32, 'a')
  var b = Buffer.alloc(32, 'b')
  var c = Buffer.alloc(32, 'c')
  var d = Buffer.alloc(32, 'd')
  var e = Buffer.alloc(24, 'e')
  var f = Buffer.alloc(64, 'f')

  tape('append one block', function (t) {
    blocks.append(a, function (err, offset) {
      if(err) throw err
      t.equal(offset, 32)
      blocks.read(0, 33, function (err, over, bytes) {
        t.ok(err)
        t.equal(bytes, 0)
        t.end()
      })

    })

  })


  tape('append another block', function (t) {
    blocks = reduce(blocks)
    blocks.append(b, function (err, offset) {
      if(err) throw err
      t.equal(offset, 64)
      t.end()
    })

  })

  tape('append a half block', function (t) {
    blocks = reduce(blocks)
    blocks.append(c.slice(0, 16), function (err, offset) {
      if(err) throw err
      t.equal(offset, 80)
      t.end()
    })

  })

  tape('read last block', function (t) {
    blocks = reduce(blocks)
    blocks.read(64, 80, function (err, _c) {
      console.log(blocks.offset.value)
      if(err) throw err
      console.log(_c)
      t.deepEqual(_c.slice(0, 16), c.slice(0, 16))
      t.end()
    })
  })

  tape('append another half block', function (t) {
    blocks = reduce(blocks) // Blocks(File(filename, 32, 'a+'), 32)
    blocks.append(c.slice(0, 16), function (err, offset) {
      if(err) throw err
      t.equal(offset, 96)

      blocks.read(64, 96, function (err, _c) {
        if(err) throw err
        console.log(_c)
        t.deepEqual(_c, c)
        t.end()
      })

    })
  })

  tape('appending in parallel throws', function (t) {
    blocks = reduce(blocks)
    blocks.append(a, function (err, offset) {
      if(err) throw err
      t.equal(offset, 128)
      t.end()
    })

    t.throws(function () {
      blocks.append(b, function (err, offset) {
        t.fail('should never be called')
      })
    })

  })

  tape('read in parallel with append', function (t) {
    store = {} //clear the cache
    blocks.offset.once(function (o) {
      blocks.append(c, function (err, _o) {
        t.equal(160, _o)
        t.end()
      })
      blocks.read(o, o+16, function (err, buf) {
        t.ok(err)
      })
    })

  })


  tape('append half block, then overlapping block', function (t) {
    blocks = reduce(blocks)
    blocks.append(e, function (err, offset) {
      if(err) throw err
      t.equal(offset, 184)
      blocks.read(144, 176, function (err, data) {
        if(err) throw err
        console.log(err, data)
        store = {}
        blocks.append(f, function (err, offset) {
          blocks.read(176, 180, function (err, data) {
            if(err) throw err
            console.log(err, data)
            if(err) throw err
            t.equal(offset, 248)
            console.log(store)
            t.end()
          })
        })
      })
    })
  })

  tape('truncate', function (t) {
    blocks = reduce(blocks)
    blocks.truncate(64, function (err, len) {
      if(err) throw err
      t.equal(blocks.offset.value, 64)
      t.equal(len, 64)

      blocks.read(0, 64, function (err, ab) {
        t.deepEqual(ab, Buffer.concat([a, b]))
        blocks.read(64, 96, function (err, _c, bytes) {
          t.ok(err)
          t.equal(bytes, 0)
          t.equal(_c, null)
          t.end()
        })
      })
    })
  })

}

if(!module.parent) {
  var filename = '/tmp/test_block-reader_'+Date.now()
  module.exports(function (b) {
    return b ? b : Blocks(File(filename, 32, 'a+'), 32)
  })
}






