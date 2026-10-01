<!--
SPDX-FileCopyrightText: 2021 Anders Rune Jensen

SPDX-License-Identifier: CC0-1.0
-->

# ssb-box2

A module for encrypting and decrypting messages with box2 in [SSB DB2]. Messages
created using this module are compatible with [ssb-tribes].

You can use this module as an ssb-db2 plugin, or you can use it as a standalone
tool to encrypt and decrypt messages.

## Installation

- Requires **Node.js 12** or higher

```bash
npm install ssb-box2
```

## Usage in ssb-db2

- Requires `secret-stack>=6.2.0`
- Requires `ssb-db2>=5.0.0`
- Requires `ssb-meta-feeds>=0.38.0`

The example below shows how to encrypt a message to yourself using box2.

```js
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const ssbKeys = require('ssb-keys')

const keys = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))

const sbot = SecretStack({ caps })
  .use(require('ssb-db2'))
  .use(require('ssb-box2')) // <-- ADD THIS AS A PLUGIN
  .call(null, { path: './', keys })

const testkey = Buffer.from(
  '30720d8f9cbf37f6d7062826f6decac93e308060a8aaaa77e6a4747f40ee1a76',
  'hex'
)

sbot.box2.setOwnDMKey(testkey)

sbot.db.create(
  {
    content: { type: 'post', text: 'super secret', recps: [keys.id] }
    encryptionFormat: 'box2'
  },
  (err, privateMsg) => {
    // privateMsg is now encrypted using box2
  }
)
```

### Methods

Adding this module as a secret-stack plugin means that you can use these methods
on the `sbot.box2` namespace:

- `setOwnDMKey(key)`: Sets a `key` (a buffer) as the key that will be
  used to encrypt messages to yourself. By specifying the direct message (DM)
  for yourself, you are free to supply that from any source. The key you provide
  _will_ be persisted locally. For direct messaging other feeds, a key is
  automatically derived.
- `getOwnDMKey(cb)`: Gets the key that would be used for DM'ing yourself. On the format `{ key, scheme }`.
- `addGroupInfo(groupId, addInfo, cb)`: `groupId` must be a cloaked message Id or a uri encoded group and `addInfo` must be an object. Can be called multiple times to add multiple read keys. The first key that is added will automatically also be set as the write key. To change the write key, use `pickGroupWriteKey`. If you add a key to an excluded group, the group will be un-excluded. Returns a promise if cb isn't provided. `addInfo` can have these keys:
  - `key` must be a buffer. The key can then be used for decrypting messages from the group, and if picked with `pickGroupWriteKey`, as a "recp" to encrypt messages to the group. Note that the keys are not persisted in this module.
  - `scheme` _String_ - scheme of that encryption key (optional, there is only one option at the moment which we default to)
  - `root` _MessageId_ the id of the `group/init` message
- `excludeGroupInfo(groupId, cb)`: Removes the writeKey from a groupId and marks the group as excluded. Useful for instance if you or someone else has excluded you from the group. Getting info about the group will return the old group info minus the `writeKey` and plus an `excluded` field set to `true`. Returns a promise if cb isn't provided.
- `listGroupIds({ live, excluded }) => PullStream<groupIds>`: Returns a pull stream of all groupIds whose messages you're able to decrypt. If `live` is true then it returns a pull stream with all previous but also all future group ids. If `excluded` is true then it returns only excluded groups (groups you've been excluded from) instead of only non-excluded groups.
- `pickGroupWriteKey(groupId, pickedKey, cb)`: Picks one of the group's current read keys to be the group's write key. The picked key needs to exactly match one of the read keys. Returns a promise if cb isn't provided.
  - `groupId`: cloaked message id or uri encoded group id.
  - `pickedKey`: `{key: Buffer, scheme: string }` format
- `getGroupInfo(groupId, cb) => { writeKey, readKeys, root }`: Gets the currently stored information for a group. Returns a promise if cb isn't provided.

  - `writeKey`: a `groupKey`
  - `readKeys`: an array of `groupKey`s
  - `root`: the id of the `group/init` message

  where `groupKey` is an object containing a `key` buffer and a `scheme` string.

- `getGroupInfoUpdates(groupId) => PullStream<groupInfo>`: Like `getGroupInfo` but instead returns a live pull stream that outputs the group info and then any time the group info is updated.
- `canDM(myLeafFeedId, theirRootFeedId, cb)`: Checks if you can create an encrypted message ("DM") for a given `theirRootFeedId` (which must be a bendybutt-v1 root metafeed ID) using your `myLeafFeedId` as the author. Delivers a boolean on the callback.
- `addPoBox(poBoxId, info, cb)`: Stores the key to a poBox. Returns a promise if cb isn't provided.

  where
  - `poBoxId` *String* is an SSB-URI for a P.O. Box
  - `info` *Object*
      - `info.key` *Buffer* - the private part of a diffie-hellman key
      - `info.scheme` *String* the scheme associated with that key (currently optional (undefined by default))

- `hasPoBox(poBoxId, cb) => Boolean`: If a poBox with the given id is currently stored. Returns a promise if cb isn't provided.

- `getPoBox(poBoxId, cb) => keyInfo`: Gets a poBox's key info if stored. An object with a `key` buffer and a `scheme` if a scheme was stored. Returns a promise if cb isn't provided.
- `listPoBoxIds(poBoxId) => PullStream<poBoxId>`: A pull stream of all the currently stored poBox ids.

## DM Encryption

When one of the `recps` is your foreign feed, then the encrypted message is a
"DM" for that foreign feed, and it'll create a Diffie-Hellman exchange.

ssb-box2 expects that the foreign feed is a root metafeed ID, and internally it
will find the leaf feed ID that corresponds to your leaf feed ID to derive the
shared secret. **This means that you need to have `ssb-meta-feeds` installed**.
NOTE: the foreign feed (the one in the `recps` array) MUST be a root metafeed
ID, not a leaf feed ID.

You can choose to disable metafeeds support by setting the legacy configuration
option in your ssb-config object:

```
{
  box2: {
    legacyMode: true
  }
}
```

In legacy mode, any feed ID in `recps` will be used directly in a Diffie-Hellman
exchange to create a shared secret for DMs.

## Usage as a standalone

This module conforms with [ssb-encryption-format](https://github.com/ssbc/ssb-encryption-format)
so with ssb-box2 you can use all the methods specified by ssb-encryption-format.

```js
const ssbKeys = require('ssb-keys')
const Box2Format = require('ssb-box2/format')

const keys = ssbKeys.generate('ed25519', 'alice')
const box2Format = Box2Format()

box2Format.setup({ keys }, () => {
  box2Format.setOwnDMKey(Buffer.alloc(32, 'abc'))
  const opts = { recps: [keys.id], keys, previous: null, author: keys.id }

  const plaintext = Buffer.from('hello')
  console.log(plaintext)
  // <Buffer 68 65 6c 6c 6f>

  const ciphertext = box2Format.encrypt(plaintext, opts)

  const decrypted = box2Format.decrypt(ciphertext, opts)
  console.log(decrypted)
  // <Buffer 68 65 6c 6c 6f>
})
```

## Config

The keys and data will by default be stored at `SSB_DIR/keyring`. You can change the `SSB_DIR` like normal by setting `config.path` and you can change the `"keyring"` part by setting `config.box2.path`.

[ssb db2]: https://github.com/ssb-ngi-pointer/ssb-db2/
[ssb-tribes]: https://github.com/ssbc/ssb-tribes/
[ssb-keyring]: https://gitlab.com/ahau/lib/ssb-keyring/
