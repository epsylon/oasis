<!--
SPDX-FileCopyrightText: 2021 Anders Rune Jensen

SPDX-License-Identifier: CC0-1.0
-->

# ssb-about-self

> An SSB secret-stack plugin for _profile data_ using ssb-db2

## Install

```
npm install ssb-about-self
```

## Usage

- Requires **Node.js 12** or higher
- Requires `secret-stack@^6.2.0`
- Requires `ssb-db2@>=3.4.0`

```diff
 SecretStack({appKey: require('ssb-caps').shs})
   .use(require('ssb-master'))
+  .use(require('ssb-db2'))
+  .use(require('ssb-about-self'))
   .use(require('ssb-conn'))
   .use(require('ssb-blobs'))
   .call(null, config)
```

This plugin indexes only self-assigned about messages in contrast to
[ssb-social-index](https://github.com/ssbc/ssb-social-index) that indexes all
about messages.

Example usage:

```js
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')

const ssb = SecretStack({ caps })
  .use(require('ssb-db2'))
  .use(require('ssb-db2/about-self')) // include index
  .call(null, { path: './' })

ssb.aboutSelf.get(ssb.id, (err, profile) => {
  console.log('My profile name is: ' + profile.name)
})
```

The **`profile`** object has the following fields:

- `name`: string
- `description`: string
- `image`: blob ID as a string

## API

## `ssb.aboutSelf.get(feedId, cb)` (muxrpc "async")

- `feedId`: the feedId to get the profile for
- `cb`: callback(err, profile)

Async API to get the latest self-assigned profile data for the given `feedId`.

## `ssb.aboutSelf.stream(feedId)` (muxrpc "source")

- `feedId`: the feedId to get the profile for

pull-stream "source" API to get the latest self-assigned profile data for the
given `feedId` followed by any live updates to that profile.

## License

LGPL-3.0
