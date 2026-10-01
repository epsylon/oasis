// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const Reduce = require('@tangle/reduce')
const Strategy = require('@tangle/strategy')
const clarify = require('clarify-error')
const { isIdentityGroupSSBURI, fromMessageSigil } = require('ssb-uri2')
const { where, author, toPullStream } = require('ssb-db2/operators')
const pull = require('pull-stream')

const getUpdates = require('./get-tangle-updates')

const strategy = new Strategy({})

function toUri(link) {
  if (typeof link !== 'string') return link
  return link.startsWith('%') ? fromMessageSigil(link) : link
}

function getTangleRoot(server, tangle, groupId, cb) {
  server.box2.getGroupInfo(groupId, (err, info) => {
    // prettier-ignore
    if (err) return cb(clarify(err, 'Failed to get group info when getting a tangle'))

    if (!info || info.excluded) {
      return cb(new Error(`get-tangle: unknown groupId ${groupId}`))
    }

    if (tangle === 'members') {
      // we find the id of the init msg for the current epoch
      pull(
        server.metafeeds.branchStream({ old: true, live: false }),
        // get all leaf feeds
        pull.filter((branch) => branch.length === 4),
        pull.map((branch) => branch[3]),
        // get all feeds for this epoch
        pull.filter(
          (feed) => feed.purpose === info.writeKey.key.toString('base64')
        ),
        pull.map((feed) =>
          pull(
            server.db.query(where(author(feed.id)), toPullStream()),
            // get all first messages, since that's where the init would be
            pull.take(1)
          )
        ),
        pull.flatten(),
        // find the init
        pull.filter((msg) => msg.value?.content?.type === 'group/init'),
        pull.take(1),
        pull.drain(
          (msg) => cb(null, fromMessageSigil(msg.key)),
          (err) => {
            // prettier-ignore
            if (err) return cb(clarify(err, 'Failed to find init msg for current epoch when trying to get members tangle'))
          }
        )
      )
    } else {
      return cb(null, info.root)
    }
  })
}

/** for figuring out what "previous" should be for the group. `server` is the ssb server you're using. `tangle` is the name of the tangle in the group you're looking for, e.g. "group" or "members" */
module.exports = function getTangleData(server, tangle, groupId, cb) {
  if (!isIdentityGroupSSBURI(groupId)) {
    // prettier-ignore
    return cb(new Error(`get-tangle expects valid groupId, got: ${groupId}`))
  }

  getTangleRoot(server, tangle, groupId, (err, root) => {
    // prettier-ignore
    if (err) return cb(clarify(err, 'Failed to get tangle root when getting tangle'))

    getUpdates(server, tangle, root, (err, updates) => {
      // prettier-ignore
      if (err) return cb(clarify(err, 'Failed to read updates when getting tangle'))

      const nodes = updates.map((msg) => ({
        key: toUri(msg.key),
        previous: msg.value.content.tangles[tangle].previous,
      }))
      // NOTE: getUpdates query does not get root node
      nodes.push({ key: root, previous: null })

      // Create a Reduce using the message contents
      // NOTE - do NOT store the whole msg (node)
      // we're not doing any reducing of transformations, we care only about
      // reducing the graph to find the tips
      // each node should be pruned down to e.g. { key: '%D', previous: ['%B', '%C'] }

      const reduce = new Reduce(strategy, { nodes })
      cb(null, {
        root,
        previous: Object.keys(reduce.state),
      })
    })
  })
}
