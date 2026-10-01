# random-access-idb

[random-access][1]-compatible indexedDB storage layer

[1]: https://npmjs.com/package/abstract-random-access

# example

``` js
var random = require('random-access-idb')('dbname')
var cool = random('cool.txt')
cool.write(100, new Buffer('GREETINGS'), function (err) {
  if (err) return console.error(err)
  cool.read(104, 3, function (err, buf) {
    if (err) return console.error(err)
    console.log(buf.toString()) // TIN
  })
})
```

# api

``` js
var random = require('random-access-idb')
```

## var db = random(dbname, opts)

Open an indexedDB database at `dbname`.

Any `opts` provided are forwarded to `db(name, opts)` as default options.

## var file = db(name, opts)

Create a handle `file` from `name` and `opts`:

* `opts.size` - internal chunk size to use (default 4096)

You must keep `opts.size` the same after you've written data.
If you change the size, bad things will happen.

## file.read(offset, length, cb)

Read `length` bytes at an `offset` from `file` as `cb(err, buf)`.

## file.write(offset, buf, cb)

Write `buf` to `file` at an `offset`.

# install

npm install random-access-idb

# license

BSD
