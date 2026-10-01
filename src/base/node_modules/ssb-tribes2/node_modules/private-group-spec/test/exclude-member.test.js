// SPDX-FileCopyrightText: 2023 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const test = require('tape')
const isValid = require('../').validator.group.excludeMember
const { GroupId, FeedId, MsgId } = require('./helpers')

const base = {
  type: 'group/exclude-member',
  excludes: [FeedId(), FeedId()],
  recps: [GroupId()],
  tangles: {
    group: {
      root: MsgId(),
      previous: [MsgId(), MsgId()]
    },
    members: {
      root: MsgId(),
      previous: [MsgId(), MsgId()]
    }
  }
}

test('exclude message', (t) => {
  t.true(isValid(base), 'minimal')
  if (isValid.errors) throw isValid.errorsString

  t.false(isValid({ ...base, recps: [FeedId()] }), 'recp must be a group')

  t.false(
    isValid({ ...base, recps: [GroupId(), GroupId()] }),
    'can only send to 1 group'
  )

  t.false(
    isValid({
      ...base,
      excludes: []
    }),
    "can't miss feeds to exclude"
  )

  const manyExcludes = []
  for (let i = 0; i < 17; i++) manyExcludes.push(FeedId())
  t.true(
    isValid({
      ...base,
      excludes: manyExcludes
    }),
    "can't have too many excludes"
  )

  t.false(
    isValid({
      ...base,
      tangles: {
        ...base.tangles,
        epoch: {
          root: MsgId(),
          previous: [MsgId(), MsgId(), MsgId()]
        }
      }
    }),
    "can't have other tangles"
  )

  t.end()
})
