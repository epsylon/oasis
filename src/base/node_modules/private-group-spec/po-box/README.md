# P.O. Box messaging

A Post Office Box is an address which is at a distance from where an individual or group physically reside, which lends some anonymity while still allowing people to contact that individual/group.

P.O. Box messages are based on a curve25119 keypair which is _only used for encryption_ (never for signing anything), and it is very similar to direct-messages to foreign feedIds (case A.), with a couple of important differences


## Mapping `pobox_id` to `recp_key`

A `pobox_id` is a [ssb-uri] encoding of the [BFE] po-box type/format/data:

```
  ssb:identity/po-box/RfZXvarWoyc-GX0INixbZHtl8W8PYaN7ta4t9pCjAgg=
     └───┬───┘└──┬──┘└────────────────────┬──────────────────────┘
        type   format                    data
         7       0
```

NOTE:
- the data needs converting from URI encoding to base64 string encoding, then into a buffer
- this is the ID of a PO_BOX, the data part is a curve25519 key, which is ready for Diffie-Hellman scalar multiplicate

When I see a `pobox_id` listed in `content.recps`, I derive a key for the envelope key_slot like so:

```js
const hash = 'SHA256'
const length = 32
const salt = SHA256('envelope-pobox-v1-extract-salt')

function poboxSlotKey (x_dh_secret, x_dh_public, x_id_bfe, y_dh_public, y_id_bfe) {
  var input_keying_material = scalarmult(x_dh_secret, y_dh_public)

  var info_context = Buffer.from('envelope-ssb-pobox-v1/key', 'utf8')
  var info_keys = sort([
    bfe.encode(x_dh_public, 3, 1) || x_id_bfe,
    bfe.encode(y_dh_public, 3, 1) || y_id_bfe
  ])
  var info = slp.encode([info_context, ...info_keys])

  return hkdf(input_keying_material, length, { salt, info, hash })
}
```

If you are _encrypting_ a message to a P.O. Box, `x` is your feed, and `y` is the P.O. Box.  
If you are _decrypting_ a message that was sent to a P.O. Box `x` is the P.O. Box, and `y` is the message author.

- `(dh_secret, dh_public)` is some Diffie-Hellman compatible keypair to be used for encryption 
    - if you have a "classic" feed using ed25519 signing keys, you with have to convert convert these to keys compatible with diffie-hellman (dh) shared key encryption (`curve25119` keys
    - the pobox key is already in curve25519 format (so doesn't need converting)
    - when converting this ID to BFE encryption key, that should be **type: 3, format: 1**
- `*_id_bfe` is the "id" of a feed/ P.O. Box, encoded in "type-format-key" format (see [BFE])
- `||` means Buffer concat
- `sort` means sort these 2 buffers bytewise so that the smallest is first
- `slp.encode` is "shallow length-prefixed encode" (see [SLP])
- `bfe.encode` is bfe encoding of the encryption key, here with `type: 3, format 1` (see [BFE])

Differences from direct message function:
- the `salt` and `info_context` are P.O. Box specific
- the "foreign" keys and id's are the P.O. Box
    - these do not need converting to curve25519 - they already are!

The **complete key-and-scheme** for the envelope `key_recp` slot is of form
    ```js
    { 
      key: Buffer, // the poboxSlotKey
      scheme: "envelope-id-based-pobox-curve25519"
    }
    ```

## Example

### 1. Outsider messages a P.O. Box

```js
const request = {
  type: 'post',
  text: 'hello, my name is Cherese, can i join your group please?'
  recps: [
    'ssb:identity/po-box/RfZXvarWoyc-GX0INixbZHtl8W8PYaN7ta4t9pCjAgg=', // pobox_id
    '@YjoQc7sLF/ye+QM09iPcDJdzQo3lQD6YvQIFhmNbEqg=.ed25519'             // cherese's feed_id
  ]
}
```

In our example above, Cherese is an outsider (does not know the P.O. Box secret key).

The two recps are mapped into two key_slots for the envelope encryption:
```
pobox_id  ------poboxSlotKey------> { key, scheme }
feed_id   --directMessageSlotKey--> { key, scheme }  // see Direct Messages, case B
```


Later to decrypt this:
- so `x` in the above is the P.O. Box
- and `y` is the author of the message
    ```js
    const hash = 'SHA256'
    const length = 32
    const salt = SHA256('envelope-pobox-v1-extract-salt')

    function poboxSlotKey (pobox_dh_secret, pobox_dh_public, pobox_id_bfe, author_dh_public, author_id_bfe) {
      var  input_keying_material = scalarmult(pobox_dh_secret, author_dh_public)

      var info_context = Buffer.from('envelope-ssb-pobox-v1/key', 'utf8')
      var info_keys = sort([
        my_dh_public || my_id_bfe,
        pobox_dh_public || pobox_id_bfe
      ])
      var info = slp.encode([info_context, ...info_keys])

      return hkdf(input_keying_material, length, { salt, info, hash })
    }
    ```

- Note Cherese can use her `own_key` to read the message (see Direct Message (B))


### 2. P.O. Box member replies 

```js
const reply = {
  type: 'post',
  text: 'hi cherese, thanks for getting in touch. tell us more about yourself'
  recps: [
    'ssb:identity/po-box/RfZXvarWoyc-GX0INixbZHtl8W8PYaN7ta4t9pCjAgg=', // pobox_id
    '@YjoQc7sLF/ye+QM09iPcDJdzQo3lQD6YvQIFhmNbEqg=.ed25519'             // cherese's feed_id
  ] // note: there are the same recps as the initial DM to the P.O. Box
}
```

In our example above, a group member needs to be able to encrypt the message to the `pobox_id` and Cherese's `feed_id`
Say the author of this reply is an "insider" to the P.O. Box, Ben.

Later to decrypt this:
- P.O. Box members can open it using a key derived as in part 1.
- Cherese can open it as she would a normal DM from a foreign `feed_id`


## Algorithm for decrypting a P.O. Box based

```
If the encrypted message is one I sent, I can decrypt it by:
    - trying my `own_key` on all slots of the envelope
        - if success, then this was a message you sent to a P.O. Box

If the encrypted message from someone else, I can decrypt it by:
    - trying to decrypt with a `feed_id` based DM key (see section 1)
        - if success, then I am an outsider receiving a reply from someone in the P.O. Box
    - trying a key derived from `pobox_dh_secret` and `author_dh_public` (etc.) for each P.O. Box I have secret keys for
        - if success, then this was a message to/ from a P.O. Box I have keys to
```

[BFE]: https://github.com/ssb-ngi-pointer/ssb-bfe-spec
[ssb-uri]: https://github.com/ssb-ngi-pointer/ssb-uri-spec
[SLP]: https://github.com/ssbc/envelope-spec/blob/master/encoding/slp.md
