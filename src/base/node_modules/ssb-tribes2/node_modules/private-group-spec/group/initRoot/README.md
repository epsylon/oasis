# Creating a group

This is a spec for how to initialise a new group.

:warning: schema.json is generated so don't modify it directly

## Group init root example

Notably, the first message **does not have a recps field** with this `group_id` in it,
because the definition of `group_id` depends on the key of this message, which will not
be known until this is published.

This means this initial message and it's content will need to be **manually boxed**,
with the `recipient_key`s being the symmetric `group_key` for this new group as well as to your `own_key`, for recovery purposes.

Do not be tempted to overload this initialisation message.
Adding people to the group would interfere with the [`add-member` spec](../add-member/README.md)

Here's how you initialise a group in the current JS stack

```js
// assume you already know your feedId + prevMsgId for this feed
var feedId = 'ssb:feed/bendybutt-v1/-oaWWDs8g73EZFUMfW37R_ULtFEjwKN_DczvdYihjbU='
var prevMsgId = 'ssb:message/classic/Zz-Inkte70Qz1UVKUHIhOgo16Oj_n37PfgmIzLDBgZw=.sha256'

var feed_id = ... BFE binary encoding of feed_id
var prev_msg_id = ... BFE binary encoding of feed_id

var group_secret = {
  key: group_buffer, // group_buffer is symmetric key as buffer
  scheme: 'envelope-large-symmetric-group'
}
var own_key = {
  key: own_buffer, // own_buffer is a symmetric key as a buffer
  scheme: 'envelope-symmetric-key-for-self'
}
var msg_key =  ... make up a one use key for the msg as a buffer

// here's the unencrypted init message
var plainText = {
  type: 'group/init'
  version: 'v2',
  secret: group_secret.toString('base64'),
  tangles: {
    group: {
      root: null,
      previous: null
    },
    epoch: {
      root: null,
      previous: null
    }
    members: {
      root: null,
      previous: null
    }
  }
}

var plain_text = .... stringify + buffer

var ciphertext = envelope(plain_text, feed_id, prev_msg_id, msg_key, [ group_key, own_key ])

// what you publish (enveloped plaintext)
// ciphertext = "SDSDsadlksajda432wdfsdlkfja=.box2"
```