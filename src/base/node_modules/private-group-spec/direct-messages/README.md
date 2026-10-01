# Direct messages

A direct message is a messge encrypted to a `feed_id`
When you send a direct message you can have up to 16 DM recipients.

When sending a DM message, it's expected that you include your own `feed_id` as a recpient,
this is so that anyone replying to your message can confidently copies the `recps` from your message,
to the `recps` field of thier message and be confident you will receive it!

You can also combine DM with `group_id` or `pobox_id`, in which case whether you need to include
your own `feed_id` depends on whether you're part of the group or pobox

One example of these combined recps is when adding a new member to a group with a `group/add-member` msg.
Here you have recps = `[group_id, feed_id, feed_id, ...]` (NOTE `group_id` must be in first slot, and can
be followed by up to 15 other `feed_id` - the people you're adding).
Such a message can simultaneously:
- give the new person the info needed to access the group _(decrypt with a DM shared key)_
- reveal to the group that this action happened _(decrypt with the group key)_

## Mapping `feed_id` to `recp_key`

When we see a `feed_id` in `content.recps` we need to map this to a key we will used in a `recp_key`.
How we do that depends on whether the `feed_id` is ours (the authors).

The two cases:
 - **A. Foreign case** - mapping some elses `feed_id` to `recp_key`
 - **B. Self case** - mapping our own `feed_id` to `recp_key`

### A. Foreign case - mapping _some elses_ `feed_id` to `recp_key`

We define a shared key that the sender (us) + recipient can both derive:

```js
const hash = 'SHA256'
const length = 32
const salt = SHA256('envelope-dm-v1-extract-salt')

function directMessageSlotKey (my_dh_secret, my_dh_public, my_id_bfe, your_dh_public, your_id_bfe) {
  var input_keying_material = scalarmult(my_dh_secret, your_dh_public)

  var info_context = Buffer.from('envelope-ssb-dm-v1/key', 'utf8')
  var info_keys = sort([
    bfe.encode(3, 0, my_dh_public) || my_id_bfe,
    bfe.encode(3, 0, your_dh_public) || your_id_bfe
  ])
  var info = slp.encode([info_context, ...info_keys])

  return hkdf(input_keying_material, length, { salt, info, hash })
}
```

- `(dh_secret, dh_public)` is some Diffie-Hellman compatible keypair to be used for encryption 
    - currently we take feed keys (`ed25519` signing keys) and convert these to keys compatible with diffie-hellman (dh) shared key encryption (`curve25119` keys)
    - in the future we plan to generate dh encryption keys seperately
- `id_bfe` is the "id" of a feed, namely the public part of that feed's signing keypair, encoded in "type-format-key" format (see [BFE])
- `||` means Buffer concat
- `sort` means sort these 2 buffers bytewise so that the smallest is first
- `bfe.encode` is bfe encoding of the encryption key, here with `type: 3, format 0` (see [BFE])
- `slp.encode` is "shallow length-prefixed encode" (see [SLP])

The **complete key-and-scheme** you try with a slot is of form 
    ```js
    { 
      key: Buffer, // the directMessageSlotKey
      scheme: "envelope-id-based-dm-converted-ed25519"
    }
    ```

### B. Self case - mapping _our own_ `feed_id` to `recp_key`

A problem with sending a direct message to another feed is that once the message is enveloped, we don't have a record of
who the remote recipients were, so guessing which shared-key to derive (1) is hard.

A solution is to include our own `feed_id` as a recipient, and to always try a key we would have used on such messages.
We could in theory apply the same scheme as in (1), but this would involve us doing a scalar multiplaction of the public and private parts
of our key, which _should_ be safe, but we've decided not to do it.


Instead, when you see your own `feed_id` as a recipient, you're expected to **map that to a private symmetric key**, `own_key`.
Major advantages of this approach are:
- replies to original messages can use the same recps - makes coding more consistent
- this is compatible with multi-device identities - later I can send a copy of keys to other devices so they have access to the same DMs

Use a key of 32 bytes

Notes:
- the full key you try with a slot is of form `{ key, scheme: "envelope-symmetric-key-for-self" }`
- we considered using a "personal group", but this has the disadvantages:
    - makes replies hard - remote feeds do not know how to map your personal `group_id` to a symmetric key, so...?
    - includes un-cloaked tangle info about the group, which may leak private info (e.g. feeds / devices you don't want known)

The **complete key-and-scheme** for the envelope `key_recp` slot is of form
    ```js
    { 
      key: Buffer, // the directMessageSlotKey
      scheme: "envelope-id-based-dm-converted-ed25519"
    }
    ```

## Example

// TODO

## Decrypting a `feed_id` based DM

If the encrypted message is one I sent, I can decrypt it by:
- trying my `own_key` on all slots of the envelope
- you _could_ technically try each DM-key derived from `you_dh_sk` + `friend_dh_pk` ... 
    - DON'T do this, it's a super expensive brute force approach
    - with the principle that "content.recps is conserved across messages" we don't need to do this!
    - BUT, this is why `feed_id` based DMs is never truly one-way, even if you "omit yourself" from recps

If the encrypted message is from someone else, I can try decrypting it by:
- trying a key derived from `my_dh_secret` and `author_dh_public` etc.



## Using `feed_id`

It's safe to use `feed_id` anywhere in public (as these are already public).

In the context of `content.recps` we use `feed_id` so that other recipients can see who
was included in the message, but for the envelope `recp_key` we map the `feed_id` to a `shared_dm_key`
using the above definition

```js
var content = {
  //...
  recps: [
    '%g/JTmMEjG4JP2aQAO0LM8tIoRtNkTq07Se6h1qwnQKb=.cloaked',
    '@YjoQc7sLF/ye+QM09iPcDJdzQo3lQD6YvQIFhmNbEqg=.ed25519'  // << a feed_id
  ]
}
```



[SLP]: https://github.com/ssbc/envelope-spec/blob/master/encoding/slp.md
[BFE]: https://github.com/ssb-ngi-pointer/ssb-bfe-spec
