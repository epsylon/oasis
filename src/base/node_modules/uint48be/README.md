# uint48be

Encode / decode big endian unsigned 48 bit integers

```
npm install uint48be
```

[![build status](http://img.shields.io/travis/mafintosh/uint48be.svg?style=flat)](http://travis-ci.org/mafintosh/uint48be)

## Usage

``` js
var uint48be = require('uint48be')

var buf = uint48be.encode(42) // returns a 6 byte buffer with 42 encoded
console.log(uint48be.decode(buf)) // returns 42
```

## API

#### `buffer = uint48be.encode(num, [buffer], [offset])`

Encode a number as a big endian 48 bit unsigned integer.
Optionally you can pass a buffer + offset as the 2nd and 3rd argument
and the number will be encoded into that buffer at the given offset.

#### `num = uint48be.decode(buffer, [offset])`

Decode a number from a buffer.

#### `length = uint48be.encodingLength(num)`

Always returns `6`. Added to comply with the standard encoding interface in node.
Similarly `uint48be.encode.bytes` and `uint48be.decode.bytes` is also set to `6`.

## License

MIT
