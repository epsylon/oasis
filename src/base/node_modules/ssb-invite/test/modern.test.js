// WARNING: this test currently only passes if the computer has a network.
const tape = require('tape')
const ssbKeys = require('ssb-keys')
const ssbClient = require('ssb-client')
const crypto = require('crypto')
const Server = require('./test-bot')

const host = '127.0.0.1'
// var host = '::'
// WARNING host '::' currently fails this tests because it creates an invite
// which parseInvite fails to process (returning null)

const wsConnections = {
  incoming: {
    net: [{ scope: ['local', 'device'], transform: 'shs', host }],
    ws: [{ scope: ['local', 'device'], transform: 'shs', host }]
  },
  outgoing: {
    net: [{ transform: 'shs' }],
    ws: [{ transform: 'shs' }]
  }
}

tape('test invite.create with modern', function (t) {
  const alice = Server({
    allowPrivate: true,
    connections: wsConnections
  })
  const bob = Server()
  const carol = Server()
  console.log({
    alice: alice.id,
    bob: bob.id,
    carol: carol.id
  })

  // request a secret that with particular permissions.

  alice.invite.create({ modern: true }, (err, invite) => {
    t.error(err, 'invite created')
    t.ok(/^ws/.test(invite), 'is websocket invite') // should be over websockets
    console.log(invite)

    // test that invite is accepted with quotes around it.
    bob.invite.accept(JSON.stringify(invite), (err, msg) => {
      t.error(err, 'invite accepted')
      alice.friends.hops({ source: alice.id, dest: bob.id }, (err, hops) => {
        if (err) throw err
        t.equal(hops[bob.id], 1, 'alice follows bob')
        carol.invite.accept(invite, function (err) {
          t.ok(err)
          t.match(err.message, /invite not accepted/, 'cannot use single use invite twice')

          alice.friends.hops({ source: alice.id, dest: bob.id }, (err, hops) => {
            if (err) throw err
            t.equal(hops[carol.id], undefined)

            alice.close(true)
            bob.close(true)
            carol.close(true)

            t.end()
          })
        })
      })
    })
  })
})

tape('invite guest may NOT call get', function (t) {
  const caps = {
    shs: crypto.randomBytes(32).toString('base64')
  }

  const alice = Server({
    allowPrivate: true,
    connections: wsConnections,
    caps
  })
  const bobKeys = ssbKeys.generate()

  alice.publish({ type: 'test', okay: true }, function (err, msg) {
    if (err) throw err
    alice.invite.create({ modern: true }, function (err, invite) {
      t.error(err, 'creates invite')

      ssbClient(bobKeys, {
        remote: invite,
        manifest: { get: 'async', add: 'async' },
        caps
      }, function (err, rpc) {
        if (err) throw err
        rpc.get(msg.key, (err, value) => {
          t.match(err.message, /method:get is not in list of allowed methods/)
          rpc.add(msg.key, (err, value) => {
            t.match(err.message, /method:add is not in list of allowed methods/)
            t.end()
            alice.close()
          })
        })
      })
    })
  })
})
