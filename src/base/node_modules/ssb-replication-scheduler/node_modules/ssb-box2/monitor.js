const pull = require('pull-stream')

function isForeignLeafFeedBranch(branch) {
  if (branch.length !== 4) return false
  if (branch[0].keys) return false // not interested in my branches
  if (branch[0].purpose !== 'root') return false
  if (branch[1].purpose !== 'v1') return false
  if (branch[2].purpose.length !== 1) return false
  return true
}

/**
 * There may have been messages I had in my database but was unable to decrypt
 * because I didn't know my root metafeed keys. Now that I know them, I should
 * reindex my database and decrypt all messages.
 *
 * Then, we should restart monitoring because we have the root and now we can
 * finally create DM keys for foreign leafs.
 */
function reindexAndRestart(ssb, encryptionFormat, drain) {
  if (drain) drain.abort()
  ssb.db.reindexEncrypted((err) => {
    if (err) console.warn(err)

    monitorForest(ssb, encryptionFormat)
  })
}

/**
 * Listen to a stream of all branches in the metafeed "forest" (collection of
 * trees) and send some information such as keys to the box2 encryptionFormat.
 *
 * Box2 encryptionFormat uses keys from the metafeed tree to encrypt messages,
 * this is why we need this information
 */
function monitorForest(ssb, encryptionFormat) {
  encryptionFormat.getRootSigningKey((_err, rootKeys) => {
    let drain = null
    pull(
      ssb.metafeeds.branchStream({ old: true, live: true }),

      // For all feeds that I own, add their keys to the box2 encryptionFormat
      pull.asyncMap((branch, cb) => {
        let foundMyRoot = false
        for (let i = 0; i < branch.length; i++) {
          const { keys, purpose } = branch[i]
          if (keys) {
            encryptionFormat.addSigningKeysSync(keys)
            if (i === 0 && purpose === 'root' && !rootKeys) {
              foundMyRoot = encryptionFormat.addSigningKeysSync(keys, 'root')
              rootKeys = keys
            }
          }
        }
        if (foundMyRoot) reindexAndRestart(ssb, encryptionFormat, drain)
        else cb(null, branch)
      }),

      // For all foreign leaf feeds, find their "mirrored" leaf feed in my tree,
      // and build DM keys.
      pull.filter(isForeignLeafFeedBranch),
      pull.asyncMap((theirLeafBranch, cb) => {
        if (!rootKeys) return cb()
        const theirRoot = theirLeafBranch[0]
        const theirLeaf = theirLeafBranch[3]
        ssb.metafeeds.getTree(rootKeys.id, (err, myRoot) => {
          if (err) return cb(err)
          const v1 = myRoot.children[0]
          if (v1.purpose !== 'v1') return cb()
          let myLeaf = null
          outer: for (const shard of v1.children) {
            for (const leaf of shard.children) {
              if (leaf.purpose === theirLeaf.purpose) {
                myLeaf = leaf
                break outer
              }
            }
          }
          if (!myLeaf) return cb()
          encryptionFormat.addDMTriangle(myRoot.id, myLeaf.id, theirLeaf.id)
          encryptionFormat.addDMTriangle(theirRoot.id, theirLeaf.id, myLeaf.id)
          if (encryptionFormat.addDMPairSync(myLeaf.keys, theirLeaf.id)) {
            ssb.db.reindexEncrypted(cb)
          } else {
            cb()
          }
        })
      }),

      (drain = pull.drain())
    )
  })
}

module.exports = monitorForest
