// SPDX-FileCopyrightText: 2023 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const { allocAndEncode, seekKey2, iterate } = require('bipf')
const { equal } = require('jitdb/operators')

const B_CONTENT = allocAndEncode('content')
const B_TANGLES = allocAndEncode('tangles')
const B_ROOT = allocAndEncode('root')
const B_RECPS = allocAndEncode('recps')

const B_TANGLE_MAP = new Map()
// tangle: StrinG => B_TANGLE: Buffer

module.exports = {
  tangleRoot(tangle, value) {
    if (!B_TANGLE_MAP.has(tangle)) {
      B_TANGLE_MAP.set(tangle, allocAndEncode(tangle))
    }
    const B_TANGLE = B_TANGLE_MAP.get(tangle)

    function seekTangleRoot(buffer, start, pValue) {
      if (pValue < 0) return -1
      const pValueContent = seekKey2(buffer, pValue, B_CONTENT, 0)
      if (pValueContent < 0) return -1
      const pValueContentTangles = seekKey2(buffer, pValueContent, B_TANGLES, 0)
      if (pValueContentTangles < 0) return -1
      const pValueContentTanglesTangle = seekKey2(buffer, pValueContentTangles, B_TANGLE, 0)
      if (pValueContentTanglesTangle < 0) return -1
      return seekKey2(buffer, pValueContentTanglesTangle, B_ROOT, 0)
    }

    return equal(seekTangleRoot, value, {
      indexType: `value_content_tangles_${tangle}_root`,
    })
  },

  groupRecp(value) {
    return equal(seekFirstRecp, value, {
      prefix: 32,
      indexType: 'value_content_recps_0',
    })
  },
}

function seekFirstRecp(buffer, start, pValue) {
  if (pValue < 0) return -1
  const pValueContent = seekKey2(buffer, pValue, B_CONTENT, 0)
  if (pValueContent < 0) return -1
  const pValueContentRecps = seekKey2(buffer, pValueContent, B_RECPS, 0)
  if (pValueContentRecps < 0) return -1

  let pValueContentRecps0
  const error = iterate(buffer, pValueContentRecps, (_, pointer) => {
    pValueContentRecps0 = pointer
    return true
  })
  if (error === -1) return -1
  return pValueContentRecps0
}
