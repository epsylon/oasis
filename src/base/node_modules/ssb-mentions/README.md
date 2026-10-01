# ssb-mentions

extract the mentions in a ssb message, just using the markdown.
this is _mostly compatible_ with the way patchwork does it.
but simpler, because it relies only on the markdown.

``` js
var mentions = require('ssb-mentions')

var ary = mentions(markdown, opts)

```

## options

- `bareFeedNames` (boolean, default false): if true, include stub mention
  objects for bare feed name mentions, in the format
  `{name: "NAME", link: "@"}`. these can then have the `link` filled in with a
  feed id, to make a "patchwork-style mention", or be removed from the mentions
  array before publishing.
- `emoji` (boolean, default false): if true, include emoji in the mentions
  array, in the form `{name: "NAME", emoji: true}`.

## License

MIT
