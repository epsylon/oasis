// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const blake3 = require('blake3')
const bfe = require('ssb-bfe')
const { extract } = require('./extract')

const BUTTWOO_MSG_TF = bfe.toTF('message', 'buttwoo-v1')

const _msgIdCache = new WeakMap()
const _msgIdStringCache = new WeakMap()
const _msgIdBFECache = new WeakMap()

function _getMsgIdHelper(nativeMsg) {
  let data = _msgIdCache.get(nativeMsg)
  if (!data) {
    const [encodedValue, signature] = extract(nativeMsg)
    data = blake3.hash(Buffer.concat([encodedValue, signature]))
    _msgIdCache.set(nativeMsg, data)
  }
  return data
}

function getMsgId(nativeMsg) {
  if (_msgIdStringCache.has(nativeMsg)) {
    return _msgIdStringCache.get(nativeMsg)
  }

  let data = _getMsgIdHelper(nativeMsg)

  // Fast:
  const msgId = `ssb:message/buttwoo-v1/${data
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')}`
  // Proper:
  // const msgId = SSBURI.compose({
  //   type: 'message',
  //   format: 'buttwoo-v1',
  //   data,
  // })
  _msgIdStringCache.set(nativeMsg, msgId)
  return msgId
}

function getMsgIdBFE(nativeMsg) {
  if (_msgIdBFECache.has(nativeMsg)) {
    return _msgIdBFECache.get(nativeMsg)
  }

  let data = _getMsgIdHelper(nativeMsg)
  const msgIdBFE = Buffer.concat([BUTTWOO_MSG_TF, data])
  _msgIdBFECache.set(nativeMsg, msgIdBFE)
  return msgIdBFE
}

module.exports = { getMsgId, getMsgIdBFE }
