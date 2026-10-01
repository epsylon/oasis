const { FeedId, MsgId, Key, print } = require('../helpers')
const DeriveSecret = require('../../util/derive-secret')
const KeySlot = require('../../util/key-slot')

const generators = [
  /* KeySlot - make a slot */
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
      type: 'slot',
      description: 'derive a key_slot for a specific recipient (note feed_id + prev_msg_id are for the feed this message is part of, not the recipient. Note feed_id prev_msg_id are TFK encoded buffers. Recipient is a shared key you and some others have access to, you are sending "to" that.',
      input: {
        feed_id,
        prev_msg_id,
        msg_key,
        recipient
      },
      output: {
        key_slot
      },
      error_code: null
    }
    print(`slot${i + 1}.json`, vector)
  }
]
generators.forEach((fn, i) => fn(i))
