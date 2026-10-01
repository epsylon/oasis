# Adding group members

This is about adding people to your group

```js
var content = {
  type: 'group/add-member',
  version: 'v1',
  groupKey: '3YUat1ylIUVGaCjotAvof09DhyFxE8iGbF6QxLlCWWc=',
  root: '%THxjTGPuXvvxnbnAV7xVuVXdhDcmoNtDDN0j3UTxcd8=.sha256',
  text: 'welcome keks!',                                      // optional
  recps: [
    '%vof09Dhy3YUat1ylIUVGaCjotAFxE8iGbF6QxLlCWWc=.cloaked',  // group_id
    '@YXkE3TikkY4GFMX3lzXUllRkNTbj5E+604AkaO1xbz8=.ed25519'   // feed_id (for new person)
  ],

  tangles: {
    group: {
      root: '%THxjTGPuXvvxnbnAV7xVuVXdhDcmoNtDDN0j3UTxcd8=.sha256',
      previous: [
        '%Sp294oBk7OJxizvPOlm6Sqk3fFJA2EQFiyJ1MS/BZ9E=.sha256'
      ]
    },
    members: {
      root: '%THxjTGPuXvvxnbnAV7xVuVXdhDcmoNtDDN0j3UTxcd8=.sha256',
      previous: [
        '%lm6Sqk3fFJA2EQFiyJ1MSASDASDASDASDASDAS/BZ9E=.sha256',
        '%Sp294oBk7OJxizvPOlm6Sqk3fFJA2EQFiyJ1MS/BZ9E=.sha256'
      ]
    }
  }
}
```

Notes:
- `root` is the same as `tangles.group.root`
  - the redundancy is here to make it more obvious which root you should be using the compute `group_id`
  - in the future our tangles may be _cloaked_ which means this key would become more important
- `recps` must include the `group_id` and a `feed_id` (one or more)
  - this ensures that everyone has the same info about who's been added
  - if including multiple, keep in mind `max_attempts` of your application
- all messages in the group are part of that groups tangle (see `tangles.group`)
  - this makes it possible to query things based on group (e.g. was this in my europe or pacifica group?)
  - provides partial ordering for all activity in the group
- all `entrust` type messages are part of the membership tangle (see `tangles.members`)
  - this makes it easy to build a history of additions to the group
- the `tangles.group.root` and `tangles.members.root` are the same
  - this isn't true of all tangles
  - it's the same because it's a sub-tangle directly related to group initialisation
- all tangles info is "uncloaked" in this version of the spec
  - i.e. sharing this message content leaks info about what other messages/ authors are in the group
