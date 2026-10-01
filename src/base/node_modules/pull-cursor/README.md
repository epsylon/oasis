# pull-cursor

A pull-stream over series that have an index.

I wrote this to abstract out streams for [flumelog-offset](https://github.com/flumedb/flumelog-offset)
it makes flexible streams on ranges easy, including live streams!

## api

``` js
var inject = require('pull-cursor')
```

### inject(since, getMeta) => createStream(opts)

`since` is an `obv` instance, which represents the current length of
the dataset. `getMeta` is a function that takes an offset, an option
to use caching and callback the value plus the `next` and `prev`
offsets.

``` js
var Obv = require('obv')
var since = Obv()

//dummy example with an array as the datastore
var ary = ['A', 'B', 'C', 'D']
since.set(ary.length - 1) //set since to last index!

var createStream = require('pull-cursor')(
  since,
  function (offset, useCache, cb) {
    if(offset < 0 || offset >= ary.length)
      return cb(new Error('out of bounds:'+offset)

    cb(null, ary[offset], offset-1, offset+1)

  })
```

### createStream(opts) => Source

`createStream` now accepts all the typical options of a
levelup or flumedb stream. including
* `reverse` (boolean) read backwards
* `live` (boolean) include new items
* `old` (boolean) include old items (set to false implies `live`)
* `gt` (offset) items greater than a valid offset
* `gte` (offset) items greater or equal to a valid offset
* `lt` (offset) items less than a given offset
* `lte` (offset) items less than or equal to a given offset
* `limit` (number) stop after N items.
* `cache` (boolean) use cache of underlying

## License

MIT



