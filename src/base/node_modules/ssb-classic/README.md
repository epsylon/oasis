<!--
SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros <contact@staltz.com>

SPDX-License-Identifier: CC0-1.0
-->

# ssb-classic

This module is a plugin for ssb-db2 which implements the classic SSB feed format. You can use this module as an ssb-db2 plugin, or you can use it as a standalone tool to generate and validate classic messages.

## Installation

```bash
npm install ssb-classic
```

## Usage in ssb-db2

YOU MOST LIKELY DON'T NEED TO DO THIS, because ssb-db2 bundles ssb-classic already. But maybe one day ssb-db2 won't bundle it anymore, and then you _would_ have to do this.

- Requires **Node.js 12** or higher
- Requires `secret-stack@^6.2.0`
- Requires `ssb-db2@>=5.0.0`

```diff
 SecretStack({appKey: require('ssb-caps').shs})
   .use(require('ssb-master'))
+  .use(require('ssb-db2'))
+  .use(require('ssb-classic'))
   .use(require('ssb-conn'))
   .use(require('ssb-blobs'))
   .call(null, config)
```

## Usage as a standalone

```js
const ssbKeys = require('ssb-keys');
const classicFormat = require('ssb-classic');

const msgVal = classicFormat.newNativeMsg({
  keys: ssbKeys.generate(),
  content: {
    type: 'post',
    text: 'Hello, world!',
  },
  timestamp: Date.now(),
  previous: null,
  hmacKey: null,
});
```

This module conforms with [ssb-feed-format](https://github.com/ssbc/ssb-feed-format) so with ssb-classic you can use all the methods specified by ssb-feed-format.

## License

LGPL-3.0-only
