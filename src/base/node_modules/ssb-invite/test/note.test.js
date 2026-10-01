// WARNING: this test currently only passes if the computer has a network.
const tape = require('tape')
const pull = require('pull-stream')
const Server = require('./test-bot')

function all (stream, cb) {
  return pull(stream, pull.collect(cb))
}

tape('test invite with note', function (t) {
  const wsConnections = {
    incoming: {
      net: [{ scope: ['local', 'device'], transform: 'shs', host: '::' }],
      ws: [{ scope: ['local', 'device'], transform: 'shs', host: '::' }]
    },
    outgoing: {
      net: [{ transform: 'shs' }],
      ws: [{ transform: 'shs' }]
    }
  }
  const alice = Server({
    allowPrivate: true,
    connections: wsConnections
  })
  const bob = Server()

  alice.invite.create({ uses: 1, note: 'bob' }, (err, invite) => {
    t.error(err, 'invite created')
    bob.invite.accept(invite, (err) => {
      t.error(err, 'invite accepted')

      all(alice.messagesByType('contact'), (err, ary) => {
        if (err) throw err

        t.equal(ary.length, 1)

        t.deepEqual({
          type: 'contact',
          contact: bob.id,
          following: true,
          pub: true,
          note: 'bob'
        }, ary[0].value.content)

        alice.close(true)
        bob.close(true)
        t.end()
      })
    })
  })
})
