// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const ssbKeys = require('ssb-keys')
const SSBURI = require('ssb-uri2')

const _msgIdCache = new Map()

function getMsgId(nativeMsg) {
  if (_msgIdCache.has(nativeMsg)) {
    return _msgIdCache.get(nativeMsg)
  }
  let data = ssbKeys.hash(nativeMsg)
  if (data.endsWith('.sha256')) data = data.slice(0, -'.sha256'.length)
  const msgId = SSBURI.compose({
    type: 'message',
    format: 'bendybutt-v1',
    data,
  })
  _msgIdCache.set(nativeMsg, msgId)
  return msgId
}

module.exports = getMsgId
