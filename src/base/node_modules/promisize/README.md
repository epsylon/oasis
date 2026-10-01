# promisize [![Build Status](https://travis-ci.org/xuset/promisize.svg?branch=master)](https://travis-ci.org/xuset/promisize) [![npm](https://img.shields.io/npm/v/promisize.svg)](https://npmjs.org/package/promisize)

#### Easily support both callbacks and promises in your js lib

**promisize** takes your function's callback argument and returns a new callback with a `promise` property. When the new callback is called, it either calls the original callback or if no callback was given it fulfills the promise. **promisize** is lightweight and does not include any promise shims or dependencies but instead uses the globally defined `Promise`. If `Promise` is not defined (i.e. no native promise support) then callbacks still work as they would without **promisize**.

## Usage

```js
var promisize = require('promisize')

function someAsyncFunction (cb) {
  cb = promisize(cb)

  // Do some async stuff then
  setTimeout(function () {
    cb(null, 'foobar')
  })

  // Undefined if there is no Promise support
  // or if the original callback was defined
  return cb.promise
}
```

## API

### `var cb = promisize(function callback (err, result) {})`

`promisize` takes a nodejs style callback and returns another nodejs style callback. When the returned callback is called it either calls the original callback or fulfills the promise but never both.

### `cb.promise`

The returned `cb` has a `promise` property that is only defined if the environment has Promise support (i.e. `Promise` is defined) and the original callback was undefined. When the returned callback is called it fulfills this promise if it is defined or calls the original callback if the promise is undefined.

## License

MIT. Copyright (c) Austin Middleton.
