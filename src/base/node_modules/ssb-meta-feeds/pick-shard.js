// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const bfe = require('ssb-bfe')
const crypto = require('crypto')

module.exports = function pickShard(rootFeedId, idString) {
  const buf = Buffer.concat([bfe.encode(rootFeedId), bfe.encode(idString)])

  const hash = crypto.createHash('sha256')
  hash.update(buf)

  return hash.digest('hex')[0]
}
