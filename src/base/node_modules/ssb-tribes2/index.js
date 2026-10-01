// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros <contact@staltz.com>
//
// SPDX-License-Identifier: LGPL-3.0-only

const { promisify } = require('util')
const pull = require('pull-stream')
const paraMap = require('pull-paramap')
const pullMany = require('pull-many')
const pullFlatMerge = require('pull-flat-merge')
const pullAbortable = require('pull-abortable')
const pullDefer = require('pull-defer')
const clarify = require('clarify-error')
const {
  where,
  and,
  isDecrypted,
  type,
  live: dbLive,
  toPullStream,
} = require('ssb-db2/operators')
const {
  validator: {
    group: {
      addMember: isAddMember,
      content: isContent,
      excludeMember: isExcludeMember,
    },
  },
  keySchemes,
} = require('private-group-spec')
const { fromMessageSigil, isBendyButtV1FeedSSBURI } = require('ssb-uri2')

const startListeners = require('./listeners')
const buildGroupId = require('./lib/build-group-id')
const addTangles = require('./lib/tangles/add-tangles')
const publishAndPrune = require('./lib/prune-publish')
const MetaFeedHelpers = require('./lib/meta-feed-helpers')
const Epochs = require('./lib/epochs')
const { groupRecp } = require('./lib/operators')
const { createNewEpoch } = require('./lib/exclude')

module.exports = {
  name: 'tribes2',
  manifest: {
    create: 'async',
    get: 'async',
    list: 'source',
    addMembers: 'async',
    excludeMembers: 'async',
    publish: 'async',
    listMembers: 'source',
    listInvites: 'source',
    acceptInvite: 'async',
    start: 'async',
  },
  // eslint-disable-next-line no-unused-vars
  init(ssb, config) {
    const {
      secretKeyFromString,
      findOrCreateAdditionsFeed,
      findOrCreateGroupFeed,
      findOrCreateGroupWithoutMembers,
      getRootFeedIdFromMsgId,
    } = MetaFeedHelpers(ssb)
    const {
      getTipEpochs,
      getPredecessorEpochs,
      getPreferredEpoch,
      getMembers,
    } = Epochs(ssb)

    function create(opts = {}, cb) {
      if (cb === undefined) return promisify(create)(opts)

      findOrCreateGroupWithoutMembers((err, group) => {
        // prettier-ignore
        if (err) return cb(clarify(err, 'Failed to create group init message when creating a group'))

        const { groupInitMsg, groupFeed, myRoot } = group

        const secret = secretKeyFromString(groupFeed.purpose)

        const data = {
          id: buildGroupId({
            groupInitMsg,
            secret: secret.toBuffer(),
          }),
          writeKey: {
            key: secret.toBuffer(),
            scheme: keySchemes.private_group,
          },
          readKeys: [
            { key: secret.toBuffer(), scheme: keySchemes.private_group },
          ],
          root: fromMessageSigil(groupInitMsg.key),
          subfeed: groupFeed.keys,
        }

        ssb.box2.addGroupInfo(data.id, {
          key: data.writeKey.key,
          root: data.root,
        })

        // Adding myself for recovery reasons
        addMembers(data.id, [myRoot.id], {}, (err) => {
          // prettier-ignore
          if (err) return cb(clarify(err, 'Failed to add myself to the group when creating a group'))

          return cb(null, data)
        })
      })
    }

    function get(id, cb) {
      if (cb === undefined) return promisify(get)(id)

      ssb.box2.getGroupInfo(id, (err, info) => {
        if (err) return cb(clarify(err, 'Failed to get group details'))

        if (!info) return cb(new Error(`Couldn't find group with id ${id}`))

        cb(null, {
          ...info,
          id,
        })
      })
    }

    function list(opts = {}) {
      return pull(
        ssb.box2.listGroupIds({
          live: !!opts.live,
          excluded: !!opts.excluded,
        }),
        paraMap(get, 4)
      )
    }

    function addMembers(groupId, feedIds, opts = {}, cb) {
      if (cb === undefined) return promisify(addMembers)(groupId, feedIds, opts)

      opts.oldSecrets ??= true

      if (!feedIds || feedIds.length === 0) {
        return cb(new Error('No feedIds provided to addMembers'))
      }
      if (feedIds.length > 15) {
        // prettier-ignore
        return cb(new Error(`Tried to add ${feedIds.length} members, the max is 15`))
      }
      if (feedIds.some((id) => !isBendyButtV1FeedSSBURI(id))) {
        return cb(new Error('addMembers only supports bendybutt-v1 feed IDs'))
      }

      get(groupId, (err, { root }) => {
        // prettier-ignore
        if (err) return cb(clarify(err, `Failed to get group details when adding members`))

        getRootFeedIdFromMsgId(root, (err, rootAuthorId) => {
          // prettier-ignore
          if (err) return cb(clarify(err, "couldn't get root id of author of root msg"))

          getTipEpochs(groupId, (err, tipEpochs) => {
            // prettier-ignore
            if (err) return cb(clarify(err, "Couldn't get tip epochs when adding members"))

            const getFeed = opts?._feedKeys
              ? (cb) => cb(null, { keys: opts._feedKeys })
              : findOrCreateAdditionsFeed

            getFeed((err, additionsFeed) => {
              // prettier-ignore
              if (err) return cb(clarify(err, 'Failed to find or create additions feed when adding members'))

              const options = {
                isValid: isAddMember,
                tangles: ['members'],
                feedKeys: additionsFeed.keys,
              }
              pull(
                pull.values(tipEpochs),
                pull.asyncMap((tipEpoch, cb) => {
                  getPredecessorEpochs(
                    groupId,
                    tipEpoch.id,
                    (err, predecessors) => {
                      // prettier-ignore
                      if (err) return cb(clarify(err, "Couldn't get predecessor epochs when adding members"))

                      const oldSecrets = predecessors.map((pred) =>
                        pred.secret.toString('base64')
                      )
                      const content = {
                        type: 'group/add-member',
                        version: 'v2',
                        secret: tipEpoch.secret.toString('base64'),
                        oldSecrets: opts.oldSecrets ? oldSecrets : undefined,
                        root,
                        creator: rootAuthorId,
                        text: opts?.text,
                        recps: [groupId, ...feedIds],
                      }
                      return cb(null, content)
                    }
                  )
                }),
                pull.asyncMap((content, cb) => publish(content, options, cb)),
                pull.collect((err, msgs) => {
                  // prettier-ignore
                  if (err) return cb(clarify(err, 'Failed to publish add-member message(s)'))

                  return cb(null, msgs)
                })
              )
            })
          })
        })
      })
    }

    function excludeMembers(groupId, feedIds, opts = {}, cb) {
      if (cb === undefined)
        return promisify(excludeMembers)(groupId, feedIds, opts)

      const excludeContent = {
        type: 'group/exclude-member',
        excludes: feedIds,
        recps: [groupId],
      }
      const excludeOpts = {
        tangles: ['members'],
        isValid: isExcludeMember,
      }
      publish(excludeContent, excludeOpts, (err) => {
        // prettier-ignore
        if (err) return cb(clarify(err, 'Failed to publish exclude msg'))

        // prettier-ignore
        if (opts?._newEpochCrash) return cb(new Error('Intentional crash before creating new epoch'))

        createNewEpoch(
          ssb,
          groupId,
          {
            _reAddCrash: opts?._reAddCrash,
            _reAddSkipMember: opts?._reAddSkipMember,
          },
          (err) => {
            // prettier-ignore
            if (err) return cb(clarify(err, "Couldn't create new epoch and/or re-add members when excluding members"))
            cb()
          }
        )
      })
    }

    function publish(content, opts, cb) {
      if (cb === undefined) return promisify(publish)(content, opts)

      if (!content) return cb(new Error('Missing content'))

      const isValid = opts?.isValid ?? isContent
      const tangles = ['group', ...(opts?.tangles ?? [])]

      const recps = content.recps
      if (!recps || !Array.isArray(recps) || recps.length < 1) {
        return cb(new Error('Missing recps'))
      }
      const groupId = recps[0]

      get(groupId, (err, { writeKey, excluded }) => {
        // prettier-ignore
        if (err) return cb(clarify(err, 'Failed to get group details when publishing to a group'))

        if (excluded)
          return cb(
            new Error("Cannot publish to a group we've been excluded from")
          )

        addTangles(ssb, content, tangles, (err, content) => {
          // prettier-ignore
          if (err) return cb(clarify(err, 'Failed to add group tangle when publishing to a group'))

          if (!isValid(content))
            return cb(
              new Error(isValid.errorsString ?? 'content failed validation')
            )

          const getFeed = opts?.feedKeys
            ? (_, cb) => cb(null, { keys: opts.feedKeys })
            : findOrCreateGroupFeed

          getFeed(writeKey.key, (err, groupFeed) => {
            // prettier-ignore
            if (err) return cb(clarify(err, 'Failed to find or create group feed when publishing to a group'))

            publishAndPrune(ssb, content, groupFeed.keys, (err, msg) => {
              // prettier-ignore
              if (err) return cb(clarify(err, 'Failed to publishAndPrune when publishing a group message'))
              return cb(null, msg)
            })
          })
        })
      })
    }

    function listMembers(groupId, opts = {}) {
      const { live, allAdded } = opts
      const deferredSource = pullDefer.source()

      const listAllAdded = () => {
        const allAddedMembers = new Set()

        const source = pull(
          ssb.db.query(
            where(
              and(
                isDecrypted('box2'),
                type('group/add-member'),
                groupRecp(groupId)
              )
            ),
            live ? dbLive({ old: true }) : null,
            toPullStream()
          ),
          pull.filter(isAddMember),
          pull.map((msg) => msg.value.content),
          pull.map((content) =>
            // for situations where we haven't replicated much of the group yet, we make sure to at least include the group creator here so we're sure to make progress in replication
            [content.creator, ...content.recps.slice(1)]
          ),
          pull.flatten(),
          pull.unique(),
          pull.through((member) => allAddedMembers.add(member)),
          // return the whole list every time there's an update, to have a consistent listMembers api
          pull.map(() => ({ added: [...allAddedMembers], toExclude: [] }))
        )

        deferredSource.resolve(source)
      }

      const listUnlive = () => {
        getPreferredEpoch(groupId, (err, epoch) => {
          // prettier-ignore
          if (err) return deferredSource.abort(clarify(err, 'failed to load preferred epoch'))

          getMembers(epoch.id, (err, res) => {
            // prettier-ignore
            if (err) return deferredSource.abort(clarify(err, 'error getting members'))

            const source = pull.once(res)
            deferredSource.resolve(source)
          })
        })
      }

      const listLive = () => {
        let abortable = pullAbortable()
        const source = pull(
          getPreferredEpoch.stream(groupId, { live }),
          pull.map((epoch) => {
            abortable.abort()
            abortable = pullAbortable()

            return pull(getMembers.stream(epoch.id, { live }), abortable)
          }),
          pullFlatMerge()
        )
        deferredSource.resolve(source)
      }

      get(groupId, (err, group) => {
        // prettier-ignore
        if (err) return deferredSource.abort(clarify(err, 'Failed to get group info when listing members'))
        // prettier-ignore
        if (group.excluded) return deferredSource.abort( new Error("We're excluded from this group, can't list members"))

        if (allAdded) {
          listAllAdded()
          return
        }

        if (!live) {
          listUnlive()
          return
        }

        listLive()
      })

      return deferredSource
    }

    function listInvites() {
      const deferredSource = pullDefer.source()

      getMyReadKeys((err, myReadKeys) => {
        // prettier-ignore
        if (err) return deferredSource.abort(clarify(err, 'Failed to list group readKeys when listing invites'))

        const source = pull(
          // get all the additions we've heard of
          ssb.db.query(
            where(and(isDecrypted('box2'), type('group/add-member'))),
            toPullStream()
          ),
          pull.filter((msg) => isAddMember(msg)),
          pull.map((msg) => msg.value.content),

          // drop those we're grabbed secrets from already (in case we've been in the group before)
          pull.filter((content) => !myReadKeys.has(content.secret)),

          // groupId
          pull.map((content) => content.recps[0]),
          pull.unique(),
          // gather all the data required for each group-invite
          pull.asyncMap(getGroupInviteData)
        )

        deferredSource.resolve(source)
      })

      return deferredSource

      // listInvites helpers

      function getMyReadKeys(cb) {
        const myReadKeys = new Set()

        pull(
          // TODO replace with pull.values (unless want "round-robbin" sampling)
          pullMany([
            ssb.box2.listGroupIds(),
            ssb.box2.listGroupIds({ excluded: true }),
          ]),
          pull.flatten(),
          pull.asyncMap((groupId, cb) => ssb.box2.getGroupInfo(groupId, cb)),
          pull.drain(
            (groupInfo) =>
              groupInfo.readKeys
                .map((readKey) => readKey.key.toString('base64'))
                .forEach((readKeyString) => myReadKeys.add(readKeyString)),
            (err) => {
              if (err) return cb(err)
              return cb(null, myReadKeys)
            }
          )
        )
      }

      function getGroupInviteData(groupId, cb) {
        let root
        const secrets = new Set()
        let writeSecret = null

        pull(
          ssb.db.query(
            where(
              and(
                isDecrypted('box2'),
                type('group/add-member'),
                groupRecp(groupId)
              )
            ),
            toPullStream()
          ),
          pull.filter((msg) => isAddMember(msg)),
          pull.drain(
            (msg) => {
              root ||= msg.value.content.root
              const oldSecrets = msg.value.content.oldSecrets
              if (oldSecrets) {
                oldSecrets.forEach((oldSecret) => secrets.add(oldSecret))
              }
              const latestSecret = msg.value.content.secret
              secrets.add(latestSecret)
              writeSecret = latestSecret
            },
            (err) => {
              if (err) return cb(err)

              const readKeys = [...secrets].map((secret) => ({
                key: Buffer.from(secret, 'base64'),
                scheme: keySchemes.private_group,
              }))
              const invite = {
                id: groupId,
                root,
                readKeys,
                writeKey: {
                  key: Buffer.from(writeSecret, 'base64'),
                  scheme: keySchemes.private_group,
                },
              }
              return cb(null, invite)
            }
          )
        )
      }
    }

    function acceptInvite(groupId, cb) {
      if (cb === undefined) return promisify(acceptInvite)(groupId)

      pull(
        listInvites(),
        pull.filter((inviteInfo) => inviteInfo.id === groupId),
        pull.take(1),
        pull.collect((err, inviteInfos) => {
          // prettier-ignore
          if (err) return cb(clarify(err, 'Failed to list invites when accepting an invite'))
          // prettier-ignore
          if (!inviteInfos.length) return cb(new Error("Didn't find invite for that group id"))

          // TODO: which writeKey should be picked??
          // this will essentially pick a random write key from the current epoch tips
          const { id, root, readKeys, writeKey } = inviteInfos[0]
          pull(
            pull.values(readKeys),
            pull.asyncMap((readKey, cb) => {
              ssb.box2.addGroupInfo(id, { key: readKey.key, root }, cb)
            }),
            pull.collect((err) => {
              // prettier-ignore
              if (err) return cb(clarify(err, 'Failed to add group info when accepting an invite'))
              ssb.box2.pickGroupWriteKey(id, writeKey, (err) => {
                // prettier-ignore
                if (err) return cb(clarify(err, 'Failed to pick a write key when accepting invite to a group'))

                ssb.db.reindexEncrypted((err) => {
                  // prettier-ignore
                  if (err) cb(clarify(err, 'Failed to reindex encrypted messages when accepting an invite'))
                  else cb(null, inviteInfos[0])
                })
              })
            })
          )
        })
      )
    }

    function start(cb) {
      if (cb === undefined) return promisify(start)()

      findOrCreateAdditionsFeed((err) => {
        // prettier-ignore
        if (err) return cb(clarify(err, 'Error finding or creating additions feed when starting ssb-tribes2'))
        cb(null)
        startListeners(ssb, config, console.error)
      })
    }

    return {
      create,
      get,
      list,
      addMembers,
      excludeMembers,
      publish,
      listMembers,
      listInvites,
      acceptInvite,
      start,
    }
  },
}
