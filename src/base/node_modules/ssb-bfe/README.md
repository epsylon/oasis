<!--
SPDX-FileCopyrightText: 2021 Anders Rune Jensen

SPDX-License-Identifier: CC0-1.0
-->

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

### `encode(input)`

Takes any JavaScript primitive and returns its encoded counterpart. Is applied
recursively in case the input is an object or an array. All inputs are converted
to [TFD] Buffers, except for objects, arrays, and numbers, which remain the
same.

### `decode(input)`

Takes an encoded value (such as the output from `encode`) and returns the
decoded counterparts as JavaScript primitives.

### `decodeTypeFormat(input, typeName, formatName)`

Takes an encoded value (such as the output from `encode`), a typeName
and formatName and returns the decoded counterparts as JavaScript
primitives. This is much faster than decode if you know the type.

### `bfeTypes`

Returns the `bfe.json` object that can be used to look up information
based on Type and Field. Example:

```
const { bfeTypes } = require('ssb-bfe')
const classic_key_size = bfeTypes[0][0].data_length
```

### `bfeNamedTypes`

Returns the `bfe.json` object converted to a map where the keys are
the type and format names. Example:

```js
const { bfeNamedTypes } = require('ssb-bfe')
const FEED = bfeNamedTypes['feed']
const CLASSIC_FEED_TF = Buffer.from([FEED.code, FEED.formats['classic'].code])
```

### `toTF(typeName, formatName)`

Sometimes when you're wanting to check what sort of buffer you're handling, you want
to pivot on the type and format bytes.

```js
const CLASSIC_MSG_TF = Buffer.from([1, 0])  // << Did I get the right codes?

if (buf.slice(0, 2).equals(CLASSIC_MSG_TF)) {
  // ...
}
```

because remembering those codes is tricky, it's safer to use this convenience method:
```js
const CLASSIC_MSG_TF = bfe.toTF('msg', 'classic')
```

If you remembered the type or format name wrong, you'll instantly get an error!

### Check whether a buffer is an encoded type

Given any input, these functions tell you whether the input is of the specified
type (and format, if applicable). Example:

```js
const bfe = require('ssb-bfe')

const x = bfe.encode('@6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0=.ed25519')

bfe.isEncodedFeedClassic(x) // true
```

List of functions:

- `isEncodedFeed(input) => boolean`
- `isEncodedFeedClassic(input) => boolean`
- `isEncodedFeedGabbygroveV1(input) => boolean`
- `isEncodedFeedBamboo(input) => boolean`
- `isEncodedFeedBendybuttV1(input) => boolean`
- `isEncodedFeedButtwooV1(input) => boolean`
- `isEncodedMessage(input) => boolean`
- `isEncodedMessageClassic(input) => boolean`
- `isEncodedMessageGabbygroveV1(input) => boolean`
- `isEncodedMessageCloaked(input) => boolean`
- `isEncodedMessageBamboo(input) => boolean`
- `isEncodedMessageBendybuttV1(input) => boolean`
- `isEncodedMessageButtwooV1(input) => boolean`
- `isEncodedBlob(input) => boolean`
- `isEncodedBlobClassic(input) => boolean`
- `isEncodedEncryptionKey(input) => boolean`
- `isEncodedEncryptionKeyBox2DmDh(input) => boolean`
- `isEncodedEncryptionKeyBox2PoboxDh(input) => boolean`
- `isEncodedSignature(input) => boolean`
- `isEncodedSignatureMsgEd25519(input) => boolean`
- `isEncodedEncrypted(input) => boolean`
- `isEncodedEncryptedBox1(input) => boolean`
- `isEncodedEncryptedBox2(input) => boolean`
- `isEncodedGeneric(input) => boolean`
- `isEncodedGenericStringUTF8(input) => boolean`
- `isEncodedGenericBoolean(input) => boolean`
- `isEncodedGenericNil(input) => boolean`
- `isEncodedGenericAnyBytes(input) => boolean`
- `isEncodedIdentity(input) => boolean`
- `isEncodedIdentityPoBox(input) => boolean`


[ssb binary field encodings]: https://github.com/ssb-ngi-pointer/ssb-binary-field-encodings-spec
[TFD]: https://github.com/ssbc/envelope-spec/blob/master/encoding/tfk.md
