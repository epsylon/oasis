// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const ssbKeys = require('ssb-keys')

const _msgIdCache = new Map()

module.exports = function getMsgId(nativeMsg) {
  if (_msgIdCache.has(nativeMsg)) {
    return _msgIdCache.get(nativeMsg)
  }
  const msgId = '%' + ssbKeys.hash(JSON.stringify(nativeMsg, null, 2))
  _msgIdCache.set(nativeMsg, msgId)
  return msgId
}
