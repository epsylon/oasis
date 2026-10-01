# SSB BFE

Javascript implementation of the [SSB binary field encodings] spec.

The spec only has one type of **nil**, but JavaScript has two: `null` and
`undefined`. ssb-bfe will treat these two values in a way that mirrors what
JSON.stringify does:

- BFE Encoding an **object** with a `null` field becomes an object with the
**nil** marker
  - Similar to `JSON.stringify({a: null}) === '{"a": null}'`
- BFE Encoding an **array** with a `null` element becomes an array with the
**nil** marker
  - Similar to `JSON.stringify([null]) === '[null]'`
- BFE Encoding an **object** with a `undefined` field will **omit** that field
  - Similar to `JSON.stringify({a: undefined}) === '{}'`
- BFE Encoding an **array** with an `undefined` element becomes an array with
the **nil** marker
  - Similar to `JSON.stringify([undefined]) === '[null]'`

## API

### encode(input)

Takes any JavaScript primitive and returns its encoded counterpart. Is applied
recursively in case the input is an object or an array. All inputs are converted
to [TFD] Buffers, except for objects, arrays, and numbers, which remain the
same.

### decode(input)

Takes an encoded value (such as the output from `encode`) and returns the
decoded counterparts as JavaScript primitives.

### bfeTypes()

Returns the `bfe.json` object that can be used to look up information
based on Type and Field. Example:

```
const { bfeTypes } = require('ssb-bfe')
const classic_key_size = bfeTypes[0][0].data_length
```

### bfeNamedTypes()

Returns the `bfe.json` object converted to a map where the keys are
the type and format names. Example:

```
const { bfeNamedTypes } = require('ssb-bfe')
const FEED = bfeNamedTypes['feed']
const CLASSIC_FEED_TF = Buffer.from([FEED.code, FEED.formats['ssb/classic'].code])
```

[ssb binary field encodings]: https://github.com/ssb-ngi-pointer/ssb-binary-field-encodings-spec
[TFD]: https://github.com/ssbc/envelope-spec/blob/master/encoding/tfk.md
