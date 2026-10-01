const tape = require('tape')
const pull = require('pull-stream')

const Blobs = require('../inject')
const MockStore = require('./mock/blob-store')
const MockPush = require('./mock/blob-push')
const { sync } = require('./util')

const createBlobs = (name, _async) => Blobs(
  MockStore(name, _async),
  MockPush(_async),
  name
)

tape('local - createWants does not error after abort', function (t) {
  t.plan(3)
  sync(function (async) {
    const blobs = createBlobs('simple', async)

    const wants = blobs.createWants.call({ id: 'test' })
    // abort the want stream, and then make another one
    wants(new Error('abort'), function (err) {
      t.ok(err, 'wants aborted')
      pull(
        blobs.createWants.call({ id: 'test' }),
        async.through(),
        pull.take(1),
        pull.collect(function (err, res) {
          t.error(err, 'wants')
          t.deepEquals(res, [{}], 'empty wants')
        })
      )
    })
  })
})
