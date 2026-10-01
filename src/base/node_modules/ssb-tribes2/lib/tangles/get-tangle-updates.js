// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const pull = require('pull-stream')
const { where, live, toPullStream } = require('ssb-db2/operators')

const { tangleRoot } = require('../../lib/operators')

function getTangleUpdates(ssb, tangle, root, cb) {
  pull(getTangleUpdates.stream(ssb, tangle, root), pull.collect(cb))
}

getTangleUpdates.stream = function tangleUpdatesStream(
  ssb,
  tangle,
  root,
  opts = {}
) {
  return pull(
    ssb.db.query(
      where(tangleRoot(tangle, root)),
      opts.live ? live({ old: true }) : null,
      toPullStream()
    ),
    pull.filter(
      (m) =>
        Array.isArray(m.value.content.tangles[tangle].previous) &&
        m.value.content.tangles[tangle].previous.length > 0
    )
  )
}

module.exports = getTangleUpdates
