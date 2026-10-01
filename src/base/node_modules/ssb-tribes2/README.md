<!--
SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros <contact@staltz.com>

SPDX-License-Identifier: CC0-1.0
-->

# ssb-tribes2

A [secret-stack] plugin that makes it easy to create, manage, and publish
messages in SSB "Private Groups", following
[this spec](https://github.com/ssbc/ssb-meta-feeds-group-spec). This module is
made to work with [ssb-db2] as the database and with [metafeeds], where your
content in the group is placed on a dedicated feed in your metafeed tree.
Replication of those group-specific feeds at scale is handled by [ssb-replication-scheduler].

Successor of [ssb-tribes].

## Installation

```bash
npm install ssb-tribes2
```

## Usage in ssb-db2

- Requires **Node.js 12** or higher
- Requires `secret-stack>=6.2.0`
- Requires `ssb-db2>=6.2.2`
- Requires `ssb-box2>=4.0.0`
- Requires `ssb-meta-feeds>=0.38.0`
- Requires `ssb-bendy-butt>=1.0.0`

```diff
 const ssb = SecretStack({ caps: require('ssb-caps') })
   .use(require('ssb-master'))
+  .use(require('ssb-db2'))
   .use(require('ssb-conn'))
+  .use(require('ssb-bendy-butt'))
+  .use(require('ssb-meta-feeds'))
+  .use(require('ssb-tribes2'))
   .use(require('ssb-blobs'))
   .call(null, config)
```

Then **to create a group** and **publish to it**,

```js
// This is needed to automatically create an additions feed, needed to be able to send and receive invites
ssb.tribes2.start()

// Create a new group, no further details required, thus the empty object
ssb.tribes2.create({}, (err, group) => {
  // Publish a new message to the group, notice the recps
  ssb.tribes2.publish(
    {
      type: 'post',
      text: 'welcome to the group',
      recps: [group.id],
    },
    cb
  )
})
```

If you want to **add more members** to the group:

```js
// You need to know your friends' (bob and carol) *root* metafeed IDs
ssb.tribes2.addMembers(group.id, [bobRootId, carolRootId], {}, (err, msg) => {
  // msg is the message that was published on your invitations feed
})
```

Then you **list the current members** of the group:

```js
pull(
  ssb.tribes2.listMembers(group.id),
  pull.collect((err, members) => {
    // `members` is an Array of root metafeed IDs
  })
)
```

Finally, you can **list all the groups you are a member of**:

```js
pull(
  ssb.tribes2.list(),
  pull.collect((err, groups) => {
    // `groups` is an Array of group objects like { id, secret }
  })
)
```

## API

All methods with callbacks return a promise instead if a callback isn't provided.

### `ssb.tribes2.create(opts, cb)`

Creates a new private group.
This creates an encryption key, sets up a sub-feed for the group, and initializes the
group with a `group/init` message, and `group/add-member` to signal you were added.
Calls back with important info about the group.
NOTE: If `create` finds an empty (i.e. seemingly unused) group feed, it will start using that feed instead of creating a new one.

- `opts` _Object_ - currently empty, but will be used in the future to specify details like whether the group has an admin subgroup, etc.
- `cb` _Function_ - callback function of signature `(err, group)` where `group` is an object containing:

  - `id` _GroupUri_ - an SSB URI that's safe to use publicly to name the group, and is used in `recps` to trigger encrypting messages to that group
  - `subfeed` _Keys_ - the keys of the subfeed you should publish group data to
  - `writeKey` _GroupSecret_ - the current key used for publishing new messages to the group. It is one of the `readKeys`.
  - `readKeys` _[GroupSecret]_ - an array of all keys used to read messages for this group.
  - `root` _MessagedId_ - the MessageId of the `group/init` message of the group, encoded as an ssb-uri.

  where _GroupSecret_ is an object of the format

  - `key` _Buffer_ - the symmetric key used by the group for encryption
  - `scheme` _String_ - the scheme for this key

### `ssb.tribes2.get(groupId, cb)`

Gets information about a specific group.

- `groupId` _GroupUri_ - the public-safe SSB URI which identifies the group
- `cb` _Function_ - callback function of signature `(err, group)` where `group` is an object on the same format as the `group` object returned by #create

### `ssb.tribes2.list({ live, excluded }) => source`

Creates a pull-stream source which emits `group` data of each private group you're a part of. If `live` is true then it also outputs all new groups you join. If `excluded` is true then it only outputs groups that you've been excluded from, instead of just ones you haven't.
(Same format as `group` object returned by #create)

### `ssb.tribes2.addMembers(groupId, feedIds, opts, cb)`

Publish `group/add-member` messages to a group of peers, which gives them all the details they need to join the group. Newly added members will need to accept the invite using `acceptInvite()` before they start replicating the group.

- `groupId` _GroupUri_ - the public-safe SSB URI which identifies the group (same as in #create)
- `feedIds` _[FeedId]_ - an Array of 1-15 different ids for peers (accepts ssb-uri or sigil feed ids)
- `opts` _Object_ - with the options:
  - `text` _String_ - A piece of text attached to the addition. Visible to the whole group and the newly added people.
- `cb` _Function_ - a callback of signature `(err, Array<msg>)`

### `ssb.tribes2.excludeMembers(groupId, feedIds, opts, cb)

Excludes some current members of the group, by creating a new key and group feed and reinviting everyone to that key except for the excluded members.

- `groupId` _GroupUri_ - the public-safe SSB URI which identifies the group (same as in #create)
- `feedIds` _[FeedId]_ - an Array of 1-15 different ids for peers (accepts ssb-uri or sigil feed ids)
- `opts` _Object_ - placeholder for future options.
- `cb` _Function_ - a callback of signature `(err)`

### `ssb.tribes2.publish(content, opts, cb)`

Publishes any kind of message encrypted to the group. The function wraps `ssb.db.create()` but handles adding tangles and using the correct encryption for the `content.recps` that you've provided. Mutates `content`.

- `opts` _Object_ - with the options:
  - `isValid` _Function_ - a validator (typically `is-my-ssb-valid`/`is-my-json-valid`-based) that you want to check this message against before publishing. Have the function return false if the message is invalid and the message won't be published. By default uses the `content` validator from `private-group-spec`.
  - `tangles` _[String]_ - by default `publish` always adds the `group` tangle to messages, but using this option you can ask it to add additional tangles. Currently only supports a few tangles that are core to groups.
  - `feedKeys` _Keys_ - By default the message is published to the currently used group feed (current epoch) but using this option you can provide keys for another feed to publish on. Note that this doesn't affect the encryption used.
- `cb` _Function_ - a callback of signature `(err, msg)`

### `ssb.tribes2.listMembers(groupId, { live, allAdded }) => source`

Returns a pull stream source listing the root feed id of every member of the
group with id `groupId`. Note: lists members whether or not they've accepted the
invite.

If `live` is true, then it keeps the stream open and also outputs updates to
membership as new members are added / excluded.

If `allAdded` is true then excludes are ignored and any peer that has ever been a member of the group is listed.

Each update emitted from the source is the updated complete state of the group in the format:

```js
{
  added: [feedId, feedId, ...],
  toExclude: [feedId, ...]
}
```

### `ssb.tribes2.listInvites() => source`

Returns a pull stream source listing invites (another user sent you one with `addMembers`) that you haven't accepted yet. The invites are on the same format as that of #create.

### `ssb.tribes2.acceptInvite(groupId, cb)`

Accepts an invite (addition) for a group, if you've received one, and starts to replicate and decrypt it. Does not publish any message.

### `ssb.tribes2.start(cb)`

Makes sure that you're set up to send and receive group invites, by creating an additions feed for you.

- `cb` _Function_ - a callback of signature `(err)`

## Config

You can set the secret stack config `config.tribes2.timeoutLow` and `config.tribes2.timeoutHigh` to control how slowly the client should try to fix a conflicting state, where other clients might be trying to fix the same conflict at the same time. The defaults are `5` and `30` respectively, which gives a random timeout between 5s-30s. A higher value reduces the risk of creating new conflicts since other clients don't do the same conflict resolution at the same time, but increase the time that the group is in an unstable state. A lower number corrects things faster but increases the risk of ending up in new conflicts. Should not be `0` or close to it.

You need to set `config.tribes2.recoverExclude` to true (default false) for the above mentioned conflict recovery to happen at all. The recovery is a bit unreliable but might sometimes be needed to repair broken state.

## Security considerations

While we have tried our best to create a secure end-to-end encrypted communication protocol, this module is not fit for use in safety critical situations. Neither the code nor the specification has been vetted by an independent party. Even assuming a solid implementation, and a bug-free spec, we have intentionally left out several security features that are considered state of the art in other apps such as Signal, such as "forward secrecy".

Because of this, we advise that anyone that uses this module in an app, includes prominent UI that warns the user about possible risks.

## Links

- [ssb-tribes2-demo](https://github.com/ssbc/ssb-tribes2-demo) - A demo electron app that shows off the features of `ssb-tribes2`
- [private-group-spec](https://github.com/ssbc/private-group-spec) - The spec that `ssb-tribes2` is based on
- [ssb-group-exclusion-spec](https://github.com/ssbc/ssb-group-exclusion-spec) - The spec that defines exclusion from a private group

## License

LGPL-3.0-only

[secret-stack]: https://github.com/ssbc/secret-stack
[ssb-db2]: https://github.com/ssbc/ssb-db2
[ssb-tribes]: https://github.com/ssbc/ssb-tribes
[metafeeds]: https://github.com/ssbc/ssb-meta-feeds
[ssb-replication-scheduler]: https://github.com/ssbc/ssb-replication-scheduler
