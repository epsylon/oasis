<!--
SPDX-FileCopyrightText: 2021 Anders Rune Jensen

SPDX-License-Identifier: CC0-1.0
-->

# ssb-meta-feeds

An implementation of the [ssb metafeed spec] in JS as a secret stack plugin.
The core idea is being able to split out content you publish into _subfeeds_.
This allows for quicker replication by peers, such that you only get the
subfeeds, thus content types, you are interested in.

Metafeeds are special types of feeds which own or "contain" other feeds (called
"subfeeds"), by publishing messages which describe the creation of the subfeeds.

```mermaid
graph TB

main

classDef default fill:#3f506c,stroke:#3f506c,color:#fff;
```
_How "classic" scuttlebutt worked - each device has one `main` feed with all messages_

```mermaid
graph TB

root:::root

root-->aboutMe
root-->contacts
root-->posts
root-->main:::legacy

classDef root fill:#8338ec,stroke:#8338ec,color:#fff;
classDef default fill:#3a86ff,stroke:#3a86ff,color:#fff;
classDef legacy fill:#3f506c,stroke:#3f506c,color:#fff;
```
_How scuttlebutt works with metafeeds - each device now has a `root` metafeed,
whose sole responsibility is to announce (point to) subfeeds that you publish
content to. A subfeed can also be a metafeed, which then allows the existence of
"sub-subfeeds"._

This means that when you first meet a peer you can replicate their `root`
metafeed and, having discovered their subfeeds, replicate just their `aboutMe`
and `contacts` feeds to get enough info to place them socially. Once you decide
you want to follow them you may replicate their other subfeeds.

_NOTE: The ideal state is that all content is split out into subfeeds.  To add
backwards compatability for devices that have already posted a lot of posts to
their classic `main` feed, this library will auto-link that main feed in as a
"subfeed" of our root._

## Installation

**Prerequisites:**

- Requires **Node.js 10** or higher
- Requires `ssb-db2` version 5.0 or higher
- Requires `ssb-bendy-butt` version 1.0 or higher

```
npm install --save ssb-meta-feeds
```

Add this plugin like this:

```diff
 const sbot = SecretStack({ appKey: caps.shs })
     .use(require('ssb-db2'))
+    .use(require('ssb-bendy-butt'))
+    .use(require('ssb-meta-feeds'))
     // ...
```

## Example usage

We create a subfeed for `about` messages under our `root` feed using
`findOrCreate`. This will only create the subfeed if there is no existing
subfeed that matches the criteria.

```js
const details = { purpose: 'aboutMe' }
sbot.metafeeds.findOrCreate(details, (err, aboutMeFeed) => {
  console.log(aboutMeFeed)

  //
})
```

The `details` argument is an object used to find (or create) a subfeed under
your "root feed". (It actually nests it under a couple of subfeeds, to handle
versioning, and sparse replication, but you generally don't need to know the
details).

Once you have a *FeedDetails* object, like `aboutMeFeed`, you can publish on
the new subfeed:

```js
const details = { purpose: 'aboutMe' }
sbot.metafeeds.findOrCreate(details, (err, aboutMeFeed) => {
  console.log(aboutMeFeed)

  const content = {
    type: 'about',
    name: 'baba yaga'
    description: 'lives in a hutt in the forest, swing by sometime!'
  }
  sbot.db.create({ keys: aboutMeFeed.keys, content }, (err, msg) => {
    console.log(msg)
  })
})
```

## API

### `sbot.metafeeds.findOrCreate(details, cb)`

Looks for the first subfeed of `metafeed` that matches `details`, or creates
one which matches these. This creates feeds following the
[v1 tree structure](https://github.com/ssbc/ssb-meta-feeds-spec#v1).

Arguments:
- `details` *Object* where
    - `details.purpose` *String* any string to characterize the purpose of this new subfeed
    - `details.feedFormat` *String* (optional)
        - either `'classic'` or `'bendybutt-v1'`
        - default: `'classic'`
    - `details.recps` *Array* (optional)
       - A collection of "recipients" (GroupId, FeedId, ...) to encrypt the announcement messages to
    - `details.encryptionFormat` *String* (optional)
       - specifies which encryption format to use (you will need an encryption plugin installed e.g. `ssb-box2` installed)
       - default: `'box2'`
    - `details.metadata` *Object* (optional) - for containing other data

- `cb` *function* delivers the response, has signature `(err, FeedDetails)`, where FeedDetails is
    ```js
    {
      id: '@I5TBH6BuCvMkSAWJXKwa2FEd8y/fUafkQ1z19PyXzbE=.ed25519',
      parent: 'ssb:feed/bendybutt-v1/sxK3OnHxdo7yGZ-28HrgpVq8nRBFaOCEGjRE4nB7CO8=',
      purpose: 'chess',
      feedFormat: 'classic',
      seed: <Buffer 13 10 25 ab e3 37 20 57 19 0a 1d e4 64 13 e7 38 d2 23 11 48 7d 13 e6 3b 8f ef 72 92 7f db 96 64>
      keys: {
        curve: 'ed25519',
        public: 'I5TBH6BuCvMkSAWJXKwa2FEd8y/fUafkQ1z19PyXzbE=.ed25519',
        private: 'Mxa+LL16ws7HZhetR9FbsIOsAeud+ii+9KDUisXkq08jlMEfoG4K8yRIBYlcrBrYUR3zL99Rp+RDXPX0/JfNsQ==.ed25519',
        id: '@I5TBH6BuCvMkSAWJXKwa2FEd8y/fUafkQ1z19PyXzbE=.ed25519'
      },
      recps: ['%I5TBH6BuCvMkSAWJXKwa2FEd8y/fUafkQ1z19PyXzbE=.cloaked'], // a GroupId
      metadata: {
        notes: 'private testing of chess dev',
      },
    }
    ```

Meaning:
- `keys` - cryptographic keys used for signing messages published by this feed (see [ssb-keys])
- `id` - the id of this feed, same as `keys.id`
- `parent` - the id of the parent metafeed under which this feed was announced
- `purpose` - a human readable ideally unique handle for this feed
- `feedFormat` - the feed format ("classic", "bendybutt-v1", "indexed-v1", etc)
- `seed` - the data from which is use to derive the `keys` and `id` of this feed.
- `recps` - an Array of recipients who the metafeed announcement was encrypted to
- `metadata` - object containing additional data

NOTES:
- if you have a legacy `main` feed, this will also set that up as a subfeed of your `root` feed.


### `sbot.metafeeds.findOrCreate(cb)`

Fetches the **root metafeed** details of your own meta feed tree. There can only be one _root_ metafeed in a tree,
so even if you call `findOrCreate(cb)` many times, it will not create duplicates,
it will just load the root metafeed.

Callsback with your `root` FeedDetails object (see `findOrCreate(details, cb)`)

NOTES:
- `metafeed = null` - the root metafeed is the topmost metafeed

### `sbot.metafeeds.findRootFeedId(subFeedId, cb)`

Finds the id of the root feed in a meta feed tree, given an id of any feed in that tree, including the root feed id itself.

### `sbot.metafeeds.branchStream(opts)`

Returns a **[pull-stream] source** of all "branches" in the meta feed trees.

A "branch" is an array where the first item is the root meta feed and the
subsequent items are the children and grandchildren (and etc) of the root. A
branch looks like this:

```js
[
  rootDetails,
  childDetails,
  grandchildDetails,
]
```

Or in general, an `Array<Details>`. The *Details* object has
the shape `{ id, purpose, feedFormat, keys, parent, metadata }` like what
`findOrCreate` returns. If the details is for a feed that doesn't belong to you,
the `keys` field will not be present.

`branchStream` will emit all possible branches, which means sub-branches are
included. For instance, in the example above, `branchStream` would emit:

```js
[ rootDetails ]
```

and

```js
[ rootDetails, childDetails ]
```

and

```js
[
  rootDetails, childDetails, grandchildDetails,
]
```

The `opts` argument can have the following properties:

- `opts.root` _String_ - a feed ID for a meta feed, only branches that are
  descendants of this feed ID would appear in the pull-stream source, otherwise
  all branches from all possible root meta feeds will be included. (Default:
  `null`)
- `opts.old` _Boolean_ - whether or not to include currently loaded (by
  `loadState`) trees. (Default: `false`)
- `opts.live` _Boolean_ - whether or not to include subsequent meta feed trees
  during the execution of your program. (Default: `true`)
- `opts.tombstoned` _Boolean_ - if `false`, no tombstoned branches are included
  in the results; if `true`, only tombstoned branches are included; if `null`,
  all branches are included regardless of tombstoning. (Default: `null`)

### `sbot.metafeeds.findAndTombstone(details, reason, cb)`

Looks for the first subfeed that matches `details` and, if found,
tombstones it with the string `reason`.

This is strictly concerned with metafeeds and sub feeds that **you own**, not
with those that belong to other peers.

Arguments:
- `details` *Object* - see `#findOrCreate`
- `reason` *String* - describes why the found feed is being tombstoned.

The callback is called with `true` on the 2nd argument if tombstoning suceeded,
or called with an error object on the 1st argument if it failed.

### `sbot.metafeeds.getTree(root, cb)`

Get an object that represents the full metafeed tree under a given root
metafeed.

Arguments:
- `root` *String* - feed ID for the root metafeed

The tree object has the shape

```js
{
  id,
  purpose,
  feedFormat,
  metadata,
  children: [
    {
      id,
      purpose,
      feedFormat,
      metadata,
      children
    },
  ]
}
```

The callback is called with the tree object on the 2nd argument if suceeded,
or called with an error object on the 1st argument if it failed.

### `sbot.metafeeds.printTree(root, opts, cb)`

Prints (directly to console!) a diagram representation in ASCII for the full
metafeed tree under a given root metafeed. Example:

```
root
└─┬ v1
  ├─┬ 2
  │ └── main
  └─┬ f
    └── chess
```

Arguments:
- `root` *String* - feed ID for the root metafeed
- `opts` *Object* - object with additional customizations, such as `{id: false}`
 or `{id: true}`, where `id: true` will print the feed ID for each feed. Default
 is `id: false`

The callback is called with `undefined` on the 1st argument if printing
suceeded, or called with an error object if it failed. There is no 2nd argument.

### Advanced API

For lower level API docs, [see here](./README_ADVANCED.md).

## License

LGPL-3.0

[ssb-keys]: https://github.com/ssb-js/ssb-keys
[ssb metafeed spec]: https://github.com/ssb-ngi-pointer/ssb-meta-feed-spec
[pull-stream]: https://github.com/pull-stream/pull-stream/
