const test = require('tape')
const vectors = [
  require('envelope-spec/vectors/box1.json'),
  require('envelope-spec/vectors/box2.json')
]

// NOTE - decodeLeaves bulk-converts string-encoded buffers
// back into Buffers so the vector can be used directly
const decodeLeaves = require('./helpers/decode-leaves')
const { box } = require('../')

test('box', t => {
  t.plan(vectors.length + 1)

  vectors.forEach(vector => {
    decodeLeaves(vector)

    const { plain_text, feed_id, prev_msg_id, msg_key, recp_keys } = vector.input

    if (!vector.error_code) {
      t.deepEqual(
        box(plain_text, feed_id, prev_msg_id, msg_key, recp_keys),
        vector.output.ciphertext,
        vector.description
      )

    }
    else {
      try {
        box(plain_text, feed_id, prev_msg_id, msg_key, recp_keys)
      } catch (e) {
        t.equal(
          e.code,
          vector.error_code,
          vector.description
        )
      }
    }
  })

  /* box encryption overhead */
  const content = {
    type: 'post',
    text: new Array(5000).fill('a').join('')
  }

  const plain_text = Buffer.from(JSON.stringify(content))
  const feed_id = Buffer.from('AACv6zOVZsd3N5mVYJs7MnmMRu08DfGmqG70+0mL0SfHUQ==', 'base64')
  const prev_msg_id = Buffer.from('AQBP+SmjFm1B7PJ7bSaIa3JhkqMYdmlIKUtodYfE9o8/qw==', 'base64')
  const msg_key = Buffer.from('Sio94NHxP3k+Svx7d1VReGxHdh2T9wssofb1v7Lt9ao=', 'base64')
  const recp_keys = [
    {
      key: Buffer.from('gVv33+Jo5348A1XJrA+hoMxYiee13QlxNpm88yHwzRY=', 'base64'),
      scheme: 'envelope-large-symmetric-group'
    },
    {
      key: Buffer.from('beAVypscgWbDyQw6oDUwX9Huf/5dwrlhE/OrStRsU0g=', 'base64'),
      scheme: 'envelope-id-based-dm-converted-ed25519'
    }
  ]

  const expectedSize = 32 + (recp_keys.length * 32) + plain_text.length + 16
  // header + (recp key slots) + (content + HMAC)

  t.equal(
    box(plain_text, feed_id, prev_msg_id, msg_key, recp_keys).length,
    expectedSize,
    'encryption overhead good'
  )
})
