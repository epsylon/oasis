<!--
SPDX-FileCopyrightText: 2021 Anders Rune Jensen

SPDX-License-Identifier: CC0-1.0
-->

# SSB Bendy Butt

Implementation of [bendy butt] in JS.

You can use this module as an ssb-db2 plugin, or you can use it as a standalone tool to generate and validate bendybutt messages.

## Installation

```bash
npm install ssb-bendy-butt
```

Requires Node.js 12 or higher.

## Usage in ssb-db2

- Requires **Node.js 12** or higher
- Requires `secret-stack@^6.2.0`
- Requires `ssb-db2@>=5.0.0`

```diff
 SecretStack({appKey: require('ssb-caps').shs})
   .use(require('ssb-master'))
+  .use(require('ssb-db2'))
+  .use(require('ssb-bendy-butt'))
   .use(require('ssb-conn'))
   .use(require('ssb-blobs'))
   .call(null, config)
```

Now you can call ssb-db2's `create(opts)` API providing `opts.feedFormat` as `"bendybutt-v1"`.

## Usage as a standalone

Notice you import the `/format` from the module.

```js
const ssbKeys = require('ssb-keys');
const bendyButtFormat = require('ssb-bendy-butt/format');

const msgVal = bendyButtFormat.newNativeMsg({
  keys: ssbKeys.generate(null, null, 'bendybutt-v1'),
  content: {
    type: 'post',
    text: 'Hello, world!',
  },
  timestamp: Date.now(),
  previous: null,
  hmacKey: null,
});
```

This module conforms with [ssb-feed-format](https://github.com/ssbc/ssb-feed-format) so with ssb-bendy-butt you can use all the methods specified by ssb-feed-format.

[bendy butt]: https://github.com/ssb-ngi-pointer/bendy-butt-spec
