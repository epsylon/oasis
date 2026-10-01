const test = require('tape')
const vectors = [
  require('envelope-spec/vectors/unslot1.json')
]

// NOTE - decodeLeaves bulk-converts string-encoded buffers
// back into Buffers so the vector can be used directly
const decodeLeaves = require('./helpers/decode-leaves')
const { KeySlot, DeriveSecret } = require('../util')

test('unslot', t => {
  t.plan(vectors.length + 1)

  vectors.forEach((vector, i) => {
    decodeLeaves(vector)

    const { key_slot, feed_id, prev_msg_id, recipient } = vector.input

    const derive = DeriveSecret(feed_id, prev_msg_id)
    const msg_key = Buffer.alloc(32)

    const { unslot } = KeySlot(derive)
    unslot(msg_key, key_slot, recipient)

    t.deepEqual(msg_key, vector.output.msg_key, 'unslots a key')
  })

  /* testing optimised setFlip path */
  const vector = vectors[0]
  decodeLeaves(vector)

  const { key_slot, feed_id, prev_msg_id, recipient } = vector.input

  const derive = DeriveSecret(feed_id, prev_msg_id)
  const msg_key = Buffer.alloc(32)

  const { unslot, setFlip } = KeySlot(derive)
  setFlip(recipient)
  unslot(msg_key, key_slot)

  t.deepEqual(msg_key, vector.output.msg_key, 'unslots a key (optimised for bulk attempts)')
})
