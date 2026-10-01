const debug = require('debug')('ssb-blobs')
const tape = require('tape')
const pull = require('pull-stream')
const cont = require('cont')
const u = require('../util')
const Fake = u.fake
const hash = u.hash

module.exports = function (createBlobs, createAsync, groupName = '?') {
  // NOTE: for the suite-async tests the createAsync function
  // makes 100x copies of the tests and tries different callback timings
  // to see if it this effects results
  const PLAN_SCALAR = groupName === 'ASYNC' ? 100 : 1

  /*
    push
      tell peers about a blob that you have,
    that you want other peers to want.

    stores pushed blobs in a durable log (eg: leveldb)
    so that after a restart, push will still happen.
    (incase you write a message offline, then restart)

  */

  tape(groupName + '/push - 3', function (t) {
    t.plan(PLAN_SCALAR * 2)

    createAsync(function (async) {
      const alice = createBlobs('alice', async)
      const bob = createBlobs('bob', async)
      const carol = createBlobs('carol', async)
      const dan = createBlobs('dan', async)

      const blob = Fake('baz', 64)
      const h = hash(blob)

      u.peers('alice', alice, 'bob', bob)
      u.peers('alice', alice, 'carol', carol)
      u.peers('alice', alice, 'dan', dan)

      pull(
        alice.pushed(),
        pull.drain((data) => {
          t.deepEqual(data, { key: h, peers: { bob: 64, carol: 64, dan: 64 } })
          debug('PUSHED', data)
          cont.para([bob, carol, dan].map(p => cont(p.has)(h)))((err, ary) => {
            if (err) throw err
            debug('HAS', err, ary)
            if (err) throw err
            t.deepEqual(ary, [true, true, true])
            async.done()
          })
        })
      )

      pull(
        pull.once(blob),
        alice.add((err, blobId) => {
          if (err) throw err

          alice.push(blobId)
        })
      )
    }, function (err) {
      if (err) throw err
    })
  })
}
