// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros <contact@staltz.com>
//
// SPDX-License-Identifier: LGPL-3.0-only

const chunk = require('lodash.chunk')
const pull = require('pull-stream')
const { SecretKey } = require('ssb-private-group-keys')
const clarify = require('clarify-error')
const debug = require('debug')('ssb:tribes2')
const {
  validator: {
    group: { initEpoch: isInitEpoch },
  },
  keySchemes,
} = require('private-group-spec')
const Epochs = require('./epochs')

function createNewEpoch(ssb, groupId, opts, cb) {
  ssb.metafeeds.findOrCreate(function gotRoot(err, myRoot) {
    // prettier-ignore
    if (err) return cb(clarify(err, "Couldn't get own root when excluding members"))

    debug('i am %s about to create new epoch', myRoot.id)

    const newSecret = new SecretKey()
    const addInfo = { key: newSecret.toBuffer() }

    ssb.box2.addGroupInfo(groupId, addInfo, (err) => {
      // prettier-ignore
      if (err) return cb(clarify(err, "Couldn't store new key when excluding members"))

      const newKey = {
        key: newSecret.toBuffer(),
        scheme: keySchemes.private_group,
      }
      ssb.box2.pickGroupWriteKey(groupId, newKey, (err) => {
        // prettier-ignore
        if (err) return cb(clarify(err, "Couldn't switch to new key for writing when excluding members"))

        const newEpochContent = {
          type: 'group/init',
          version: 'v2',
          secret: newSecret.toString('base64'),
          tangles: {
            members: { root: null, previous: null },
          },
          recps: [groupId, myRoot.id],
        }
        const newTangleOpts = {
          tangles: ['epoch'],
          isValid: isInitEpoch,
        }

        ssb.tribes2.publish(newEpochContent, newTangleOpts, (err) => {
          // prettier-ignore
          if (err) return cb(clarify(err, "Couldn't post init msg on new epoch when excluding members"))

          // prettier-ignore
          if (opts?._reAddCrash) return cb(new Error('Intentional crash before re-adding members'))

          reAddMembers(
            ssb,
            groupId,
            { _reAddSkipMember: opts?._reAddSkipMember },
            (err) => {
              // prettier-ignore
              if (err) return cb(clarify(err, "Couldn't re-add members when creating new epoch"))
              cb()
            }
          )
        })
      })
    })
  })
}

/** idempotent */
function reAddMembers(ssb, groupId, opts, cb) {
  const epochs = Epochs(ssb)

  epochs.getPreferredEpoch(groupId, (err, preferredEpoch) => {
    // prettier-ignore
    if (err) return cb(clarify(err, "Couldn't get preferred epoch when re-adding members"))

    epochs.getMissingMembers(groupId, (err, missingMembersEveryEpoch) => {
      // prettier-ignore
      if (err) return cb(clarify(err, "Couldn't find missing members after exclusion"))

      // to pretend-fail in tests
      const keepMember = (memberId) =>
        opts?._reAddSkipMember ? memberId !== opts?._reAddSkipMember : true

      const missingMembers = missingMembersEveryEpoch
        .find((epoch) => epoch.epoch === preferredEpoch.id)
        ?.missing.filter(keepMember)

      if (!missingMembers?.length) return cb()

      debug('about to re-add %O', missingMembers)
      pull(
        pull.values(chunk(missingMembers, 15)),
        pull.asyncMap((membersToAdd, cb) =>
          ssb.tribes2.addMembers(
            groupId,
            membersToAdd,
            { oldSecrets: false },
            cb
          )
        ),
        pull.collect((err) => {
          // prettier-ignore
          if (err) return cb(clarify(err, "Couldn't re-add remaining members after exclusion"))
          cb()
        })
      )
    })
  })
}

module.exports = {
  createNewEpoch,
  reAddMembers,
}
