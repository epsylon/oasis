
const { FeedId, MsgId, Key, print } = require('../helpers')
const DeriveSecret = require('../../util/derive-secret')
const KeySlot = require('../../util/key-slot')

const generators = [
  /* KeySlot - read a slot */
  (i) => {
    const feed_id = FeedId()
    const prev_msg_id = MsgId()
    const msg_key = Key()
    const recipient = {
      key: Key(),
      scheme: 'symmetic-group-shared-key-for-example'
    }

    const derive = DeriveSecret(feed_id, prev_msg_id)
    const key_slot = Buffer.alloc(32)
    KeySlot(derive).slot(key_slot, msg_key, recipient)

    const vector = {
      type: 'unslot',
      description: 'from a key_slot, successfully derive the msg_key',
      input: {
        key_slot,
        feed_id,
        prev_msg_id,
        recipient
      },
      output: {
        msg_key
      },
      error_code: null
    }
    print(`unslot${i + 1}.json`, vector)
  }
]

generators.forEach((fn, i) => fn(i))
