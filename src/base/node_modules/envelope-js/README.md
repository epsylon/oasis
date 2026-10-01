# envelope-js

A javascript tool for cryptographically "boxing" and "unboxing" messages
following the [envelope spec](https://github.com/ssbc/envelope-spec).

envelope supports encryption to individuals and groups

## Example Usage

```js
var { box, unbox, CloakedMsgId } = require('envelope-js')
```

...

## API

### `box(plain_text, feed_id, prev_msg_id, msg_key, recp_keys) => ciphertext`

where:
- `plain_text` *Buffer* is the content to be "enveloped"
- `feed_id` *Buffer* is a type-format-key (TFK) encoded value for the feed authoring a message
- `prev_msg_id` *Buffer* is a TFK encoded value of the id of last message of this feeds chain
- `msg_key` *Buffer* a randomised 32 Bytes which will be the unique key for this message
- `recps_keys` *Array* is a collection of items of form `{ key, scheme }`, where
    - `key` *Buffer* is the key the particular recipient
    - `scheme` *String|Buffer* is the type of key / the key management scheme for this recipient


### `unbox(ciphertext, feed_id, prev_msg_id, trial_keys, max_attempts) => plain_text | null`

where:
- `ciphertext` *Buffer* is envelope
- `feed_id` *Buffer* is a type-format-key (TFK) encoded value for the feed authoring a message
- `prev_msg_id` *Buffer* is a TFK encoded value of the id of last message of this feeds chain
- `trial_keys` *Array* is a collection of items of form `{ key, scheme }`, where
    - `key` *Buffer* is the key the particular recipient
    - `scheme` *String|Buffer* is the type of key / the key management scheme for this recipient
- `max_attempts` *Integer* (default: 8) how many key_slots you want to assume the envelope has
- `plain_text` *Buffer* the envelope contents

NOTE: we also expose `unboxKey` and `unboxBody` for convenience.

### `DeriveSecret(feed_id, prev_msg_id) => derive`

Used for taking a `msg_key` (the one-time key for a particular envelope) and deriving other keys used in the envelope (e.g. `read_key`)

where:
- `feed_id` *Buffer* is a TFK encoded id for the feed the envelope is part of
- `prev_msg_id` *Buffer* is a TFK encoded id for the message prior to one where our envelope is
    - NOTE if this is the first message, then the K part of `prev_msg_id`'s TFK is a zero-filled Buffer.
- `derive(key, labels) => new_key` *function* where:
    - `key` *Buffer* is a seed key which we're going to derive from
    - `labels` *Array* is a an array of *String*s which help define a derivation


### `new CloakedMsgId(public_msg_id, read_key) => cloakedMsgId`

Determine a cloaked message id for a published message following the `envelope-spec/cloaked_msg_id/README.md`

where:
- `public_msg_id` *Buffer* is the id of a enveloped message that's been published (it has an id as it's part of a feed / chain)
- `read_key` *Buffer* is the read capability (NOT the `msg_key`) for this message envelope
- `cloakedMsgId` is an instance with methods:
  - `toBuffer() => Buffer` which returns the cloaked id key as a Buffer
  - `toString(encoding) => String` which returns the cloaked id key as a Buffer (encoding defaults to 'base64')
  - `mock() => cloakedMsgId` a method for testing. populates the id with random content. if using this, instantiate with no args.


### `slp.encode(info) => Buffer`

where `info` is an Array of Buffers.

This is "short length-prefixed encoding", see https://github.com/ssbc/envelope-spec/blob/master/encoding/slp.md

...

## License

MIT
