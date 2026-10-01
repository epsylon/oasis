# Creating a group

This is a spec for how to initialise a new group.

## Example

Here's how you initialise a group in the current JS stack

```js
// content you encode
var plainText = {
  type: 'group/init'
  tangles: {
    group: {
      root: null,
      previous: null
    }
  }
}

// what you publish (enveloped plaintext)
var ciphertext = "SDSDsadlksajda432wdfsdlkfja=.box2"
```

Noticeablly, this first message **does not have a recps field** with this `group_id` in it,
because the definition of `group_id` depends on the key of this message, which will not
be known until this is published.

This means this initial message and it's content will need to be **manually boxed**,
with the only `recipient_key` being the symmetric `group_key` for this new group.

Do not be tempted to overload this initialisation message.
Adding people to the group would interfere with the [`add-member` spec](../add-member/README.md)


## Detailed Example (js)


```js
// assume you already know your feedId + prevMsgId for this feed
var feedId = '@+oaWWDs8g73EZFUMfW37R/ULtFEjwKN/DczvdYihjbU=.ed25519'
var prevMsgId = '%Zz+Inkte70Qz1UVKUHIhOgo16Oj/n37PfgmIzLDBgZw=.sha256'

var feed_id = ... BFE binary encoding of feed_id
var prev_msg_id = ... BFE binary encoding of feed_id

var group_key = ... symetric key as buffer
vat msg_key = ... make up a one use key for the msg

// here's the unencrypted init message
var plainText = {
  type: 'group/init'
  tangles: {
    group: {
      root: null,
      previous: null
    }
  }
}

var plain_text = .... stringify + buffer

var ciphertext = envelope(plain_text, feed_id, prev_msg_id, msg_key, [ group_key ])

ciphertext ---> string + .box2
```
