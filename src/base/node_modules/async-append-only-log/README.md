<!--
SPDX-FileCopyrightText: 2021 Anders Rune Jensen

SPDX-License-Identifier: CC0-1.0
-->

# Async append only log

This module is heavily inspired by [flumelog-aligned-offset]. It is an
attempt to implement the same concept but in a simpler fashion, making
it easier to reason about the code. A log is the lowest part of the
SSB stack, so it should extremly stable while still maintaining good
performance.

A log consists of a number of `blocks`, that contain a number of
`record`s. A `record` is simply it's `length`, as a 16-bit unsigned
integer, followed by the `data` bytes. A record must be in one and
only one block, which means there probably will be some empty space at
the end of a block. Blocks are always written in full.

```
<block>
  <record
    <length: UInt16LE>
    <data: Bytes>
  </record>*
</block>*
```

In contrast to flumelog-aligned-offset there is no additional `length`
after the `data` in a `record` and no pointer at the end of a
`block`. These were there to be able to iterate over the log in
reverse, but I have never seen the need for that.

Writing to the log is always async. Note this is different from
[flumelog-offset] and [flumelog-aligned-offset]. The `since`
observable will be updated once the data is written. The `onDrain`
callback can be used to know when data has been written if
needed. Streaming will only emit values that have been written to
storage. This is to ensure that a view will never get ahead of the
main log and thus end up in a bad state if the system crashes before
data is written. `get` will return values that have not been written
to disk yet.

This module is not compatible with flume without a wrapper around
stream as it uses the same terminology as [JITDB] and [ssb-db2] of
using offset for the byte position of a record instead of seq.

## API

### Open the log

```js
const OffsetLog = require('async-append-only-log')

const log = OffsetLog('/path/to/log.file', {
  /**
   * Size of the block, in bytes.
   *
   * DEFAULT: 65536
   */
  blockSize: 1024,

  /**
   * Conversion layer as an object of the shape `{encode, decode}`,
   * where `encode` defines a function (item)=>buffer when writing to disk
   * and `decode` defines a function (buffer)=>item, where `item` is what
   * you will directly interact with using async-append-only-log's APIs.
   * For JSON, use `flumecodec/json`.
   *
   * DEFAULT: `{encode: x => x, decode: x => x}`
   */
  codec: { encode, decode },

  /**
   * Amount of time to wait between writes, in milliseconds.
   *
   * DEFAULT: 250
   */
  writeTimeout: 100,

  /**
   * A function that takes a record's buffer and should return a boolean
   * indicating whether the record is "valid". Implement this to ensure the
   * record is not corrupted. When the log is loaded, all records in the latest
   * block will be checked using this.
   *
   * DEFAULT: (recordBuffer) => true
   */
  validateRecord: (recordBuffer) => {
    // ...
  },
})
```

### Write a single record

```js
log.append(item, (err, offset) => {
  // ...
})
```

### Write several records

```js
log.append([item1, item2, item3], (err, offset3) => {
  // ...
})
```

### Write several records, either all fail or all succeed

```js
log.appendTransaction([item1, item2, item3], (err, offset3) => {
  // ...
})
```

### Wait for all ongoing appends to be flushed to disk

```js
log.onDrain(() => {
  // ...
})
```

### Scan all records as a `push-stream`

```js
log.stream(opts).pipe(sink)
```

Where

```js
opts = { live, offsets, values, limit, gte, gt }
```

- `live` is a boolean indicating that you're interested only in records added
after streaming began. DEFAULT: `false`
- `offsets` is a boolean indicating you're interested in knowing the offset for each record streamed to the sink. DEFAULT: `true`
- `values` is a boolean indicating you're interested in getting the data buffer for each record streamed to the sink. DEFAULT: `true`
- `limit` is a number indicating how many records you want from the stream, after which the stream will close. DEFAULT: `0` which **means unlimited**
- `gte` and `gt` and other opts are specific to [ltgt]

```js
sink = { paused, write, end }
```

`sink` is from [push-stream]

### Read a record

```js
log.get(offset, (err, item) => {
  // ...
})
```

### Delete a record

In practice, this will just overwrite the record with zero bytes.

```js
log.del(offset, (err) => {
  // ...
})
```

### Wait for all ongoing deletes to be flushed to disk

```js
log.onDeletesFlushed(() => {
  // ...
})
```

### Keep track of the most recent record

As an [obz] observable:

```js
log.since((offset) => {
  // ...
})
```

### Get statistics on deleted records

Among other things, this is useful for knowing how much storage space you could
save by running compaction, to eliminate deleted records.

```js
log.stats((err, stats) => {
  console.log(stats)
  // { totalBytes, deletedBytes }
})
```

### Compact the log (remove deleted records)

```js
log.compact((err) => {
  // This callback will be called once, when the compaction is done.
})
```

Note, this functionality is currently not available when running in a
browser.

### Track progress of compactions

As an [obz] observable:

```js
log.compactionProgress((progress) => {
  console.log(progress)
  // {
  //   startOffset,
  //   compactedOffset,
  //   unshiftedOffset,
  //   percent,
  //   done,
  //   sizeDiff,
  //   holesFound,
  // }
})
```

Where

- `startOffset`: the starting point for compaction. All offsets smaller than
  this have been left untouched by the compaction algorithm.
- `compactedOffset`: all records up until this point have been compacted so far.
- `unshiftedOffset`: offset for the first record that hasn't yet been "moved"
  to previous slots. Tracking this allows you to see the algorithm proceeding.
- `percent`: a number between 0 and 1 to indicate the progress of compaction.
- `done`: a boolean indicating whether compaction is ongoing (`false`) or done
  (`true`).
- `sizeDiff`: number of bytes freed after compaction is finished. Only available
  if `done` is `true`.
- `holesFound`: number of deleted records that were found while compaction was
  ongoing. Only available if `done` is `true`.

### Close the log

```js
log.close((err) => {
  // ...
})
```

## Benchmarks

Running [bench-flumelog] reveals the following numbers. Async flumelog
is faster that regular flumelog-offset in all categories. The most
important numbers are append (used for onboarding) and stream (used
for building indexes). Flumelog-aligned-offset is not included in the
benchmarks, as it writes every message synchronously rendering the
results invalid.

```

async-append-only-log:

name, ops/second, mb/second, ops, total-mb, seconds
append, 923964.807, 138.002, 4620748, 690.149, 5.001
stream, 1059075.865, 158.182, 4620748, 690.149, 4.363
stream no cache, 1102803.818, 164.713, 4620748, 690.149, 4.19
stream10, 2540947.641, 379.51, 12714902, 1899.068, 5.004
random, 39715.656, 5.931, 198618, 29.664, 5.001

flumelog offset:

name, ops/second, mb/second, ops, total-mb, seconds
append, 306180.037, 45.74, 3064556, 457.817, 10.009
stream, 294511.348, 43.997, 2945408, 440.017, 10.001
stream no cache, 327724.949, 48.959, 3064556, 457.817, 9.351
stream10, 452973.302, 67.67, 4530186, 676.776, 10.001
random, 28774.712, 4.298, 287891, 43.008, 10.005

```

To run the benchmarks the small `bench-flumelog.patch` needs to be
applied.

[JITDB] results for more real world benchmarks are available as [jitdb-results].

[push-stream]: https://github.com/push-stream/push-stream
[flumelog-aligned-offset]: https://github.com/flumedb/flumelog-aligned-offset/
[flumelog-offset]: https://github.com/flumedb/flumelog-offset/
[bench-flumelog]: https://github.com/flumedb/bench-flumelog
[jitdb]: https://github.com/ssb-ngi-pointer/jitdb/
[ltgt]: https://github.com/dominictarr/ltgt
[jitdb-results]: https://github.com/arj03/jitdb/blob/master/bench.txt
[ssb-db2]: https://github.com/ssb-ngi-pointer/ssb-db2/
[obz]: https://www.npmjs.com/package/obz
