# SSB partial replication

A collection of functions useful for replicating a part of the log
instead of everything. This is superseeded by [SSB secure partial replication](https://github.com/arj03/ssb-secure-partial-replication).

## api

### getFeed({id: feedId, seq: int?, live: bool?, limit: int?, keys: bool?, values: bool?}) -> PullSource

The method has exactly the same interface as `createHistoryStream`
because it just wraps the function. It is much faster though. See
appendix for more information.

### getFeedReverse({id: feedId, seq: int?, live: bool?, limit: int?, keys: bool?, values: bool?}) -> PullSource

This function does the same as `getFeed` except if one does
not specify `seq` the latest sequence for the feed with be fetched and
used. This allows one to get the latest X messages from a feed using
the `limit` option without knowing how many messages the feed
currently has.

### getTangle(msgId, cb)

Get all the messages of a [tangle](https://github.com/ssbc/ssb-tangle)
given a root message id. This can be used to fetch threads or similar
tangles. This is similar in spirit to
[ssb-ooo](https://github.com/ssbc/ssb-ooo) except there is no protocol
involved to fetch messages from other nodes.

### getMessagesOfType({id: feedId, type: string, seq: int?, limit: int?}) -> PullSource

Get messages of a particular type for a feed. This can be used to
fetch say all contact messages for a particular feed to construct the
social graph without having to download all the messages of the feed.

## Appendix

There is something wrong with createHistoryStream over a network
connection. Locally it takes around 600ms, using net protocol the same
call takes 6.500ms and using ws the exact same call takes 20.000ms?

```javascript
var pull = require('pull-stream')

var remote = 'ws:between-two-worlds.dk:8989~shs:lbocEWqF2Fg6WMYLgmfYvqJlMfL7hiqVAV6ANjHWNw8=.ed25519'
//remote = 'net:between-two-worlds.dk:8008~shs:lbocEWqF2Fg6WMYLgmfYvqJlMfL7hiqVAV6ANjHWNw8=.ed25519'

require('ssb-client')({ remote }, (err, sbot) => {
  if (err) throw err
  console.time("downloading messages")
  pull(
    sbot.createHistoryStream({id: '@ye+QM09iPcDJD6YvQYjoQc7sLF/IFhmNbEqgdzQo3lQ=.ed25519', seq: 27000, keys: false}),
    pull.drain((msg) => {
      console.log(msg)
    }, (err) => {
      if (err) throw err

      console.timeEnd("downloading messages")
      sbot.close()
    })
  )
})
```

The problem seems to be buried in the
[legacy](https://github.com/ssbc/ssb-replicate/blob/master/legacy.js)
protocol for ssb-replication somewhere.

This module simply exposes
[`createHistoryStream`](https://ssbc.github.io/scuttlebutt-protocol-guide/#createHistoryStream)
as `partialReplication` without any of the legacy overhead and we are
back to 600ms again.
