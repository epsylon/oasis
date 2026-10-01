<!--
SPDX-FileCopyrightText: 2021 Anders Rune Jensen

SPDX-License-Identifier: CC0-1.0
-->

# Atomic-file-rw

This module is meant as a replacement for
[atomic-file](https://github.com/flumedb/atomic-file) as it has better
error handling on node and is faster in the browser.

The library is written to handle writing to a few number of files in a
safe manner. Concurrent writes to the same file are completed in the
order they are started. A temporary file with the same filename as the
original — with a suffix `~` — is employed to ensure atomicity.

## Example

Write a buffer to file and read it again:

```js
const atomic = require('atomic-file-rw')

atomic.writeFile("test.txt", Buffer.from('GREETINGS'), (err, x) => {
  atomic.readFile("test.txt", (err, buf) => {
    console.log(buf.toString())
  })
})
```

## API

### `atomic.readFile(path[, options], callback)`

Same arguments as Node.js's `fs.readFile`, but in the browser the
`options` is ignored.

### `atomic.writeFile(file, data[, options], callback)`

Same arguments as Node.js's `fs.writeFile`, but in the browser the
`options` is ignored.

### `atomic.deleteFile(file, callback)`

Same arguments as Node.js's `fs.unlink`.
