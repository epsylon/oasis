# multiblob

A content-addressable-store that supports multiple hashing algorithms,
and pull-streams.

## example

``` js
var Blobs = require('multiblob')

var blobs = Blobs({ dir: '/media/blobCollection' })

pull(
  source, // a buffer stream e.g. from pull-file
  blobs.add(function (err, hash) {
    console.log('added source to blobs:', hash)
  })
)
```

## API

### Blobs(config) => blobs

where config is an Object with properties:
- `dir` _String_ - the directory to store blobs in
- `alg` _String_ (optional) - the algorithm for hashing. Valid options: `'blake2s'`, `'sha256'` (default: `'blake2s'`)
- `encode` _Function_ (optional) - converts a buffer to a string (default: see `util.js#encode`)
- `decode` _Function_ (optional) - recovers a string into an object `{ hash: Buffer, alg }` (default: see `util.js#decode`)
- `isHash` _Function_ (optional) - tests a string to check if it's a valid hash (default: see `util.js#isHash`)

### blobs.add (hash?, cb?) => Sink

Create a sink stream for writing a blob.
Expects to receive a buffer stream.

If `hash` was given, then it will error if the file turned out to be different.
If a `cb` is not given and there was an error, this function will throw.

### blobs.get (hash || opts) => Source

Takes the hash of blob already in the store and return a source buffer stream.
If the file does not exist this stream will error.

If the argument is a `hash` string, then return the stream.
If the argument is an `opts` object, with the `key: hash` property,
retrive that blob, but error if the size does not exactly match the
`size` property, or is over `max` property (in bytes)

### blobs.getSlice(opts) => Source

create a source stream that reads a slice of a given blob,
from the `start` property to the `end` property, in bytes.
Error if the file does not exist or if
the size of the whole blob does not exactly match the
`size` property, or is over `max` property (in bytes).

### blobs.has(hash, cb)

check if the given hash is in the store.
If `hash` is an array of hashes,
`size` will callback with an array of booleans.

### blobs.size(hash, cb)

get the size of this blob. If `hash` is an array of hashes,
`size` will callback with an array of sizes.
If the hash does not exist in the store, `size` will callback `null`.


### blobs.ls() => Source

source stream that reads the list of hashes available in the store.

### blobs.rm(hash, cb)

remove a hash from the store.

### blobs.isEmptyHash(hash)

Check if a given hash is actually the empty hash. If something has the empty hash,
that is probably a bug. The above methods will act like the empty file is already in the store.

### blobs.meta

???

### blobs.resolve

???


## todo

maybe emit events when blobs are stored?

## License

MIT
