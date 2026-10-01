const test = require('tape')
const vectors = [
  require('envelope-spec/vectors/slot1.json')
]

// NOTE - decodeLeaves bulk-converts string-encoded buffers
// back into Buffers so the vector can be used directly
const decodeLeaves = require('./helpers/decode-leaves')
const { KeySlot, DeriveSecret } = require('../util')

test('unslot', t => {
  t.plan(vectors.length)

  vectors.forEach((vector, i) => {
    decodeLeaves(vector)

    const { msg_key, feed_id, prev_msg_id, recipient } = vector.input

    const derive = DeriveSecret(feed_id, prev_msg_id)
    const key_slot = Buffer.alloc(32)

    const { unslot } = KeySlot(derive)
    unslot(key_slot, msg_key, recipient)

    t.deepEqual(key_slot, vector.output.key_slot, 'slots a key')
  })
})
