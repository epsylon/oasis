# append-batch

append stuff to a log. It's important that we can reason about the order,
so do not perform parallel writes.

To use this, pass in a function that processes a single batch.


## Example

an batch append on top of leveldb, using timestamps as keys.

``` js
var Append = require('append-batch')
var timestamp = require('monotonic-timestamp')
var db = level(path...) //example with leveldb.

var append = Append(function (batch, cb) {
  var ops = []

  function add (value) {
    opts.push({key: Date.now(), value: value, type: 'put'}
  }
  batch.forEach(function (value) {
    if(Array.isArray(value) value.forEach(add)
    else add(value)
  })

  db.batch(opts, cb)
})

//append a single value
append({foo: 'bar'}, function (err) {
  //the value is definitely written by now
})

```

## api

## Append(writeBatch(values, cb)) => append(value, cb)

create an `append` function. `writeBatch` is a function that takes an array
of values or arrays of values (which represents a batch operation)



## License

MIT

