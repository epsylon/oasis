// WARNING: this test currently only passes if the computer has a network.
const tape = require('tape')
const pull = require('pull-stream')
const ref = require('ssb-ref')
const crypto = require('crypto')
const Server = require('./test-bot')

let skipIPv6 = false
if (process.env.TRAVIS === 'true') {
  console.warn('IPv6 is unsupported under Travis CI, test skipped')
  skipIPv6 = true
}

function all (stream, cb) {
  return pull(stream, pull.collect(cb))
}

tape('test invite.accept api', function (t) {
  const alice = Server({ allowPrivate: true })
  const bob = Server()
  const carol = Server()

  if (!alice.getAddress('device')) { throw new Error('alice must have device address') }
  if (!alice.getAddress('local')) { throw new Error('alice must have local address') }

  // request a secret that with particular permissions.

  alice.invite.create(1, (err, invite) => {
    t.error(err, 'invite created')
    // test that invite is accepted with quotes around it.
    bob.invite.accept(JSON.stringify(invite), (err) => {
      t.error(err, 'invite accepted')
      alice.friends.hops({ source: alice.id, dest: bob.id }, (err, hops) => {
        if (err) throw err

        t.equal(hops[bob.id], 1, 'alice follows bob')
        carol.invite.accept(invite, (err) => {
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

tape('test invite.accept api using non default app key', function (t) {
  const caps = {
    shs: crypto.randomBytes(32).toString('base64')
  }

  const alice = Server({ allowPrivate: true, caps })
  const bob = Server({ caps })
  const carol = Server({ caps })

  if (!alice.getAddress('device')) { throw new Error('alice must have device address') }
  if (!alice.getAddress('local')) { throw new Error('alice must have local address') }

  // request a secret that with particular permissions.

  alice.invite.create(1, function (err, invite) {
    t.error(err, 'invite created')
    // test that invite is accepted with quotes around it.
    bob.invite.accept(JSON.stringify(invite), function (err) {
      t.error(err, 'invite accepted')
      alice.friends.hops({ source: alice.id, dest: bob.id }, (err, hops) => {
        if (err) throw err

        t.equal(hops[bob.id], 1, 'alice follows bob')
        carol.invite.accept(invite, function (err) {
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

tape('test invite.accept doesnt follow if already followed', function (t) {
  const alice = Server({ allowPrivate: true })
  const bob = Server()

  // request a secret that with particular permissions.

  alice.invite.create(2, function (err, invite) {
    if (err) throw err
    bob.invite.accept(invite, function (err) {
      t.error(err, 'invite accepted')
      alice.friends.hops(alice.id, function (err, hops) {
        if (err) throw err
        // console.log(hops)
        t.equal(hops[bob.id], 1)

        bob.invite.accept(invite, (err) => {
          t.error(err, 'no error')
          all(bob.messagesByType('pub'), function (err, ary) {
            if (err) throw err

            // it's rare, but some times, someone's home computer has a public address.
            // this makes the tests fail unless we get the address the same way as invite code.
            const expected = alice.address('public') || alice.address('local') || alice.address('device')
            t.deepEqual(
              ary.map(m => m.value.content),
              [
                {
                  type: 'pub',
                  address: ref.parseAddress(expected.split(';').shift())
                },
                {
                  type: 'pub',
                  address: ref.parseAddress(expected.split(';').shift())
                }
              ],
              'two pub announce'
              // NOTE this is an undesired side effect (two identical pub announce messages)
              // but meh
            )

            all(bob.messagesByType('contact'), function (err, ary) {
              if (err) throw err

              t.deepEqual(
                ary.map(m => m.value.content),
                [{
                  type: 'contact',
                  contact: alice.id,
                  autofollow: true,
                  following: true
                }],
                'only one follow'
              )

              alice.friends.hops(alice.id, (err, hops) => {
                if (err) throw err

                // console.log(hops)
                t.equal(hops[bob.id], 1, 'correct hops')

                alice.close(true)
                bob.close(true)
                t.end()
              })
            })
          })
        })
      })
    })
  })
})

tape('test invite.accept publishes new "pub" msg if same pub at different address', function (t) {
  const alice = Server({ allowPrivate: true })
  const bob = Server()

  // request a secret that with particular permissions.
  alice.invite.create(2, function (err, invite) {
    if (err) throw err
    bob.invite.accept(invite, function (err) {
      t.error(err, 'invite accepted')

      const mutatedInvite = mutateInviteDomain(invite)
      if (invite === mutatedInvite) t.fail('failed to mutate invite')

      bob.invite.accept(mutatedInvite, (err) => {
        t.error(err, 'accepts invite because its at a different address')

        alice.friends.hops(alice.id, (err, hops) => {
          if (err) throw err
          t.equal(hops[bob.id], 1, 'alice follows bob')

          all(bob.messagesByType('pub'), function (err, arr) {
            if (err) throw err

            t.deepEqual(
              arr.map(m => m.value.content.address),
              [
                ref.parseAddress(invite.split('~')[0]),
                ref.parseAddress(mutatedInvite.split('~')[0])
              ],
              'records both pub locations'
            )

            // console.log(hops)
            alice.close(true)
            bob.close(true)
            t.end()
          })
        })
      })
    })
  })
})
function mutateInviteDomain (invite) {
  if (invite.match(/^\d{4}:/)) { // ipv6
    return '127.0.0.1' + invite.slice(39)
  }

  const ipv4Pattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/
  if (invite.match(ipv4Pattern)) { // ipv4
    return invite.replace(ipv4Pattern, 'localhost')
  }

  if (invite.startsWith('localhost')) {
    return invite.replace('localhost', '127.0.0.1')
  }

  throw new Error('cant mutate invite ' + invite)
}

tape('test invite.accept api with ipv6', { skip: skipIPv6 }, function (t) {
  const alice = Server({ allowPrivate: true })
  const bob = Server()

  alice.invite.create(1, function (err, invite) {
    if (err) throw err

    // use a local ipv6 address in the invite
    let inviteV6 = invite.replace(/localhost|([0-9.]*)/, '::1')
    // NOTE - if you already have an ipv6 address you won't be testing ::1 here

    //    var parts = invite.split(':')
    //    parts[0].split(':').pop()
    //    console.log(inviteV6, invite)
    const parts = invite.split('~')

    const addr = ref.parseAddress(parts[0])

    addr.host = '::1'

    inviteV6 = addr.host + ':' + addr.port + ':' + addr.key + '~' + parts[1]

    bob.invite.accept(inviteV6, function (err, msg) {
      t.error(err, 'invite accepted')
      alice.friends.hops({ source: alice.id, dest: bob.id }, (err, hops) => {
        if (err) throw err
        t.equal(hops[bob.id], 1, 'alice follows bob')
        alice.close(true)
        bob.close(true)
        t.end()
      })
    })
  })
})
