const test = require('tape')
// NOTE - decodeLeaves bulk-converts string-encoded buffers
// back into Buffers so the vector can be used directly
const decodeLeaves = require('./helpers/decode-leaves')
const { unbox } = require('../')

const vectors = [
  require('envelope-spec/vectors/unbox1.json')
]

test('unbox', t => {
  t.plan(vectors.length)

  vectors.forEach(vector => {
    decodeLeaves(vector)
    var { ciphertext, feed_id, prev_msg_id, recipient } = vector.input

    if (!vector.error_code) {

      t.deepEqual(
        unbox(ciphertext, feed_id, prev_msg_id, [recipient]),
        vector.output.plain_text,
        vector.description
      )
    }
    else {
      try {
        unbox(ciphertext, feed_id, prev_msg_id, [recipient])
      } catch (e) {
        t.equal(
          e.code,
          vector.error_code,
          vector.description
        )
      }
    }
  })
})
