// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros <contact@staltz.com>
//
// SPDX-License-Identifier: LGPL-3.0-only

const clarify = require('clarify-error')

module.exports = function prunePublish(ssb, content, keys, cb) {
  const group = content.tangles.group

  ssb.db.create({ keys, content, encryptionFormat: 'box2' }, (err, msg) => {
    if (err) {
      if (group.previous.length > 1) {
        const halfLength = Math.ceil(group.previous.length / 2)
        group.previous = group.previous.slice(0, halfLength)

        return prunePublish(ssb, content, keys, cb)
      } else {
        return cb(clarify(err, 'Failed to publish message in prunePublish'))
      }
    }

    cb(null, msg)
  })
}
