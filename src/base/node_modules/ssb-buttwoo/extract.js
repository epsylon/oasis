// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const bipf = require('bipf')

const _extractCache = new WeakMap()
const _extractValCache = new WeakMap()

function extract(nativeMsg) {
  if (_extractCache.has(nativeMsg)) {
    return _extractCache.get(nativeMsg)
  }
  const arr = bipf.decode(nativeMsg)
  _extractCache.set(nativeMsg, arr)
  return arr
}

function extractVal(encodedVal) {
  if (_extractValCache.has(encodedVal)) {
    return _extractValCache.get(encodedVal)
  }
  const arr = bipf.decode(encodedVal)
  _extractValCache.set(encodedVal, arr)
  return arr
}

module.exports = { extract, extractVal }
