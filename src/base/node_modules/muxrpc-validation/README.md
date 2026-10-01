# muxrpc validation

Validation library for [muxrpc](https://npm.im/muxrpc) apis.

```js
// create validator library
var valid = require('muxrpc-validation')({
  queryOpts: function (v) {
    if (v.reverse && typeof v.reverse != 'boolean')
      return new TypeError('opts.reverse must be a bool')
  }
})

// api manifest
var manifest = {
  usage: 'sync',
  get:   'async',
  add:   'async',
  list:  'source'
}

// api definition - wrap the functions in the validators
var api = {
  usage:   valid.sync(usage, 'string|boolean'), // multiple types
  get:     valid.async(get, 'string'),
  add:     valid.async(add, ['string'], ['string', 'object']), // multiple signatures
  put:     valid.async(add, {cbOptional: true}, 'string'), // async method works without a cb
  list:    valid.source(list, 'queryOpts?') // optional param
}

function usage (cmd) {
  // ...
}
function get (key, cb) {
  // ...
}
function add (key, value, cb) {
  if (typeof value == 'function') {
    // handle (value, cb)
    value = key
    key = value.key
    cb = value
  }
  // ...
}
function list (opts) {
  opts = opts || {}
  // ...
}
```