// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const ssbKeys = require('ssb-keys')

const _msgIdCache = new Map()

module.exports = function getMsgId(msgTuple) {
  if (_msgIdCache.has(msgTuple)) {
    return _msgIdCache.get(msgTuple)
  }
  const indexMsg = Array.isArray(msgTuple) ? msgTuple[0] : msgTuple
  const hash = ssbKeys.hash(JSON.stringify(indexMsg, null, 2))
  const msgId = `ssb:message/indexed-v1/${hash
    .replace(/\+/g, '-')
    .replace(/\//g, '_')}`
  _msgIdCache.set(msgTuple, msgId)
  return msgId
}
