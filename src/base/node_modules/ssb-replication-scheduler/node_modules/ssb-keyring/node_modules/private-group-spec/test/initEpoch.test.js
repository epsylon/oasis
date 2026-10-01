// SPDX-FileCopyrightText: 2023 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const test = require('tape')
const isValid = require('../').validator.group.initEpoch
const { MsgId, Secret, GroupId, FeedId } = require('./helpers')

const Mock = (overwrite = {}) => {
  const base = {
    type: 'group/init',
    version: 'v2',
    secret: Secret(),
    tangles: {
      group: {
        root: MsgId(),
        previous: [MsgId(), MsgId()]
      },
      epoch: {
        root: MsgId(),
        previous: [MsgId()]
      },
      members: {
        root: null,
        previous: null
      }
    },
    recps: [GroupId(), FeedId()]
  }
  return Object.assign(base, overwrite)
}
test('is-epoch-init', (t) => {
  t.true(isValid(Mock()), 'fully featured')
  if (isValid.errors) throw isValid.errorsString

  const min = Mock()
  t.true(isValid(min), 'minimal')

  const noTangle = Mock()
  delete noTangle.tangles
  t.false(isValid(noTangle), 'fails if missing tangles')

  const wrongTangle = Mock()
  delete wrongTangle.tangles.group
  wrongTangle.tangles.potato = { root: null, previous: null }
  t.false(isValid(wrongTangle), 'fails if wrong tangle')

  const wrongRoot = Mock()
  wrongRoot.tangles.members.root = '%yap'
  t.false(isValid(wrongRoot), 'fails if wrong members.root')

  const wrongPrev = Mock()
  wrongPrev.tangles.members.previous = ['%yip', '%yap']
  t.false(isValid(wrongPrev), 'fails if wrong members.previous')

  const extrajunk = Mock({ name: 'doop' })
  t.false(isValid(extrajunk), 'fails if anything is added')

  const missingMembers = Mock()
  delete missingMembers.tangles.members
  t.false(isValid(missingMembers), 'fails if members missing')

  const badRecps = Mock()
  badRecps.recps[1] = GroupId()
  t.false(isValid(badRecps), 'fails if encrypted to several groups, not self')

  const badKey = Mock()
  badKey.secret = 'potato'
  t.false(isValid(badKey), 'fails if bad secret')

  const badRoot = Mock()
  badRoot.tangles.group.root = GroupId()
  t.false(
    isValid(badRoot),
    'fails if a tangle root is a groupId and not a msg id'
  )

  t.end()
})
