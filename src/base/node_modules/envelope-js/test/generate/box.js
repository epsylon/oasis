const { box } = require('../../')
const { FeedId, PrevMsgId, Key, print } = require('../helpers')

const generators = [
  /* box for 2 recps */
  (i) => {
    const plain_text = Buffer.from('squeamish ossifrage 😨', 'utf8')
    const feed_id = FeedId()
    const prev_msg_id = PrevMsgId()
    const msg_key = Key()
    const recp_keys = [
      { key: Key(), scheme: 'envelope-large-symmetric-group' },
      { key: Key(), scheme: 'envelope-id-based-dm-converted-ed25519' }
    ]

    const vector = {
      type: 'box',
      description: 'box for 2 recipients (with different key management scheme)',
      input: {
        plain_text,
        feed_id,
        prev_msg_id,
        msg_key,
        recp_keys
      },
      output: {
        ciphertext: box(plain_text, feed_id, prev_msg_id, msg_key, recp_keys)
      },
      error_code: null
    }
    print(`box${i + 1}.json`, vector)
  },

  /* box for empty plain_text "" */
  (i) => {
    const plain_text = Buffer.from('', 'utf8') // <------ no!
    const feed_id = FeedId()
    const prev_msg_id = PrevMsgId()
    const msg_key = Key()
    const recp_keys = [
      { key: Key(), key_type: 'envelope-large-symmetric-group' },
    ]

    const vector = {
      type: 'box',
      description: 'cannot box an empty plain_text buffer / string',
      input: {
        plain_text,
        feed_id,
        prev_msg_id,
        msg_key,
        recp_keys
      },
      output: {
        ciphertext: null
      },
      error_code: 'boxEmptyPlainText'
    }
    print(`box${i + 1}.json`, vector)
  },

  /* zerod msg_key */
  // NOTE - removed because keks didn't think this was important
  // (i) => {
  //   const plain_text = Buffer.from('squeamish ossifrage 😨', 'utf8')
  //   const feed_id = FeedId()
  //   const prev_msg_id = PrevMsgId()
  //   const msg_key = Key().fill(0) // <------------ no!
  //   const recp_keys = [
  //     { key: Key(), key_type: 'envelope-large-symmetric-group' },
  //   ]

  //   const vector = {
  //     type: 'box',
  //     description: 'box with empty (zero filled) msg_key throws error',
  //     input: {
  //       plain_text,
  //       feed_id,
  //       prev_msg_id,
  //       msg_key,
  //       recp_keys
  //     },
  //     output: {
  //       ciphertext: null
  //     },
  //     error_code: 'boxZerodMsgKey'
  //   }
  //   print(`box${i + 1}.json`, vector)
  // }
]

generators.forEach((fn, i) => fn(i))
