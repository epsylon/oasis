// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const bencode = require('bencode')

const _extractCache = new Map()

function extract(nativeMsg) {
  if (_extractCache.has(nativeMsg)) {
    return _extractCache.get(nativeMsg)
  }
  const [payload, signatureBFE] = bencode.decode(nativeMsg)
  const [authorBFE, sequence, previousBFE, timestamp, contentSection] = payload
  const extracted = {
    payload,
    signatureBFE,
    authorBFE,
    sequence,
    previousBFE,
    timestamp,
    contentSection,
  }
  _extractCache.set(nativeMsg, extracted)
  return extracted
}

module.exports = extract
