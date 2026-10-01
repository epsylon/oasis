# Creating a new epoch

This is a spec for how to initialise a new epoch (after the first initial "zero" epoch a.k.a. initRoot).

:warning: schema.json is generated so don't modify it directly

## Epoch init example

```js
const groupRoot = 'ssb:message/classic/Zz-Inkte70Qz1UVKUHIhOgo16Oj_n37PfgmIzLDBgZw=.sha256'
const groupId = 'ssb:identity/group/g_JTmMEjG4JP2aQAO0LM8tIoRtNkTq07Se6h1qwnQKb='

var plainText = {
  type: 'group/init'
  version: 'v2',
  secret: group_secret.toString('base64'),
  tangles: {
    group: {
      root: groupRoot,
      previous: [lastMessageOnPreviousEpoch]
    },
    epoch: {
      root: groupRoot,
      previous: [lastGroupInitOnPreviousEpoch]
    }
    members: {
      root: null,
      previous: null
    }
  },
  recps: [groupId, myRootFeedId]
}
```

Note the differences between the root init msg (the "zero epoch") and epoch init messages:
* The group tangle is not null and like normal, points at the group root and the latest messages.
* The epoch tangle is not null and points at the root msg as well as the init for the last epoch.
* The members tangle is always null in "group/init" messages, since that tangle is reset there.
* Recps is defined, and includes the group id as well as your own root feed id.