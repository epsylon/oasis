const test = require('tape')
const vectors = [
  require('envelope-spec/vectors/cloaked_id1.json')
]
const decodeLeaves = require('./helpers/decode-leaves')
const { CloakedMsgId } = require('../')

test('cloaked-msg-id', t => {
  vectors.forEach(vector => {
    decodeLeaves(vector)

    const { public_msg_id, read_key } = vector.input
    const cloaked_msg_id = new CloakedMsgId(public_msg_id, read_key).toBuffer()

    t.deepEqual(cloaked_msg_id, vector.output.cloaked_msg_id, 'derives cloaked_id')
  })

  t.end()
})
