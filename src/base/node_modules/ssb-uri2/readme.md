# ssb-uri2

> An SSB utility library for handling and converting SSB URIs

This library provides utilities that recognize SSB URIs according to the [spec](https://github.com/ssb-ngi-pointer/ssb-uri-spec), and is compatible with [ssb-uri](https://github.com/fraction/ssb-uri) (prior work), while adding more support and more utilities.

## Install

```
npm install ssb-uri2
```

## Example

```js
const ssbUri = require('ssb-uri2');

const exampleURI =
  'ssb:message/classic/g3hPVPDEO1Aj_uPl0-J2NlhFB2bbFLIHlty-YuqFZ3w=';

ssbUri.isClassicMessageSSBURI(exampleURI);
// true

ssbUri.toMessageSigil(exampleURI);
// '%g3hPVPDEO1Aj/uPl0+J2NlhFB2bbFLIHlty+YuqFZ3w=.sha256'
```

## Boolean APIs

### `isSSBURI(uri: string | uri): boolean`

### `isClassicFeedSSBURI(uri: string | null): boolean`

### `isBendyButtV1FeedSSBURI(uri: string | null): boolean`

### `isButtwooV1FeedSSBURI(uri: string | null): boolean`

### `isIndexedV1FeedSSBURI(uri: string | null): boolean`

### `isGabbyGroveV1FeedSSBURI(uri: string | null): boolean`

### `isFeedSSBURI(uri: string | null): boolean`

### `isClassicMessageSSBURI(uri: string | null): boolean`

### `isBendyButtV1MessageSSBURI(uri: string | null): boolean`

### `isGabbyGroveV1MessageSSBURI(uri: string | null): boolean`

### `isButtwooV1MessageSSBURI(uri: string | null): boolean`

### `isIndexedV1MessageSSBURI(uri: string | null): boolean`

### `isMessageSSBURI(uri: string | null): boolean`

### `isClassicBlobSSBURI(uri: string | null): boolean`

### `isAddressSSBURI(uri: string | null): boolean`

### `isEncryptionKeyBox2DMDiffieHellmanSSBURI(uri: string | null): boolean`

### `isIdentityPOBoxSSBURI(uri: string | null): boolean`

### `isIdentityGroupSSBURI(uri: string | null): boolean`

### `isIdentityFusionSSBURI(uri: string | null): boolean`

### `isIdentitySSBURI(uri: string | null): boolean`

### `isExperimentalSSBURI(uri: string | null): boolean`

### `isExperimentalSSBURIWithAction(action: string): (uri: string) => boolean`

## Regular Expressions

### `getFeedSSBURIRegex() => RegExp`

### `getMessageSSBURIRegex() => RegExp`

## Conversion APIs

### `fromFeedSigil(sigil: string): string`

### `fromMessageSigil(sigil: string): string`

### `fromBlobSigil(sigil: string): string`

### `fromMultiserverAddress(msaddr: string): string`

### `toFeedSigil(uri: string): string | null`

### `toMessageSigil(uri: string): string | null`

### `toBlobSigil(uri: string): string | null`

### `toMultiserverAddress(uri: string): string | null`

### `compose(parts: {type, format, data, extraData}): string`

### `decompose(uri: string): {type, format, data, extraData}`

The object `{type, format, data}` is such that it matches `ssb:${type}/${format}/${data}`, except the `data` is always in normal Base64 (i.e. **not** URI safe).

There is also the case of `extraData` for special URIs such as `ssb:feed/buttwoo-v1/${data}/${extraData}`.

## License

LGPL-3.0
