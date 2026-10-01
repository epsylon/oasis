// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const { promisify } = require('util')
const BFE = require('ssb-bfe')
const Ref = require('ssb-ref')
const Uri = require('ssb-uri2')
const path = require('path')
const os = require('os')
const { box, unbox } = require('envelope-js')
const { SecretKey, DHKeys, poBoxKey } = require('ssb-private-group-keys')
const { keySchemes } = require('private-group-spec')
const Keyring = require('ssb-keyring')
const { ReadyGate } = require('./utils')
const pull = require('pull-stream')
const pullDefer = require('pull-defer')

function reportError(err) {
  if (err) console.error(err)
}

const ATTEMPT1 = { maxAttempts: 1 }
const ATTEMPT16 = { maxAttempts: 16 }

function makeEncryptionFormat() {
  let keyring = null
  const keyringReady = new ReadyGate()
  let legacyMode = true
  let mainKeys = null

  function setup(config, cb) {
    const keyringPath = path.join(
      config.path || path.join(os.tmpdir(), '.ssb-keyring-' + Date.now()),
      (config.box2 && config.box2.path) || 'keyring'
    )
    Keyring(keyringPath, (err, api) => {
      if (err) return cb(err)
      keyring = api
      mainKeys = config.keys
      keyringReady.setReady()
      cb()
    })
  }

  function teardown(cb) {
    keyringReady.onReady(() => {
      keyring.close(cb)
    })
  }

  function disableLegacyMode() {
    legacyMode = false
  }

  function isRawGroupKey(recp) {
    return (
      recp &&
      recp.scheme === keySchemes.private_group &&
      Buffer.isBuffer(recp.key)
    )
  }

  function isGroupId(id) {
    return Ref.isCloakedMsgId(id) || Uri.isIdentityGroupSSBURI(id)
  }

  function isPoBoxId(id) {
    return Uri.isIdentityPOBoxSSBURI(id)
  }

  function isFeed(recp) {
    return (
      Ref.isFeed(recp) ||
      Uri.isClassicFeedSSBURI(recp) ||
      Uri.isBendyButtV1FeedSSBURI(recp) ||
      Uri.isButtwooV1FeedSSBURI(recp)
    )
  }

  function setOwnDMKey(key) {
    keyringReady.onReady(() => {
      keyring.self.set({ key }, reportError)
    })
  }

  function getOwnDMKey(cb) {
    keyringReady.onReady(() => {
      cb(null, keyring.self.get())
    })
  }

  function addDMPairSync(myKeys, theirId) {
    if (!keyringReady.ready) throw new Error('keyring not ready')
    const myId = myKeys.id
    const myDhKeys = new DHKeys(myKeys, { fromEd25519: true })
    const theirKeys = { public: BFE.encode(theirId).slice(2) }
    const theirDhKeys = new DHKeys(theirKeys, { fromEd25519: true })
    return keyring.dm.add(myId, theirId, myDhKeys, theirDhKeys, reportError)
  }

  function addDMTriangle(xRootId, xLeafId, yLeafId) {
    keyringReady.onReady(() => {
      keyring.dm.addTriangle(xRootId, xLeafId, yLeafId, reportError)
    })
  }

  function canDM(myLeafId, theirRootId, cb) {
    keyringReady.onReady(() => {
      const theirLeafId = keyring.dm.triangulate(theirRootId, myLeafId)
      cb(null, !!theirLeafId)
    })
  }

  function addSigningKeys(keys, name) {
    keyringReady.onReady(() => {
      addSigningKeysSync(keys, name)
    })
  }

  function addSigningKeysSync(keys, name) {
    if (!keyringReady.ready) throw new Error('keyring not ready')
    if (name) return keyring.signing.addNamed(name, keys)
    else return keyring.signing.add(keys)
  }

  function getRootSigningKey(cb) {
    keyringReady.onReady(() => {
      cb(null, keyring.signing.get('root'))
    })
  }

  function addGroupInfo(id, info, cb) {
    if (cb === undefined) return promisify(addGroupInfo)(id, info)

    keyringReady.onReady(() => {
      keyring.group.add(id, info, cb)
    })
  }

  function pickGroupWriteKey(id, pickedKey, cb) {
    if (cb === undefined) return promisify(pickGroupWriteKey)(id, pickedKey)

    keyringReady.onReady(() => {
      keyring.group.pickWriteKey(id, pickedKey, cb)
    })
  }

  function excludeGroupInfo(id, cb) {
    if (cb === undefined) return promisify(excludeGroupInfo)(id)

    if (!id) cb(new Error('Group id required'))

    keyringReady.onReady(() => {
      keyring.group.exclude(id, cb)
    })
  }

  function listGroupIds(opts = {}) {
    const deferredSource = pullDefer.source()

    keyringReady.onReady(() => {
      const source = keyring.group.list({
        live: !!opts.live,
        excluded: !!opts.excluded,
      })

      deferredSource.resolve(source)
    })

    return deferredSource
  }

  function getGroupInfo(groupId, cb) {
    if (cb === undefined) return promisify(getGroupInfo)(groupId)

    if (!groupId) cb(new Error('Group id required'))

    keyringReady.onReady(() => {
      cb(null, keyring.group.get(groupId))
    })
  }

  function getGroupInfoUpdates(groupId) {
    if (!groupId) return pull.error(new Error('Group id required'))

    const deferredSource = pullDefer.source()

    keyringReady.onReady(() => {
      const source = keyring.group.getUpdates(groupId)

      deferredSource.resolve(source)
    })

    return deferredSource
  }

  function addPoBox(poBoxId, info, cb) {
    if (cb === undefined) return promisify(addPoBox)(poBoxId, info)

    if (!poBoxId) cb(new Error('pobox id required'))
    if (!info) cb(new Error('pobox info required'))

    keyringReady.onReady(() => {
      keyring.poBox.add(poBoxId, info, cb)
    })
  }

  function hasPoBox(poBoxId, cb) {
    if (cb === undefined) return promisify(hasPoBox)(poBoxId)

    if (!poBoxId) cb(new Error('pobox id required'))

    keyringReady.onReady(() => {
      cb(null, keyring.poBox.has(poBoxId))
    })
  }

  function getPoBox(poBoxId, cb) {
    if (cb === undefined) return promisify(getPoBox)(poBoxId)

    if (!poBoxId) cb(new Error('pobox id required'))

    keyringReady.onReady(() => {
      cb(null, keyring.poBox.get(poBoxId))
    })
  }

  function listPoBoxIds() {
    const deferredSource = pullDefer.source()

    keyringReady.onReady(() => {
      const source = pull.values(keyring.poBox.list())

      deferredSource.resolve(source)
    })

    return deferredSource
  }

  function dmEncryptionKey(authorKeys, recp) {
    if (legacyMode) {
      if (!keyring.dm.has(authorKeys.id, recp)) addDMPairSync(authorKeys, recp)
      const dmKey = keyring.dm.get(authorKeys.id, recp)
      if (!dmKey) {
        throw new Error('DM keys not supported for recipient ' + recp)
      }
      dmKey.scheme = keySchemes.feed_id_dm
      return dmKey
    } else {
      const theirRootId = recp
      const myLeafId = authorKeys.id
      const theirLeafId = keyring.dm.triangulate(theirRootId, myLeafId)
      if (!theirLeafId || typeof theirLeafId !== 'string') {
        throw new Error('DM encryption failed to triangulate ' + theirRootId)
      }
      const dmKeys = keyring.dm.get(myLeafId, theirLeafId)
      if (!dmKeys) {
        throw new Error(
          'DM encryption failed to find DH keys for mirrored leaf feed ' +
            theirLeafId
        )
      }
      return dmKeys
    }
  }

  function encrypt(plaintextBuf, opts) {
    const recps = opts.recps
    const authorId = opts.keys.id
    const previousId = opts.previous
    const easyPoBoxKey = poBoxKey.easy(opts.keys)

    const encryptionKeys = recps.map((recp) => {
      if (isRawGroupKey(recp)) {
        return recp
      } else if (recp === authorId || keyring.signing.has(recp)) {
        return keyring.self.get()
      } else if (isFeed(recp)) {
        return dmEncryptionKey(opts.keys, recp)
      } else if (isGroupId(recp) && keyring.group.has(recp)) {
        return keyring.group.get(recp).writeKey
      } else if (isPoBoxId(recp)) {
        return easyPoBoxKey(recp)
      } else throw new Error('Unsupported recipient: ' + recp)
    })

    const validCount = encryptionKeys.length
    if (validCount === 0) {
      throw new Error(`no box2 keys found for recipients: ${recps}`)
    }
    if (validCount > 16) {
      // prettier-ignore
      throw new Error(`private-group spec allows maximum 16 slots, but you've tried to use ${validCount}`)
    }

    const validGroupCount = encryptionKeys.filter(
      (encryptKeys) => encryptKeys.scheme === keySchemes.private_group
    ).length
    if (validGroupCount > 1) {
      // prettier-ignore
      throw new Error(`private-group spec only supports one group recipient, but you've tried to use ${validGroupCount}`)
    }

    const msgSymmKey = new SecretKey().toBuffer()
    const authorIdBFE = BFE.encode(authorId)
    const previousMsgIdBFE = BFE.encode(previousId)

    const ciphertextBuf = box(
      plaintextBuf,
      authorIdBFE,
      previousMsgIdBFE,
      msgSymmKey,
      encryptionKeys
    )

    return ciphertextBuf
  }

  function selfDecryptionKeys(authorId) {
    const selfKeys = keyring.self.get()
    if (keyring.signing.has(authorId)) return [selfKeys]
    else if (legacyMode && authorId === mainKeys.id) return [selfKeys]
    else return []
  }

  function dmDecryptionKeys(authorId) {
    if (legacyMode) {
      const dmKeys = keyring.dm.get(mainKeys.id, authorId)
      if (!dmKeys) addDMPairSync(mainKeys, authorId)
      if (!keyring.dm.has(mainKeys.id, authorId)) return []
      const dmKey = keyring.dm.get(mainKeys.id, authorId)
      dmKey.scheme = keySchemes.feed_id_dm
      return [dmKey]
    } else {
      const myRootKeys = keyring.signing.get('root')
      if (!myRootKeys) return []
      const myLeafId = keyring.dm.triangulate(myRootKeys.id, authorId)
      if (!myLeafId) return []
      if (!keyring.dm.has(myLeafId, authorId)) return []
      return [keyring.dm.get(myLeafId, authorId)]
    }
  }

  function poBoxDecryptionKey(authorId, authorIdBFE, poBoxId) {
    // TODO - consider how to reduce redundent computation + memory use here
    const data = keyring.poBox.get(poBoxId)

    const poBox_dh_secret = Buffer.concat([
      BFE.toTF('encryption-key', 'box2-pobox-dh'),
      data.key,
    ])

    const poBox_id = BFE.encode(poBoxId)
    const poBox_dh_public = Buffer.concat([
      BFE.toTF('encryption-key', 'box2-pobox-dh'),
      poBox_id.slice(2),
    ])

    const author_dh_public = new DHKeys(
      { public: authorId },
      { fromEd25519: true }
    ).toBFE().public

    return poBoxKey(
      poBox_dh_secret,
      poBox_dh_public,
      poBox_id,
      author_dh_public,
      authorIdBFE
    )
  }

  function decrypt(ciphertextBuf, opts) {
    const authorId = opts.author
    const authorBFE = BFE.encode(authorId)
    const previousBFE = BFE.encode(opts.previous)

    const unboxWith = unbox.bind(null, ciphertextBuf, authorBFE, previousBFE)

    let plaintextBuf = null

    const groups = keyring.group.listSync()
    const excludedGroups = keyring.group.listSync({ excluded: true })
    const groupKeys = [...groups, ...excludedGroups]
      .map(keyring.group.get)
      .map((groupInfo) => groupInfo.readKeys)
      .flat()
    if ((plaintextBuf = unboxWith(groupKeys, ATTEMPT1))) return plaintextBuf

    const selfKey = selfDecryptionKeys(authorId)
    if ((plaintextBuf = unboxWith(selfKey, ATTEMPT16))) return plaintextBuf

    const dmKey = dmDecryptionKeys(authorId)
    if ((plaintextBuf = unboxWith(dmKey, ATTEMPT16))) return plaintextBuf

    const poBoxKeys = keyring.poBox
      .list()
      .map((poBoxId) => poBoxDecryptionKey(authorId, authorBFE, poBoxId))
    if ((plaintextBuf = unboxWith(poBoxKeys, ATTEMPT16))) return plaintextBuf

    return null
  }

  return {
    // ssb-encryption-format API:
    name: 'box2',
    setup,
    teardown,
    encrypt,
    decrypt,
    // ssb-box2 specific APIs:
    setOwnDMKey,
    getOwnDMKey,
    addGroupInfo,
    pickGroupWriteKey,
    excludeGroupInfo,
    listGroupIds,
    getGroupInfo,
    getGroupInfoUpdates,
    canDM,
    addPoBox,
    hasPoBox,
    getPoBox,
    listPoBoxIds,
    // Internal APIs:
    addSigningKeys,
    addSigningKeysSync,
    addDMPairSync,
    addDMTriangle,
    getRootSigningKey,
    disableLegacyMode,
  }
}

module.exports = makeEncryptionFormat
