// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const BB1 = 'bendybutt-v1'
const v1Details = { purpose: 'v1', feedFormat: BB1 }
const NOT_METADATA = new Set([
  'type',
  'metafeed',
  'feedpurpose',
  'subfeed',
  'tangles',
  'reason',
  'nonce',
  'recps',
])

module.exports = {
  BB1,
  v1Details,
  NOT_METADATA,
}
