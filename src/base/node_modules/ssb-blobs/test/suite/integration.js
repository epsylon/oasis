const debug = require('debug')('ssb-blobs')
const tape = require('tape')
const pull = require('pull-stream')
const bitflipper = require('pull-bitflipper')

const u = require('../util')
const Fake = u.fake
const hash = u.hash

module.exports = function (createBlobs, createAsync, groupName = '?') {
  // NOTE: for the suite-async tests the createAsync function
  // makes 100x copies of the tests and tries different callback timings
  // to see if it this effects results
  const PLAN_SCALAR = groupName === 'ASYNC' ? 100 : 1

  // function log (name) {
  //   if(LOGGING)
  //     return pull.through(function (e) {
  //       debug(name, e)
  //     })
  //   else
  //     return pull.through()
  // }

  tape(groupName + '/integration - want, has', function (t) {
    t.plan(PLAN_SCALAR)

    createAsync(function (async) {
      const alice = createBlobs('alice', async)
      const bob = createBlobs('bob', async)
      const blob = Fake('foobar', 64)
      const h = hash(blob)

      u.peers('alice', alice, 'bob', bob)

      alice.want(h, function (err, has) {
        if (err) throw err
        debug('ALICE has?', h, has)
        alice.has(h, function (err, has) {
          debug('ALICE has!', h, has)
          if (err) throw err
          t.ok(has)
          async.done()
        })
      })

      pull(pull.once(blob), bob.add())
    }, function done (err) {
      if (err) throw err
    })
  })

  tape(groupName + '/integration - want, has 2', function (t) {
    t.plan(PLAN_SCALAR)

    createAsync(function (async) {
      const alice = createBlobs('alice', async)
      const bob = createBlobs('bob', async)
      const blob = Fake('foobar', 64)
      const h = hash(blob)

      u.peers('bob', bob, 'alice', alice)
      pull(pull.once(blob), bob.add())

      alice.want(h, function (err, has) {
        if (err) throw err
        alice.has(h, function (err, has) {
          if (err) throw err
          t.ok(has)
          async.done()
        })
      })
    }, function (err) {
      if (err) throw err
    })
  })

  tape(groupName + '/integration - want, want, has', function (t) {
    t.plan(PLAN_SCALAR)

    createAsync(function (async) {
      const alice = createBlobs('alice', async)
      const bob = createBlobs('bob', async)
      const carol = createBlobs('carol', async)

      const blob = Fake('baz', 64)
      const h = hash(blob)

      u.peers('alice', alice, 'bob', bob)
      u.peers('bob', bob, 'carol', carol)

      alice.want(h, function (err, has) {
        if (err) throw err
        alice.has(h, function (err, has) {
          if (err) throw err
          t.ok(has)
          async.done()
        })
      })

      pull(pull.once(blob), carol.add())
    }, function (err) {
      if (err) throw err
    })
  })

  tape(groupName + '/integration - peers want what you have', function (t) {
    t.plan(PLAN_SCALAR)

    createAsync(function (async) {
      if (Array.isArray(process._events.exit)) { debug(process._events.exit.reverse()) }
      const alice = createBlobs('alice', async)
      const bob = createBlobs('bob', async)
      const carol = createBlobs('carol', async)

      const blob = Fake('baz', 64)
      const h = hash(blob)

      u.peers('alice', alice, 'bob', bob)
      u.peers('bob', bob, 'carol', carol)

      pull(
        carol.changes(),
        pull.drain(function (_h) {
          t.equal(_h, h)
          async.done()
        })
      )

      alice.want(h, function () {})
      pull(
        pull.once(blob),
        alice.add()
      )
    }, function (err) {
      if (err) throw err
    })
  })

  tape(groupName + '/integration - triangle', function (t) {
    t.plan(PLAN_SCALAR)

    createAsync(function (async) {
      const alice = createBlobs('alice', async)
      const bob = createBlobs('bob', async)
      const carol = createBlobs('carol', async)

      const blob = Fake('baz', 64)
      const h = hash(blob)

      u.peers('alice', alice, 'bob', bob)
      u.peers('bob', bob, 'carol', carol)

      pull(
        bob.changes(),
        pull.drain(function (_h) {
          t.equal(_h, h)
          async.done()
        })
      )

      pull(pull.once(blob), alice.add())
      pull(pull.once(blob), carol.add())

      bob.want(h, function () {})
    }, function (err) {
      if (err) throw err
    })
  })

  tape(groupName + '/integration - corrupt', function (t) {
    t.plan(PLAN_SCALAR)

    createAsync(function (async) {
      const alice = createBlobs('alice', async)
      const bob = createBlobs('bob', async)
      const carol = createBlobs('carol', async)

      // everything that comes from bob is corrupt
      const get = alice.get
      alice.get = function (id) {
        return pull(get(id), bitflipper(1))
      }

      const blob = Fake('baz', 64)
      const h = hash(blob)

      u.peers('alice', alice, 'bob', bob)
      u.peers('bob', bob, 'carol', carol)

      pull(
        bob.changes(),
        pull.drain(function (_h) {
          debug('HAS', _h)
          t.equal(_h, h)
          async.done()
        })
      )

      bob.want(h, function () {})
      pull(pull.once(blob), alice.add())
      pull(pull.once(blob), carol.add())
    }, function (err) {
      if (err) throw err
    })
  })

  tape(groupName + '/integration - cycle', function (t) {
    t.plan(PLAN_SCALAR)

    createAsync(function (async) {
      const alice = createBlobs('alice', async)
      const bob = createBlobs('bob', async)
      const carol = createBlobs('carol', async)
      const dan = createBlobs('dan', async)
      u.peers('alice', alice, 'bob', bob)
      u.peers('bob', bob, 'carol', carol)
      u.peers('carol', carol, 'dan', dan)
      u.peers('dan', dan, 'alice', alice)

      const blob = Fake('gurg', 64)
      const h = hash(blob)
      alice.want(h, function (err, has) {
        if (err) throw err
        t.ok(true)
        // NOTE! this currently only tests there are no errors thrown?
        async.done()
      })

      pull(pull.once(blob), dan.add(h))
    }, function (err) {
      if (err) throw err
    })
  })
}
