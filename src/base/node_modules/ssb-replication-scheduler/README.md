<!--
SPDX-FileCopyrightText: 2021-2022 Andre 'Staltz' Medeiros

SPDX-License-Identifier: CC0-1.0
-->

# ssb-replication-scheduler

_Triggers replication of feeds identified as friendly in the social graph or in private groups._

Depends on ssb-friends and ssb-tribes2, and calls ssb-ebt APIs.

## Installation

**Prerequisites:**

- Requires **Node.js 12** or higher
- Requires **ssb-db2** (it *may* work with **ssb-db** if you don't use partial replication)
- Requires [**ssb-friends**](https://github.com/ssbc/ssb-friends) version **5.0** or higher
- Requires [**ssb-ebt**](https://github.com/ssbc/ssb-ebt) version **9.0** or higher

```
npm install --save ssb-replication-scheduler
```

Add this secret-stack plugin like this:

```diff
 const SecretStack = require('secret-stack')
 const caps = require('ssb-caps')

 const createSsbServer = SecretStack({ caps })
     .use(require('ssb-master'))
     .use(require('ssb-db2'))
     .use(require('ssb-ebt'))
     .use(require('ssb-friends'))
+    .use(require('ssb-replication-scheduler'))
     .use(require('ssb-conn'))
     // ...
```

## Usage

Typically there is nothing you need to do after installing this plugin. As soon
as the SSB peer is initialized, `ssb-replication-scheduler` will automatically
query the social graph, and either request replication or stop replication,
depending whether the feed is friendly or blocked.

**Opinions embedded in the scheduler:**

- Replication is enabled for:
  - The main feed, `ssb.id`, because this allows you to recover your feed
  - Any friendly feed at a distance of at most `config.friends.hops`
    - Includes your friends (if `config.friends.hops >= 1`)
    - Includes friends of friends (if `config.friends.hops >= 2`)
    - Includes friends of friends of friends (if `config.friends.hops >= 3`)
    - And so forth
- Replication is strictly disabled for:
  - Any feed you explicitly block

There are two APIs available in case you want to have more control over this
module: `start()` and `reconfigure()`. Read more about these at the bottom of
this file.

## Configuration

Some parameters and opinions can be configured by the user or by application
code through the conventional [ssb-config](https://github.com/ssbc/ssb-config)
object. The possible options are listed below:

```js
{
  replicationScheduler: {
    /**
     * Whether the replication scheduler should start automatically as soon as
     * the SSB app is initialized. When `false`, you have to call
     * `ssb.replicationScheduler.start()` manually. Default is `true`.
     */
    autostart: true,

    /**
     * If `partialReplication` is an object, it tells the replication scheduler
     * to perform partial replication, whenever remote feeds support it. If
     * `partialReplication` is `null` (which it is, by default), then all
     * friendly feeds will be requested in full.
     *
     * Read below more about this configuration.
     */
    partialReplication: null,
  }
}
```

### Configuring partial replication

The `config.replicationScheduler.partialReplication` object describes the tree
of meta feeds that we are interested in replicating, for each hops level. For
each hops level we have a certain _template_ to describe how replication should
work at that level. Notice that this configuration cannot specify **who** we
replicate (that's the job of ssb-friends and your chosen `hops`, see the _Usage_
section above), this configuration just specifies **how** should we replicate a
friendly peer, in other words, the level of granularity for those peers.

#### Template per hops

The high-level overview of the `partialReplication` configuration is:

```js
replicationScheduler: {
  partialReplication: {
    0: TEMPLATE_FOR_HOPS_0,
    1: TEMPLATE_FOR_HOPS_1,
    2: TEMPLATE_FOR_HOPS_2_AND_ABOVE,
    group: TEMPLATE_FOR_GROUP_MEMBERS,
  }
}
```

Soon we'll show how those `TEMPLATE_FOR_HOPS` work, but for now notice that the
highest number will handle all the hops beyond that number, e.g. notice how `2`
is the highest number and it means that `TEMPLATE_FOR_HOPS_2_AND_ABOVE`
configures how to replicate peers at hops 2 or 3 or 4 or higher. There's nothing
special about the number 2, it could also have been this:

```js
replicationScheduler: {
  partialReplication: {
    0: TEMPLATE_FOR_HOPS_0,
    1: TEMPLATE_FOR_HOPS_1_AND_ABOVE,
  }
}
```

Or even this (which means we use the same template for all peers, regardless of
their hops distance):

```js
replicationScheduler: {
  partialReplication: {
    0: TEMPLATE_FOR_HOPS_0_AND_ABOVE,
  }
}
```

Or even fractional numbers:

```js
replicationScheduler: {
  partialReplication: {
    0: TEMPLATE_FOR_HOPS_0,
    0.5: TEMPLATE_FOR_HOPS_HALF,
    1: TEMPLATE_FOR_HOPS_1_AND_ABOVE,
  }
}
```

#### Template structure

A **Template** is JSON which describes how should we do partial replication. If
the template is `null` or a falsy value, then it means that for that hops level
we don't do partial replication and we **will** do **full** replication (which
means pre-2022 SSB replication of the peer's `main` feed).

When the template is a JSON array, it means we want to replicate only some leaf
feeds in the "metafeed tree", where the root of the tree is always the
_root meta feed_. The structure of the tree is assumed to follow the
["tree structure v1"](https://github.com/ssbc/ssb-meta-feeds-spec#v1), which
means we're only concerned about the leaf feeds.

Each item in the template should be an object describing which **keys** in a
leaf feed must match exactly the **values** given for that leaf to be
replicated. So that if we write `{purpose: 'git-ssb'}`, it means we are
interested in matching the leaf feed that has the field `purpose` exactly
matching the value "git-ssb". All *specified* fields must match, but *omitted*
fields are allowed to be any value. If you omit all the fields, i.e. if you pass
the empty object `{}`, then this means "replicate **ALL** leaf feeds".

#### Special variables

Some values are special, in the sense that they are not taken literally, but are
going to be substituted by other context-relative values. These special
variables are always prefixed with **`$`**.

- Special values
  - `$main`
  - `$root`
  - `$groupSecret` (only in `purpose` field)

If the value of a field, e.g. in ssb-ql-0 queries, are the special strings
`"$main"` or `"$root"`, then they respectively refer to the IDs of the _main
feed_ and of the _root meta feed_. The shape `{purpose: '$groupSecret'}`
corresponds to any leaf feed where the `purpose` matches one of the group
secrets known by the local peer.

#### Example

In the example below, we set up partial replication with the meaning:

- For hops 0 (that is, "yourself"), replicate some app feeds and all index feeds
- For hops 1 (direct friends), replicate only 5 specific index feeds
- For hops 2 and beyond, replicate only 2 specific index feeds

```js
partialReplication: {
  0: [
    { purpose: 'main' },
    { purpose: 'coolgame' },
    { purpose: 'git-ssb' },
    { purpose: 'index' }
  ],

  1: [
    {
      purpose: 'index',
      metadata: {
        querylang: 'ssb-ql-0',
        query: { author: '$main', type: null, private: true },
      },
    },
    {
      purpose: 'index',
      metadata: {
        querylang: 'ssb-ql-0',
        query: { author: '$main', type: 'post', private: false },
      },
    },
    {
      purpose: 'index',
      metadata: {
        querylang: 'ssb-ql-0',
        query: { author: '$main', type: 'vote', private: false },
      },
    },
    {
      purpose: 'index',
      metadata: {
        querylang: 'ssb-ql-0',
        query: { author: '$main', type: 'about', private: false },
      },
    },
    {
      purpose: 'index',
      metadata: {
        querylang: 'ssb-ql-0',
        query: { author: '$main', type: 'contact', private: false },
      },
    },
  ],

  2: [
    {
      purpose: 'index',
      metadata: {
        querylang: 'ssb-ql-0',
        query: { author: '$main', type: 'about', private: false },
      },
    },
    {
      purpose: 'index',
      metadata: {
        querylang: 'ssb-ql-0',
        query: { author: '$main', type: 'contact', private: false },
      },
    },
  ],

  3: [
    {
      purpose: 'index',
      metadata: {
        querylang: 'ssb-ql-0',
        query: { author: '$main', type: 'about', private: false },
      },
    },
  ],
}
```

## APIs

### `ssb.replicationScheduler.start() => void` (sync)


### `ssb.replicationScheduler.reconfigure(config) => void` (sync)

At any point during the execution of your program, you can reconfigure the
replication rules using this API. The configuration object passed to this API
has the same shape as `config.replicationScheduler` (see above) has.

## Security considerations

The exclusion spec [says that](https://github.com/ssbc/ssb-group-exclusion-spec/blob/118f7fb2afa677b354dc327d318e7be295432e7a/README.md?plain=1#L385) we should stop replicating new messages from an excluded member. That is not implemented so far (see also relevant [proposed updates](https://github.com/ssbc/ssb-group-exclusion-spec/pull/15) to the spec) because of a lack of time. So an excluded member could in theory keep posting to the group, even if they wouldn't be able to see things remaining members posted.

## License

LGPL-3.0
