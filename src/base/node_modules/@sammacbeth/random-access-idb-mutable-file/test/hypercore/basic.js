// @flow

var create = require("./helpers/create")
var crypto = require("hypercore/lib/crypto")
var tape = require("tape")
var hypercore = require("hypercore")
var bufferAlloc = require("buffer-alloc-unsafe")

tape("append", async function(t) {
  t.plan(8)

  var feed = await create({ valueEncoding: "json" })

  feed.append({
    hello: "world"
  })

  feed.append([
    {
      hello: "verden"
    },
    {
      hello: "welt"
    }
  ])

  feed.flush(function() {
    t.same(feed.length, 3, "3 blocks")
    t.same(feed.byteLength, 54, "54 bytes")

    feed.get(0, function(err, value) {
      t.error(err, "no error")
      t.same(value, { hello: "world" })
    })

    feed.get(1, function(err, value) {
      t.error(err, "no error")
      t.same(value, { hello: "verden" })
    })

    feed.get(2, function(err, value) {
      t.error(err, "no error")
      t.same(value, { hello: "welt" })
    })
  })
})

tape("flush", async function(t) {
  var feed = await create()

  feed.append("hello")

  feed.flush(function(err) {
    t.error(err, "no error")
    t.same(feed.length, 1, "1 block")
    t.end()
  })
})

tape("verify", async function(t) {
  t.plan(9)

  var feed = await create()
  var evilfeed = await create(feed.key, { secretKey: feed.secretKey })

  feed.append("test", function(err) {
    t.error(err, "no error")

    evilfeed.append("t\0st", function(err) {
      t.error(err, "no error")

      feed.signature(0, function(err, sig) {
        t.error(err, "no error")
        t.same(sig.index, 0, "0 signed at 0")

        feed.verify(0, sig.signature, function(err, success) {
          t.error(err, "no error")
          t.ok(success)
        })

        evilfeed.verify(0, sig.signature, function(err, success) {
          t.ok(!!err)
          t.ok(err instanceof Error)
          t.ok(!success, "fake verify failed")
        })
      })
    })
  })
})

tape("rootHashes", async function(t) {
  t.plan(9)

  var feed = await create()
  var evilfeed = await create(feed.key, { secretKey: feed.secretKey })

  feed.append("test", function(err) {
    t.error(err, "no error")

    evilfeed.append("t\0st", function(err) {
      t.error(err, "no error")

      var result = []

      feed.rootHashes(0, onroots)
      evilfeed.rootHashes(0, onroots)

      function onroots(err, roots) {
        t.error(err, "no error")
        t.ok(roots instanceof Array)
        result.push(roots)
        if (result.length < 2) return
        t.notEqual(result[0], result[1])
        t.equal(result[0].length, result[1].length)
        t.notEqual(Buffer.compare(result[0][0].hash, result[1][0].hash), 0)
      }
    })
  })
})

tape("pass in secret key", async function(t) {
  var keyPair = crypto.keyPair()
  var secretKey = keyPair.secretKey
  var key = keyPair.publicKey

  var feed = await create(key, { secretKey: secretKey })

  feed.on("ready", function() {
    t.same(feed.key, key)
    t.same(feed.secretKey, secretKey)
    t.ok(feed.writable)
    t.end()
  })
})

// tape("check existing key", async function(t) {
//   var feed = hypercore(storage)

//   feed.append("hi", function() {
//     var key = bufferAlloc(32)
//     key.fill(0)
//     var otherFeed = hypercore(storage, key)
//     otherFeed.on("error", function() {
//       t.pass("should error")
//       t.end()
//     })
//   })

//   function storage(name) {
//     if (storage[name]) return storage[name]
//     storage[name] = ram()
//     return storage[name]
//   }
// })

// tape("create from existing keys", function(t) {
//   t.plan(3)

//   var storage1 = storage.bind(null, "1")
//   var storage2 = storage.bind(null, "2")

//   var feed = hypercore(storage1)

//   feed.append("hi", function() {
//     var otherFeed = hypercore(storage2, feed.key, { secretKey: feed.secretKey })
//     var store = otherFeed._storage
//     otherFeed.close(function() {
//       store.open({ key: feed.key }, function(err, data) {
//         t.error(err)
//         t.equals(data.key.toString("hex"), feed.key.toString("hex"))
//         t.equals(data.secretKey.toString("hex"), feed.secretKey.toString("hex"))
//       })
//     })
//   })

//   function storage(prefix, name) {
//     var fullname = prefix + "_" + name
//     if (storage[fullname]) return storage[fullname]
//     storage[fullname] = ram()
//     return storage[fullname]
//   }
// })

tape("head", async function(t) {
  t.plan(6)

  var feed = await create({ valueEncoding: "json" })

  feed.head(function(err, head) {
    t.ok(!!err)
    t.ok(err instanceof Error)
    step2()
  })

  function step2() {
    feed.append(
      {
        hello: "world"
      },
      function() {
        feed.head(function(err, head) {
          t.error(err)
          t.same(head, { hello: "world" })
          step3()
        })
      }
    )
  }

  function step3() {
    feed.append(
      [
        {
          hello: "verden"
        },
        {
          hello: "welt"
        }
      ],
      function() {
        feed.head({}, function(err, head) {
          t.error(err)
          t.same(head, { hello: "welt" })
        })
      }
    )
  }
})

tape("append, no cache", async function(t) {
  t.plan(8)

  var feed = await create({ valueEncoding: "json", storageCacheSize: 0 })

  feed.append({
    hello: "world"
  })

  feed.append([
    {
      hello: "verden"
    },
    {
      hello: "welt"
    }
  ])

  feed.flush(function() {
    t.same(feed.length, 3, "3 blocks")
    t.same(feed.byteLength, 54, "54 bytes")

    feed.get(0, function(err, value) {
      t.error(err, "no error")
      t.same(value, { hello: "world" })
    })

    feed.get(1, function(err, value) {
      t.error(err, "no error")
      t.same(value, { hello: "verden" })
    })

    feed.get(2, function(err, value) {
      t.error(err, "no error")
      t.same(value, { hello: "welt" })
    })
  })
})

tape("onwrite", async function(t) {
  var expected = [
    { index: 0, data: "hello", peer: null },
    { index: 1, data: "world", peer: null }
  ]

  var feed = await create({
    onwrite: function(index, data, peer, cb) {
      t.same(
        { index: index, data: data.toString(), peer: peer },
        expected.shift()
      )
      cb()
    }
  })

  feed.append(["hello", "world"], function(err) {
    t.error(err, "no error")
    t.same(expected.length, 0)
    t.end()
  })
})

tape("close, emitter and callback", async function(t) {
  t.plan(3)
  var feed = await create()

  feed.on("close", function() {
    t.pass("close emitted")
  })

  feed.close(function(err) {
    t.error(err, "closed without error")
    t.pass("callback invoked")
  })

  feed.close(function() {
    t.end()
  })
})

tape("get batch", async function(t) {
  t.plan(2 * 3)

  var feed = await create({ valueEncoding: "utf-8" })

  feed.append(["a", "be", "cee", "d"], function() {
    feed.getBatch(0, 4, function(err, batch) {
      t.error(err)
      t.same(batch, ["a", "be", "cee", "d"])
    })
    feed.getBatch(1, 3, function(err, batch) {
      t.error(err)
      t.same(batch, ["be", "cee"])
    })
    feed.getBatch(2, 4, function(err, batch) {
      t.error(err)
      t.same(batch, ["cee", "d"])
    })
  })
})
