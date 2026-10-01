# Adding group members

:warning: schema.json is generated so don't modify it directly

This is about adding people to your group, or 



```js
var content = {
  type: "group/add-member",
  version: "v2",
  secret: "3YUat1ylIUVGaCjotAvof09DhyFxE8iGbF6QxLlCWWc=",
  oldSecrets: [
    "apple1ylIUVGaCjotAvof09DhyFxE8iGbF6QxLlCWWc=",
    "potatoylIUVGaCjotAvof09DhyFxE8iGbF6QxLlCWWc="
  ],
  root: "ssb:message/classic/THxjTGPuXvvxnbnAV7xVuVXdhDcmoNtDDN0j3UTxcd8=",
  creator: "ssb:feed/bendybutt-v1/VuVXdhDTHxjTGPuXvvxnbnAV7xcmoNtDDN0j3UTxcd8=",
  text: "welcome keks!", // optional
  recps: [
    "ssb:identity/group/vof09Dhy3YUat1ylIUVGaCjotAFxE8iGbF6QxLlCWWc=", // group_id
    "ssb:feed/bendybutt-v1/YXkE3TikkY4GFMX3lzXUllRkNTbj5E-604AkaO1xbz8=", // feed_id (for new person)
  ],

  tangles: {
    group: {
      root: "ssb:message/classic/THxjTGPuXvvxnbnAV7xVuVXdhDcmoNtDDN0j3UTxcd8=",
      previous: [
        "ssb:message/classic/Sp294oBk7OJxizvPOlm6Sqk3fFJA2EQFiyJ1MS_BZ9E=",
      ],
    },
    members: {
      root: "ssb:message/classic/THxjTGPuXvvxnbnAV7xVuVXdhDcmoNtDDN0j3UTxcd8=",
      previous: [
        "ssb:message/classic/lm6Sqk3fFJA2EQFiyJ1MSASDASDASDASDASDAS_BZ9E=",
        "ssb:message/classic/Sp294oBk7OJxizvPOlm6Sqk3fFJA2EQFiyJ1MS_BZ9E=",
      ],
    },
  },
};
```

Notes:

- `secret` is the symmetric key for this epoch
- `oldSecrets` is an array of all secrets of all predecessor epochs to this epoch, all the way back to the root epoch. Should be undefined or at least empty on re-additions.
- when initially adding someone to a group, there should be one add-member message per tip epoch. this is to make it clear to the people in that epoch what the members of that epoch are. this is also why `oldSecrets` only should contain secrets of predecessor epochs, not of parallel fork epochs
- `root` is the same as `tangles.group.root`
  - the redundancy is here to make it more obvious which root you should be using the compute `group_id`
  - in the future our tangles may be _cloaked_ which means this key would become more important
- `creator` is the root metafeed id of the creator of the group
  - this is needed in case you don't already follow / replicate this person
- `recps` must include the `group_id` and a `feed_id` (one or more)
  - this ensures that everyone has the same info about who's been added
  - if including multiple, keep in mind `max_attempts` of your application
- all messages in the group are part of that groups tangle (see `tangles.group`)
  - this makes it possible to query things based on group (e.g. was this in my europe or pacifica group?)
  - provides partial ordering for all activity in the group
- all `group/add-member` type messages are part of the membership tangle (see `tangles.members`)
  - this makes it easy to build a history of additions to the group
- `tangles.members.root` points at the root message of the current epoch you're in. The "list" of members is essentially reset on each new epoch, which is why the members tangle `root` and `previous` are set to null in all group/epoch init messages.
- all tangles info is "uncloaked" in this version of the spec
  - i.e. sharing this message content leaks info about what other messages/ authors are in the group
