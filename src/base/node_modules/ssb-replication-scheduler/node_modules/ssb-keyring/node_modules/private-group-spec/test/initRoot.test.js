// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const test = require('tape')
const isValid = require('../').validator.group.initRoot
const { Secret, MsgId, GroupId } = require('./helpers')

const Mock = (overwrite = {}) => {
  const base = {
    type: 'group/init',
    version: 'v2',
    secret: Secret(),
    tangles: {
      group: {
        root: null,
        previous: null
      },
      epoch: {
        root: null,
        previous: null
      },
      members: {
        root: null,
        previous: null
      }
    }
  }
  return Object.assign(base, overwrite)
}
test('is-group-init', (t) => {
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
  wrongRoot.tangles.members.root = MsgId()
  t.false(isValid(wrongRoot), 'fails if wrong members.root')

  const wrongPrev = Mock()
  wrongPrev.tangles.members.previous = [MsgId(), MsgId()]
  t.false(isValid(wrongPrev), 'fails if wrong members.previous')

  const extrajunk = Mock({ name: 'doop' })
  t.false(isValid(extrajunk), 'fails if anything is added')

  const missingMembers = Mock()
  delete missingMembers.tangles.members
  t.false(isValid(missingMembers), 'fails if members missing')

  const hasRecps = Mock()
  hasRecps.recps = [GroupId()]
  t.false(isValid(hasRecps), "fails if there's recps")

  t.end()
})
