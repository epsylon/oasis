# continuable-list

<!-- [![build status][1]][2] [![dependency status][3]][4]

[![browser support][5]][6] -->

Turn an array of continuables into a continuable containing an array

## Example

```js
var list = require("continuable-list")
var fs = require("fs")

var readFile = function (uri) {
    return function continuable(cb) {
        fs.readFile(uri, cb)
    }
}

var uris = ["./package.json", "./index.js", "./README.md"]

var files = uris.map(function (uri) {
    return readFile(uri)
})

list(files)(function (err, files) {
    // now have an array of buffers or an error if one of
    // the read requests failed
})
```

## Installation

`npm install continuable-list`

## Contributors

 - Raynos

## MIT Licenced

  [1]: https://secure.travis-ci.org/Colingo/continuable-list.png
  [2]: http://travis-ci.org/Colingo/continuable-list
  [3]: https://david-dm.org/Colingo/continuable-list/status.png
  [4]: https://david-dm.org/Colingo/continuable-list
  [5]: https://ci.testling.com/Colingo/continuable-list.png
  [6]: https://ci.testling.com/Colingo/continuable-list
