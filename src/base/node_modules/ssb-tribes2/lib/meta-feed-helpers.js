// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros <contact@staltz.com>
//
// SPDX-License-Identifier: LGPL-3.0-only

const pull = require('pull-stream')
const paraMap = require('pull-paramap')
const {
  where,
  and,
  count,
  isDecrypted,
  type,
  author,
  toCallback,
  toPullStream,
} = require('ssb-db2/operators')
const clarify = require('clarify-error')
const {
  keySchemes,
  validator: {
    group: { initRoot: isInitRoot },
  },
} = require('private-group-spec')
const { SecretKey } = require('ssb-private-group-keys')
const { fromMessageSigil } = require('ssb-uri2')

module.exports = (ssb) => {
  function secretKeyFromString(string) {
    return new SecretKey(Buffer.from(string, 'base64'))
  }

  function findOrCreateAdditionsFeed(cb) {
    const details = {
      purpose: 'group/additions',
      feedFormat: 'classic',
    }

    ssb.metafeeds.findOrCreate(details, cb)
  }

  function findEmptyGroupFeed(rootId, cb) {
    let found = false
    pull(
      ssb.metafeeds.branchStream({ root: rootId, old: true, live: false }),
      pull.filter((branch) => branch.length === 4),
      pull.map((branch) => branch[3]),
      // only grab feeds that look like group feeds
      pull.filter((feed) => feed.recps && feed.purpose.length === 44),
      paraMap((feed, cb) => {
        ssb.db.query(
          where(author(feed.id)),
          count(),
          toCallback((err, count) => {
            // prettier-ignore
            if (err) return cb(clarify(err, 'Failed to count messages in group feed'))

            if (count === 0) {
              // we're only interested in empty feeds
              return cb(null, feed)
            } else {
              return cb()
            }
          })
        )
      }),
      pull.filter(),
      pull.unique('id'),
      pull.take(1),
      pull.drain(
        (emptyFeed) => {
          found = true
          return cb(null, emptyFeed)
        },
        (err) => {
          if (err) cb(clarify(err, 'Failed to find empty group feed'))
          if (!found) cb()
        }
      )
    )
  }

  function findOrCreateFromSecret(secret, rootId, cb) {
    const recps = [
      { key: secret.toBuffer(), scheme: keySchemes.private_group },
      // encrypt to myself to be able to get back to the group without finding the group/add-member for me (maybe i crashed before adding myself)
      rootId,
    ]

    const groupFeedDetails = {
      purpose: secret.toString(),
      feedFormat: 'classic',
      recps,
      encryptionFormat: 'box2',
    }

    ssb.metafeeds.findOrCreate(groupFeedDetails, (err, groupFeed) => {
      if (err) return cb(clarify(err, 'Failed to find or create group feed'))
      cb(null, groupFeed)
    })
  }

  function findOrCreateGroupFeed(input = null, cb) {
    const inputSecret = Buffer.isBuffer(input) ? new SecretKey(input) : input

    ssb.metafeeds.findOrCreate(function gotRoot(err, root) {
      // prettier-ignore
      if (err) return cb(clarify(err, 'Failed to find or create root feed when finding or creating group feed'))

      // 1. publish. we know the secret and should just findOrCreate the feed
      // 2. create. we don't have a secret yet but can make or find one
      //   2.1. try to find an empty feed in case we've crashed before. use the secret from that one
      //   2.2. if we can't find an empty feed, make a new secret and findOrCreate

      if (inputSecret) {
        return findOrCreateFromSecret(inputSecret, root.id, cb)
      } else {
        findEmptyGroupFeed(root.id, (err, emptyFeed) => {
          // prettier-ignore
          if (err) return cb(clarify(err, 'Failed to find empty group feed when finding or creating a group'))

          if (emptyFeed) {
            return cb(null, emptyFeed)
          } else {
            const newSecret = new SecretKey()
            findOrCreateFromSecret(newSecret, root.id, cb)
          }
        })
      }
    })
  }

  function createGroupWithoutMembers(myRoot, cb) {
    findOrCreateGroupFeed(null, function gotGroupFeed(err, groupFeed) {
      // prettier-ignore
      if (err) return cb(clarify(err, 'Failed to find or create group feed when creating a group'))

      const secret = secretKeyFromString(groupFeed.purpose)

      const recps = [
        { key: secret.toBuffer(), scheme: keySchemes.private_group },
        myRoot.id,
      ]

      const content = {
        type: 'group/init',
        version: 'v2',
        secret: secret.toString('base64'),
        tangles: {
          group: { root: null, previous: null },
          epoch: { root: null, previous: null },
          members: { root: null, previous: null },
        },
      }
      if (!isInitRoot(content)) return cb(new Error(isInitRoot.errorsString))

      ssb.db.create(
        {
          keys: groupFeed.keys,
          content,
          recps,
          encryptionFormat: 'box2',
        },
        (err, groupInitMsg) => {
          // prettier-ignore
          if (err) return cb(clarify(err, "couldn't create group root message"))
          return cb(null, { groupInitMsg, groupFeed, myRoot })
        }
      )
    })
  }

  /** more specifically: a group that has never had any members. i.e. either
   * 1. newly created but tribes2 crashed before we had time to add ourselves to it. in that case find and return it. if we can't find such a group then
   * 2. freshly create a new group, and return */
  function findOrCreateGroupWithoutMembers(cb) {
    ssb.metafeeds.findOrCreate(function gotRoot(err, myRoot) {
      // prettier-ignore
      if (err) return cb(clarify(err, 'Failed to find or create root feed when creating a group'))

      // crash resistence: look for groups without any group/add-member messages
      let foundMemberlessGroup = false
      pull(
        ssb.db.query(
          where(and(isDecrypted('box2'), type('group/init'))),
          toPullStream()
        ),
        // find only init for epoch zero
        pull.filter(
          (rootMsg) => rootMsg.value.content?.tangles?.group?.root === null
        ),

        // see if there are and members added
        pull.asyncMap((rootMsg, cb) => {
          // return rootMsg if empty group, otherwise return false
          let foundMember = false
          pull(
            ssb.db.query(
              where(and(isDecrypted('box2'), type('group/add-member'))),
              toPullStream()
            ),
            pull.filter(
              (msg) =>
                msg?.value?.content?.root === fromMessageSigil(rootMsg.key)
            ),
            pull.take(1),
            pull.drain(
              () => {
                foundMember = true
                return cb(null, false)
              },
              (err) => {
                if (err) return cb(err)
                else if (!foundMember) cb(null, rootMsg)
              }
            )
          )
        }),
        pull.filter(Boolean),

        pull.take(1),
        pull.drain(
          (rootMsg) => {
            foundMemberlessGroup = true
            ssb.metafeeds.advanced.findById(
              rootMsg.value.author,
              (err, groupFeed) => {
                // prettier-ignore
                if (err) return cb(clarify(err, "failed finding details of the memberless group feed"))

                rootMsg.value.content = rootMsg.meta.originalContent
                return cb(null, {
                  groupInitMsg: rootMsg,
                  groupFeed,
                  myRoot,
                })
              }
            )
          },
          (err) => {
            // prettier-ignore
            if (err) return cb(clarify(err, "errored trying to find potential memberless feed"))
            else if (!foundMemberlessGroup) {
              return createGroupWithoutMembers(myRoot, cb)
            }
          }
        )
      )
    })
  }

  function getRootFeedIdFromMsgId(groupRootMsgId, cb) {
    ssb.db.get(groupRootMsgId, (err, rootMsg) => {
      // prettier-ignore
      if (err) return cb(clarify(err, "couldn't get root msg for finding root feed"))

      ssb.metafeeds.findRootFeedId(rootMsg.author, (err, rootFeedId) => {
        // prettier-ignore
        if (err) return cb(clarify(err, "couldn't find root feed id from root msg author"))

        return cb(null, rootFeedId)
      })
    })
  }

  return {
    secretKeyFromString,
    findOrCreateAdditionsFeed,
    findEmptyGroupFeed,
    findOrCreateFromSecret,
    findOrCreateGroupFeed,
    findOrCreateGroupWithoutMembers,
    createGroupWithoutMembers,
    getRootFeedIdFromMsgId,
  }
}
