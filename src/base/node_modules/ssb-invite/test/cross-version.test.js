/* eslint-disable no-useless-call */
const test = require('tape')
const crypto = require('crypto')
const { promisify: p } = require('util')
const pull = require('pull-stream')

const caps = {
  shs: crypto.randomBytes(32).toString('base64')
}
const skip = process.env.OLD_DEPS // these tests don't use util/testbot.js

test('old peer → new pub', { skip }, async t => {
  const peer = require('scuttle-testbot')
    .use(require('ssb-invite-2'))
    .use(require('ssb-replicate'))
    .use(require('ssb-friends-4'))
    .use(require('ssb-conn-1'))
    .call(null, {
      name: 'old-peer',
      db1: true,
      caps
    })

  const pub = require('scuttle-testbot')
    .use(require('../')) // ssb-invite-3
    .use(require('ssb-replicate'))
    .use(require('ssb-friends-4'))
    .use(require('ssb-conn-1'))
    .call(null, {
      name: 'new-pub',
      db1: true,
      caps,
      allowPrivate: true
    })

  const invite = await p(pub.invite.create)({ uses: 1 })

  await p(peer.invite.accept)(invite)

  const readyPromise = pull(
    pub.createHistoryStream({ id: peer.id, live: true }),
    pull.filter(m => m.value.content.type === 'hello!'),
    pull.take(1),
    pull.collectAsPromise()
  )

  await p(peer.publish)({ type: 'hello!' })
    .then(() => t.pass('peer publishes a new message'))
    .catch(err => t.error(err, 'peer publishes a new message'))

  const [{ value }] = await readyPromise
  t.equal(value.author, peer.id, 'pub replicated message from peer')
  t.equal(value.content.type, 'hello!', 'its hello!')

  await Promise.all([
    p(peer.close)(true),
    p(pub.close)(true)
  ])
  t.end()
})

test('new peer → old pub', { skip }, async t => {
  const peer = require('scuttle-testbot')
    .use(require('../')) // ssb-invite-3
    .use(require('ssb-replicate'))
    .use(require('ssb-friends-4'))
    .use(require('ssb-conn-1'))
    .call(null, {
      name: 'old-peer',
      db1: true,
      caps
    })

  const pub = require('scuttle-testbot')
    .use(require('ssb-invite-2'))
    .use(require('ssb-replicate'))
    .use(require('ssb-friends-4'))
    .use(require('ssb-conn-1'))
    .call(null, {
      name: 'new-pub',
      db1: true,
      caps,
      allowPrivate: true
    })

  const invite = await p(pub.invite.create)({ uses: 1 })

  await p(peer.invite.accept)(invite)

  const readyPromise = pull(
    pub.createHistoryStream({ id: peer.id, live: true }),
    pull.filter(m => m.value.content.type === 'hello!'),
    pull.take(1),
    pull.collectAsPromise()
  )

  await p(peer.publish)({ type: 'hello!' })
    .then(() => t.pass('peer publishes a new message'))
    .catch(err => t.error(err, 'peer publishes a new message'))

  const [{ value }] = await readyPromise
  t.equal(value.author, peer.id, 'pub replicated message from peer')
  t.equal(value.content.type, 'hello!', 'its hello!')

  await Promise.all([
    p(peer.close)(true),
    p(pub.close)(true)
  ])
  t.end()
})
