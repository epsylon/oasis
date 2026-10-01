// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const test = require('tape')
const isValid = require('../').validator.group.addMember
const { Secret, GroupId, FeedId, MsgId } = require('./helpers')

const Mock = (overwrite = {}) => {
  const groupRoot = MsgId()

  const base = {
    type: 'group/add-member',
    version: 'v2',
    secret: Secret(),
    oldSecrets: [Secret(), Secret()],
    root: groupRoot,
    creator: FeedId(),
    text: 'welcome keks!', // optional
    recps: [
      GroupId()
      // add 15 feedId
    ],

    tangles: {
      group: {
        root: groupRoot,
        previous: [MsgId()]
      },
      members: {
        root: groupRoot,
        previous: [MsgId(), MsgId()]
      }
    }
  }
  times(15, () => base.recps.push(FeedId()))

  return Object.assign(base, overwrite)
}

function times(n, fn) {
  for (let i = 0; i < n; i++) {
    fn(i)
  }
}

test('is-group-add-member', (t) => {
  const full = Mock()
  t.true(isValid(full), 'fully featured')
  if (isValid.errors) throw isValid.errorsString

  const min = Mock()
  delete min.text
  t.true(isValid(min), 'minimal')
  if (isValid.errors) throw isValid.errorsString

  /* recps */
  const dms = Mock({ recps: [FeedId(), FeedId()] })
  t.false(isValid(dms), 'must have a group')

  const junkRecps = Mock({ recps: [GroupId(), 'cat'] })
  t.false(isValid(junkRecps), 'fails invalid recps')

  const tooManyGroups = Mock({ recps: [GroupId(), GroupId(), FeedId()] })
  t.false(isValid(tooManyGroups), 'fails if more than one group')

  const groupInWrongSlot = Mock({ recps: [FeedId(), GroupId()] })
  t.false(isValid(groupInWrongSlot), 'fails if group not in first slot')

  const noAdditions = Mock({ recps: [GroupId()] })
  t.false(isValid(noAdditions), 'fails if no recps other than group')

  const recps = [GroupId()]
  times(16, () => recps.push(FeedId()))
  const tooManyRecps = Mock({ recps })
  t.false(isValid(tooManyRecps), 'fails if > 16 recps')

  const gId = GroupId()
  const badGroupId = gId.substring(0, 25) + '\\' + gId.substring(26)
  const backslashRecps = Mock({ recps: [badGroupId, FeedId()] })
  t.false(
    isValid(backslashRecps),
    "doesn't accept a groupId with a backslash in it"
  )

  // TODO // test more edge cases

  /* not sure how to code this in v4 draft compatible JSON schema */
  const noGroupRecps = Mock({
    recps: [FeedId(), FeedId()]
  })
  t.false(isValid(noGroupRecps), 'fails if there is no group recp')

  const sigilLink = Mock()
  sigilLink.tangles.group.root =
    '%shGMltJNglMNLpxdnDGz/Y+j6HukBelnCS84D+GR2DM=.sha256'
  t.false(isValid(sigilLink), 'fails if a link is a sigil link and not a uri')

  const noOld = Mock()
  noOld.oldSecrets = undefined
  t.true(isValid(noOld), 'can have missing oldSecrets (e.g. on re-additions)')

  const emptyOld = Mock()
  emptyOld.oldSecrets = []
  t.true(isValid(emptyOld), 'allows empty oldSecrets')

  t.end()
})
