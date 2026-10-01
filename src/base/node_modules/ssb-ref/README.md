# ssb-ref

check if a string is a valid ssb-reference, also parses addresses

``` js
var ref = require('ssb-ref')

//check if a string is a link (sigil ++ base64, 44 chars ++ algo tag)
ref.isLink('%Lihvp+fMdt5CihjbOY6eZc0qCe0eKsrN2wfgXV2E3PM=.sha25s')

//check if a string is a feed id
ref.isFeed('@nUtgCIpqOsv6k5mnWKA4JeJVkJTd9Oz2gmv6rojQeXU=.ed25519')

//check if a string is a message id
ref.isMsg('%MPB9vxHO0pvi2ve2wh6Do05ZrV7P6ZjUQ+IEYnzLfTs=.sha256')

//check if a string is a blob id
ref.isBlob('&Pe5kTo/V/w4MToasp1IuyMrMcCkQwDOdyzbyD5fy4ac=.sha256')

//extract a ref out of a url
ref.extract('http://localhost:7777/#/msg/%pGzeEydYdHjKW1iIchR0Yumydsr3QSp8+FuYcwVwi8Q=.sha256?foo=bar')
 == '%pGzeEydYdHjKW1iIchR0Yumydsr3QSp8+FuYcwVwi8Q=.sha256'
//url-encoding is supported
ref.extract('http://localhost:7777/#/msg/%25pGzeEydYdHjKW1iIchR0Yumydsr3QSp8%2BFuYcwVwi8Q%3D.sha256?foo=bar')
 == '%pGzeEydYdHjKW1iIchR0Yumydsr3QSp8+FuYcwVwi8Q=.sha256'
```

## api

### isLink(string)

returns true if `string` is a either a feed, message, or blob reference.
it may also include a query string at the end.

### isFeed(string), isMsg(string), isCloakedMsg(string), isBlob(string)

returns true if `string` is a feed id, a message id or a blob id,
respectively. id must not have a query string.

Aliases: `isFeedId`, `isMsgId`, `isCloakedMsgId`, `isBlobId`

### isFeedType(string), isMsgType (string), isBlobType(string)

A generalisation of `isFeed`, `isMsg`, `isBlob`.
Where e.g.
- isFeed checks if a string is of pattern: @ + <base64, 32bytes> + '.ed2519'
- isFeedType checks for a pattern: @ + <base64, any number bytes> + '.' + suffix

where `suffix` is any non-empty string made up of: digits, letters, and `-`

Same is true for isMsgType, isBlobType

### isBlobLink (string), isMsgLink(string)

return true is a link, but may also have a query string.

### normalizeChannel (string)

removes punctuation to make a standard channel name

### isAddress (string | object)

returns true if `string` is a multiserver address,
or a legacy address, or if `object` is a parsed legacy address
(with `{host, port, key}` properties).

### getKeyFromAddress (addr)

returns a feed id of the address in this key.
(assumes there is a `shs:` protocol in the address,
including accepts future version of shs).

returns `undefined` if it fails to parse a key.

### isInvite(invite)

returns true if `invite` is a valid invite, either legacy or
multiserver style.

### type (string)

if string is one of the formats understood by ssb-ref, then
return the name of the type. otherwise return false.
output may be `"feed", "msg", "blob", "address", "invite"` or `false`.

### extract (string)

if `string` contains a ref, return just the ref,
ignoring anything else.


### toMultiServerAddress

convert a legacy address object to a valid multiserver address.
note, because `toLegacyAddress` may throw away portions of the
multiserver address, `toMultiServerAddress(toLegacyAddress(addr))`
might not equal `addr`

## deprecated

### toLegacyAddress(string)

convert a multiserver address to a legacy address object.


### parseLegacyInvite (string)

return the components of a legacy invite, same output
as `parseInvite`

### parseMultiServerInvite (string)

return the components of a multiserver invite, same output
as `parseInvite`

### parseInvite(invite)

returns an object of data in the invite, returning `{invite,remote,key,redirect}`.

note, the `invite` in the output is the invite as a multiserver
address.

### parseAddress(string)

takes a multiserver address and returns `{host,port,key}`
if it is a websockets address, `ws:` is included in host,
or `wss:` if it's a secure websocket.

## License

MIT

