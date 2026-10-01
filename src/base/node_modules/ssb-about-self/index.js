// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const pull = require('pull-stream')
const pullAsync = require('pull-async')
const cat = require('pull-cat')
const IndexPlugin = require('./plugin')

module.exports = {
  name: 'aboutSelf',
  version: '1.0.0',
  manifest: {
    get: 'async',
    stream: 'source',
  },
  permissions: {
    master: {
      allow: ['get', 'stream'],
    },
  },
  init(ssb) {
    ssb.db.registerIndex(IndexPlugin)

    function get(feedId, cb) {
      const indexPlugin = ssb.db.getIndex('aboutSelf')
      ssb.db.onDrain('aboutSelf', () => {
        cb(null, indexPlugin.getProfile(feedId))
      })
    }

    function stream(feedId) {
      const indexPlugin = ssb.db.getIndex('aboutSelf')
      return cat([
        // First deliver latest field value
        pull(
          pullAsync((cb) => {
            get(feedId, cb)
          }),
          pull.filter((out) => out.name || out.image || out.description)
        ),

        // Then deliver live field values
        indexPlugin.getLiveProfile(feedId),
      ])
    }

    return {
      get,
      stream,
    }
  },
}
