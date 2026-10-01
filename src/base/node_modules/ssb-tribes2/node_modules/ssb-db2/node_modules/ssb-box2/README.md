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

- Requires `secret-stack@^6.2.0`
- Requires `ssb-db2@>=5.0.0`

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

- `setOwnDMKey(key)`: Adds a `key` (a buffer) to the list of keys that can be
  used to encrypt messages to yourself. By specifying the direct message (DM)
  for yourself, you are free to supply that from any source. The key you provide
  _will_ be persisted locally. For direct messaging other feeds, a key is
  automatically derived.
- `addGroupInfo(groupId, groupInfo)`: `groupId` must be a string and `groupInfo` must be an object. `groupInfo` can have these keys:
  - `key` must be a buffer. The key can then be used as a "recp" to encrypt messages to the group. Note that the keys are not persisted in this module.
  - `scheme` _String_ - scheme of that encryption key (optional, there is only one option at the moment which we default to)
  - `root` _MessageId_ the id of the `group/init` message
- `listGroupIds(cb) => [groupIds]`: Lists all groupIds whose messages you're able to decrypt. Returns a promise if cb isn't provided.
- `getGroupKeyInfo(id, cb) => { key, scheme }`: Gets the key and scheme for a group. Returns a promise if cb isn't provided.

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

[ssb db2]: https://github.com/ssb-ngi-pointer/ssb-db2/
[ssb-tribes]: https://github.com/ssbc/ssb-tribes/
[ssb-keyring]: https://gitlab.com/ahau/lib/ssb-keyring/
