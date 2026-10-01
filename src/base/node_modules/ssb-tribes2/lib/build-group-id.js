// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

/* eslint-disable camelcase */

const { unboxKey, DeriveSecret, CloakedMsgId } = require('envelope-js')
const LABELS = require('envelope-spec/derive_secret/constants.json')
const { keySchemes } = require('private-group-spec')
const base64url = require('base64-url')

const bfe = require('ssb-bfe')

module.exports = function buildGroupId({
  groupInitMsg,
  readKey,
  msgKey,
  secret,
}) {
  const msgId = bfe.encode(groupInitMsg.key)

  if (!readKey) {
    if (groupInitMsg.value.meta && groupInitMsg.value.meta.unbox) {
      // when coming from a view which has auto-unboxed.
      readKey = toBuffer(groupInitMsg.value.meta.unbox)
    } else if (msgKey) {
      readKey = fromMsgKey(groupInitMsg, msgKey)
    } else if (secret) {
      // when we've just heard a group/add-member message, we need to calculate
      // groupId and only have these two things
      readKey = fromSecret(groupInitMsg, secret)
    } else {
      throw new Error('Read key must be defined???')
    }
  }

  const cloakedMsgId = base64url.escape(
    new CloakedMsgId(msgId, readKey).toString()
  )

  return `ssb:identity/group/${cloakedMsgId}=`
}

function fromMsgKey(msg, msgKey) {
  if (!msgKey) throw new Error('groupId: expected either msgKey OR readKey')

  const derive = DeriveSecret(
    bfe.encode(msg.value.author),
    bfe.encode(msg.value.previous)
  )

  return derive(msgKey, [LABELS.read_key])
}

function fromSecret(msg, secret) {
  const { author, previous, content } = msg.value

  const envelope = Buffer.from(content.replace('.box2', ''), 'base64')
  const feed_id = bfe.encode(author)
  const prev_msg_id = bfe.encode(previous)

  const group_key = {
    key: toBuffer(secret),
    scheme: keySchemes.private_group,
  }
  return unboxKey(envelope, feed_id, prev_msg_id, [group_key], {
    maxAttempts: 1,
  })
}

function toBuffer(str) {
  if (Buffer.isBuffer(str)) return str

  return Buffer.from(str, 'base64')
}
