# continuable-hash

<!-- [![build status][1]][2] [![dependency status][3]][4] -->

<!-- [![browser support][5]][6] -->

Turn a hash of continuables into a continuable containing a hash of values

## Example

```js
var fs = require("fs")
var hash = require("continuable-hash")

var file1 = function (cb) {
    fs.readFile("~/foo", cb)
}
var file2 = function (cb) {
    fs.readFile("~/bar", cb)
}

hash({ file1: file1, file2: file2 })(function (err, tuple) {
    if (err) {
        throw err
    }

    var file1 = tuple.file1
    var file2 = tuple.file2
    /* do stuff */
})
```

## Installation

`npm install continuable-hash`

## Contributors

 - Raynos

## MIT Licenced

  [1]: https://secure.travis-ci.org/Colingo/continuable-hash.png
  [2]: http://travis-ci.org/Colingo/continuable-hash
  [3]: https://david-dm.org/Colingo/continuable-hash/status.png
  [4]: https://david-dm.org/Colingo/continuable-hash
  [5]: https://ci.testling.com/Colingo/continuable-hash.png
  [6]: https://ci.testling.com/Colingo/continuable-hash
