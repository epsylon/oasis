A module for [scuttlebot](https://github.com/ssbc/scuttlebot) that
interprets pub owner announcements and presents a list of pubs run by
your friends or within a certain number of hops.

One way to run this, is to install it on your machine and set
`friendPub.hops` to 1. Meaning only replicate with pubs run by me or
my friends. Then install it on your pub and set the same config
to 2. This way your pub will replicate to the same pubs that you
replicate, and won't start replicating to random pubs.

Please note that this does *not* guarantee that your messages will not
be gossipped outside your friends, as any node not running this module
will connect to random pubs they have encountered. But it does give
you some level of control and also this will prioritise messages to
your friends assuming they connect to their pubs more often that other
pubs.

Can be installed as a plugin and enabled in config using:

```
  "plugins": {
    "ssb-friend-pub": "friendPub"
  }
```

This will make `ssb-friend-pub` prioritise pubs run by your friend. In
order to only connect to these pubs, ssb-server 13.5 is needed. You
need to disable global gossipping and enable friends as follows:

```
  "gossip": {
   "friends": true,
   "autoPopulate": false,
   "global": false,
   "local": false,
   "seed": false
  },
```


Message types for owner of pub:
 - `{ type: 'pub-owner-announce', pub: '@id' }`
 - `{ type: 'pub-owner-retract', announcement: '%id' }`

Message types for pub:
 - `{ type: 'pub-owner-confirm', announcement: '%id', address: "xyz.onion" }`
 - `{ type: 'pub-owner-reject', announcement: '%id' } // to reject a confirm later on`

If an address has been posted using
[ssb-device-adress](https://github.com/ssbc/ssb-device-address) then
this will be used and the address in `confirm` message can be skipped.

Example:

```
ssb-server publish --type pub-owner-announce --pub @lbocEWqF2Fg6WMYLgmfYvqJlMfL7hiqVAV6ANjHWNw8=.ed25519

=>

{
  "key": "%ZSsBgNjZcM+DSwIgvL965Ci71huNJGH5YwonUKGFb2M=.sha256",
  "value": {
    "previous": "%JQHAq5bbWlNFK7qsWjzPnIyuTfZuasyC51/jpoyylYY=.sha256",
    "sequence": 5429,
    "author": "@6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0=.ed25519",
    "timestamp": 1545478575777,
    "hash": "sha256",
    "content": {
      "type": "pub-owner-announce",
      "pub": "@lbocEWqF2Fg6WMYLgmfYvqJlMfL7hiqVAV6ANjHWNw8=.ed25519"
    },
    "signature": "K/RGckneV7G8WdO2gGxqSZ+Y9cptytLrNoFEyN3B6w2qUvycup0WxHKtWSylL+zy4Jbquu3Tv3pD0/fG2otVCw==.sig.ed25519"
  },
  "timestamp": 1545478575785
}
```

On the pub use key:

```
ssb-server publish --type pub-owner-confirm \
  --announcement %ZSsBgNjZcM+DSwIgvL965Ci71huNJGH5YwonUKGFb2M=.sha256
```

This can be combined with the
[ssb-incoming-guard](https://github.com/ssbc/ssb-incoming-guard)
module.
