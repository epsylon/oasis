<!--
SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros <contact@staltz.com>

SPDX-License-Identifier: CC0-1.0
-->

# ssb-box

This module implements the original "private-box" encryption format for SSB. You can use this module as an ssb-db2 plugin, or you can use it as a standalone tool to encrypt and decrypt messages.

## Installation

- Requires **Node.js 12** or higher

```bash
npm install ssb-box
```

## Usage in ssb-db2

YOU MOST LIKELY DON'T NEED TO DO THIS, because ssb-db2 bundles ssb-box already. But maybe one day ssb-db2 won't bundle it anymore, and then you _would_ have to do this.

- Requires `secret-stack@^6.2.0`
- Requires `ssb-db2@>=5.0.0`

```diff
 SecretStack({appKey: require('ssb-caps').shs})
   .use(require('ssb-master'))
+  .use(require('ssb-db2'))
+  .use(require('ssb-box'))
   .use(require('ssb-conn'))
   .use(require('ssb-blobs'))
   .call(null, config)
```

## Usage as a standalone

This module conforms with [ssb-encryption-format](https://github.com/ssbc/ssb-encryption-format) so with ssb-box you can use all the methods specified by ssb-encryption-format.

```js
const ssbKeys = require('ssb-keys');
const boxFormat = require('ssb-box/format');

const keys = ssbKeys.generate('ed25519', 'alice');
const opts = {recps: [keys.id], keys};

const plaintext = Buffer.from('hello');
console.log(plaintext);
// <Buffer 68 65 6c 6c 6f>

const ciphertext = boxFormat.encrypt(plaintext, opts);
console.log(ciphertext);
// <Buffer 9e 60 59 b7 02 a3 c8 74 0f 1e 3c b9 b7 99 80 b4 cb f1 35 a0 48 40 16 d4 fa b9 a6 18 37 f0 cc 1c 37 18 e0 c0 a4 c4 3a 9e 3a 74 6a 89 1f 50 0d 4f 78 6a ... 76 more bytes>

const decrypted = boxFormat.decrypt(ciphertext, opts);
console.log(decrypted);
// <Buffer 68 65 6c 6c 6f>
```

## License

LGPL-3.0-only
