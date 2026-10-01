// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const set = require('lodash.set')
const clarify = require('clarify-error')
const { isIdentityGroupSSBURI } = require('ssb-uri2')
const getTangleData = require('./get-tangle-data')

/**
 * Note that this mutates `content`
 * `tangles` is an array like ["group", "members"]
 */
module.exports = function addTangles(server, content, tangles, cb) {
  function addSomeTangles(content, tangles, cb) {
    if (tangles.length === 0) return cb(null, content)

    const currTangle = tangles[0]

    getTangleData(server, currTangle, content.recps[0], (err, rootPrevious) => {
      // prettier-ignore
      if (err) return cb(clarify(err, 'Failed to get group tangle when adding group tangle to message'))

      set(content, ['tangles', currTangle], rootPrevious)

      // we shuffle so that if multiple peers are also trying to converge,
      // we hopefully tangle differently and converge faster (at least if some of the entries get pruned)
      content.tangles[currTangle].previous = content.tangles[
        currTangle
      ].previous.sort(() => (Math.random() < 0.5 ? -1 : +1))

      return addSomeTangles(content, tangles.slice(1), cb)
    })
  }

  if (!content.recps) return cb(new Error('Missing recps when adding tangles'))

  if (!isIdentityGroupSSBURI(content.recps[0]))
    return cb(new Error('recps[0] is not a group id when adding tangles'))

  addSomeTangles(content, tangles, (err, content) => {
    // prettier-ignore
    if (err) return cb(clarify(err, 'failed to add tangles to content'))

    return cb(null, content)
  })
}
