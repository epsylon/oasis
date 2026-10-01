# ssb-private-group-keys

Basic helper functions implementing the [private-group] spec.

Currently supports classic & bendy butt feed types.

## API

### `directMessageKey(x_dh_secret, x_dh_public, x_feed_id, y_dh_public, y_feed_id) => { key, scheme }`

Create a shared key for communication between your feed and _another_ feed.

If you are _encrypting_ a DM, `x` is your feed, and `y` is the person you are DM'ing.
If you are _decrypting_ a DM, `x` is your feed, and `y` is the message author's.
  - NOTE: this is only for the case that the author is someone else, if you're the author, use your `own_key`

- `x_dh_secret`, `x_dh_public` are feed x's diffie-hellman keys
- `x_feed_id` is the feedId of `x`
- `y_dh_public` is feed y's diffie-hellman public key
- `y_feed_id` is the feedId of `y`

All inputs are [BFE] style buffers.

The output is a `key` (buffer) and associated `scheme` (string) which can be passed into an envelope `key_slot`


#### `directMessageKey.easy(myKeys) => makeKey(feedId) => { key, scheme }`

Convenience function which wraps `directMessageKey`

---

### `poBoxKey(x_dh_secret, x_dh_public, x_id, y_dh_public, y_id) => { key, scheme }`

If you are _encrypting_ to a P.O. Box, then `x` is your feed, and `y` is the P.O. Box.
If you are _decrypting_ a message sent to a P.O. Box, then `x` is the P.O. Box, and `y` is the message author's feed.

- `x_dh_secret`, `x_dh_public` are x's diffie-hellman keys
- `x_id` is the BFE id of `x`
- `y_dh_public` is y's diffie-hellman public key
- `y_id` is the BFE id of `y`

All inputs are [BFE] style buffers.

The output is a `key` (buffer) and associated `scheme` (string) which can be passed into an envelope `key_slot`


#### `poBoxKey.easy(myKeys) => makeKey(poboxId) => { key, scheme }`

Convenience function which wraps `poBoxKey`


---

### `new SecretKey(length?) => secretKey`

Create a secret key that can be used for the group or message key.

methods:
- `secretKey.toBuffer() => buffer` return raw buffer with the key data in it
- `secretKey.toString() => string` returns a `base64` encoded string of the key

### `new SecretKey(buffer) => secretKey`

An alternative way to use the constructor, in case you already have the group
key bytes as a buffer, is to pass the buffer as the argument. This simply
"embodies" the group key as a `SecretKey` instance, it doesn't generate anything
new.

---

### `new DiffieHellmanKeys(keys?, opts?) => dhKeys`

_alias: `DHKeys`_

where:
- `keys` *Object* (optional)
    - is a pair of keys `{ public, secret? }`, each a Buffer or base64 encoded String
        - `public` is required, `secret` is optional
    - if not provided, you are expected to call `dhKeys.generate()` to generate a keypair
- `opts` *Object* (optional)
    - `opts.fromEd25519` *Boolean* sets whether the keys are ed25519 signing keys you would like converted to curve25519 encryption keys.
        - default: `false`
    - `opts.format` *Integer* sets whether the BFE "format" of the encryption key type
        - if `opts.fromEd25519 = true` was used, it's assumed these are dm keys (`format = 0`)
        - else format is not set, which is fine as long as you don't call `dhKeys.toBFE()`
- `dhKeys` *DiffieHellmanKeys instance* with methods:
    - `dhKeys.generate() => dhKeys` - generates public and private dh keys
    - `dhKeys.toBuffer() => { public: Buffer, secret: Buffer }` - returns the raw keys as Buffers
    - `dhKeys.toBFE() => { public: BFE, secret: BFE }` - return [BFE] encodings of the keys (as Buffers)

### `DiffieHellmanKeys.scalarMult(A, B) => result`

A class method for creating shared encryption keys.
- `A` a DHKeys instance, must include `secret` key
- `B` a DHKeys instance
- `result` *Buffer* the result of the scalarMult
    - only useful in advanced cases to conserve memory

NOTE:
- method also takes appropriately shaped objects, see source code.
- there's an advanced signature if you need to conserve memory `(A, B, result) => result`


---

## History

This library was originally extracted from [ssb-tribes].

[private-group]: https://github.com/ssbc/private-group-spec
[ssb-tribes]: https://github.com/mixmix/ssb-tribes
[BFE]: https://github.com/ssb-ngi-pointer/ssb-binary-field-encodings-spec

