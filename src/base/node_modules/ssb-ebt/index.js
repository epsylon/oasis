const path = require('path')
const pull = require('pull-stream')
const toPull = require('push-stream-to-pull-stream')
const EBT = require('epidemic-broadcast-trees')
const Store = require('key-value-file-store')
const toUrlFriendly = require('base64-url').escape
const getSeverity = require('ssb-network-errors')
const pullDefer = require('pull-defer')
const classicMethods = require('./formats/classic')

function hook(hookable, fn) {
  if (typeof hookable === 'function' && hookable.hook) {
    hookable.hook(fn)
  }
}

exports.name = 'ebt'

exports.version = '1.0.0'

exports.manifest = {
  replicate: 'duplex',
  replicateFormat: 'duplex',
  request: 'sync',
  block: 'sync',
  forget: 'sync',
  peerStatus: 'sync',
  clock: 'async',
}

exports.permissions = {
  anonymous: {
    allow: ['replicate', 'replicateFormat', 'clock'],
  },
}

// there was a bug that caused some peers
// to request things that weren't feeds.
// this is fixed, so just ignore anything that isn't a feed.
function cleanClock(clock, isFeed) {
  for (const k in clock) {
    if (!isFeed(k)) {
      delete clock[k]
    }
  }
}

function isMuxrpcMissingError(err, methodName) {
  const jsErrorMessage =
    'method:ebt,' + methodName + ' is not in list of allowed methods'
  const goErrorMessage = 'muxrpc: no such command: ebt.' + methodName
  return err.message === jsErrorMessage || err.message === goErrorMessage
}

function isReconnectedError(err) {
  return err.message === 'reconnected to peer'
}

exports.init = function (sbot, config) {
  const ebts = []
  registerFormat(classicMethods)

  function registerFormat(format) {
    if (!format.name) throw new Error('format must have a name')

    const dirName = 'ebt' + (format.name === 'classic' ? '' : format.name)
    const dir = config.path ? path.join(config.path, dirName) : null
    const store = Store(dir, null, toUrlFriendly)

    // EBT expects a function of only feedId so we bind sbot here
    const { isMsg, getMsgAuthor, getMsgSequence, isFeed } = format

    const ebt = EBT({
      logging: config.ebt && config.ebt.logging,
      id: sbot.id,
      getClock(id, cb) {
        store.ensure(id, function () {
          const clock = store.get(id) || {}
          cleanClock(clock, isFeed)
          cb(null, clock)
        })
      },
      setClock(id, clock) {
        cleanClock(clock, isFeed)
        store.set(id, clock)
      },
      getAt(pair, cb) {
        format.getAtSequence(sbot, pair, cb)
      },
      append(msgVal, cb) {
        format.appendMsg(sbot, msgVal, cb)
      },

      isFeed,
      isMsg,
      getMsgAuthor,
      getMsgSequence,
    })

    // attach a few methods we need in this module
    ebt.isFeed = isFeed
    ebt.name = format.name
    ebt.clearClock = store.delete.bind(store)

    const existingId = ebts.findIndex((e) => e.name === format.name)
    if (existingId !== -1) ebts[existingId] = ebt
    else ebts.push(ebt)
  }

  function getEBT(formatName) {
    const ebt = ebts.find((ebt) => ebt.name === formatName)
    if (!ebt) throw new Error('Unknown format: ' + formatName)

    return ebt
  }

  let isReady = false
  let waiting = []
  function onReady(fn) {
    if (isReady) fn()
    else waiting.push(fn)
  }

  sbot.getVectorClock((err, clock) => {
    if (err) console.warn('Failed to getVectorClock in ssb-ebt because:', err)

    ebts.forEach((ebt) => {
      const validClock = {}
      for (const k in clock) {
        if (ebt.isFeed(k)) {
          validClock[k] = clock[k]
        }
      }

      ebt.state.clock = validClock
      ebt.update()
    })

    isReady = true
    for (let i = 0; i < waiting.length; ++i) waiting[i]()
    waiting = []
  })

  if (sbot.db) {
    sbot.db.onMsgAdded((data) => {
      onReady(() => {
        ebts.forEach((ebt) => {
          if (ebt.name === data.feedFormat) ebt.onAppend(data.nativeMsg)
        })
      })
    })
  } else {
    sbot.post((msg) => {
      onReady(() => {
        ebts.forEach((ebt) => {
          if (ebt.isFeed(msg.value.author)) ebt.onAppend(msg.value)
        })
      })
    })
  }

  // TODO: remove this when no one uses ssb-db anymore, because
  // sbot.progress is defined in ssb-db but not in ssb-db2
  if (sbot.progress) {
    hook(sbot.progress, function (fn) {
      const _progress = fn()
      const ebt = ebts.find((ebt) => ebt.name === 'classic')
      const ebtProg = ebt.progress()
      if (ebtProg.target) _progress.ebt = ebtProg
      return _progress
    })
  }

  sbot.on('rpc:connect', function (rpc, isClient) {
    if (rpc.id === sbot.id) return // ssb-client connecting to ssb-server
    if (isClient) {
      onReady(() => {
        ebts.forEach((ebt) => {
          const format = ebt.name
          const opts = { version: 3, format }
          const local = toPull.duplex(
            ebt.createStream(rpc.id, opts.version, true)
          )

          // for backwards compatibility we always replicate classic
          // feeds using existing replicate RPC
          const methodName =
            format === 'classic' ? 'replicate' : 'replicateFormat'

          const remote = rpc.ebt[methodName](opts, (networkError) => {
            if (networkError && getSeverity(networkError) >= 3) {
              if (isMuxrpcMissingError(networkError, methodName)) {
                console.warn(
                  `peer ${rpc.id} does not support RPC ebt.${methodName}`
                )
              } else if (isReconnectedError(networkError)) {
                // Do nothing, this is a harmless error
              } else {
                console.error('rpc.ebt.replicate exception:', networkError)
              }
            }
          })
          pull(local, remote, local)
        })
      })
    }
  })

  function findEBTForFeed(feedId, formatName) {
    let ebt
    if (formatName) {
      ebt = ebts.find((ebt) => ebt.name === formatName)
    } else {
      ebt = ebts.find((ebt) => ebt.isFeed(feedId))
    }

    if (!ebt) {
      ebt = ebts.find((ebt) => ebt.name === 'classic')
    }

    return ebt
  }

  function request(destFeedId, requesting, formatName) {
    onReady(() => {
      if (requesting) {
        const ebt = findEBTForFeed(destFeedId, formatName)
        if (!ebt.isFeed(destFeedId)) return
        ebt.request(destFeedId, true)
      } else {
        // If we don't want a destFeedId, make sure it's not registered anywhere
        ebts.forEach((ebt) => {
          ebt.request(destFeedId, false)
        })
      }
    })
  }

  function forget(destFeedId) {
    onReady(() => {
      for (const ebt of ebts) {
        ebt.request(destFeedId, false)
        ebt.clearClock(destFeedId)
        delete ebt.state.clock[destFeedId]
      }
    })
  }

  function block(origFeedId, destFeedId, blocking, formatName) {
    onReady(() => {
      const ebt = findEBTForFeed(origFeedId, formatName)
      if (!ebt.isFeed(origFeedId)) return
      if (!ebt.isFeed(destFeedId)) return

      if (blocking) {
        ebt.block(origFeedId, destFeedId, true)
      } else if (
        ebt.state.blocks[origFeedId] &&
        ebt.state.blocks[origFeedId][destFeedId]
      ) {
        // only update unblock if they were already blocked
        ebt.block(origFeedId, destFeedId, false)
      }
    })
  }

  function replicateFormat(opts) {
    if (opts.version !== 3) {
      throw new Error('expected ebt.replicate({version: 3})')
    }

    const formatName = opts.format || 'classic'
    const ebt = getEBT(formatName)

    const deferred = pullDefer.duplex()
    onReady(() => {
      // `this` refers to the remote peer who called this muxrpc API
      deferred.resolve(
        toPull.duplex(ebt.createStream(this.id, opts.version, false))
      )
    })
    return deferred
  }

  // get replication status for feeds for this id
  function peerStatus(id) {
    id = id || sbot.id

    const ebt = findEBTForFeed(id)

    const data = {
      id: id,
      seq: ebt.state.clock[id],
      peers: {},
    }

    for (const k in ebt.state.peers) {
      const peer = ebt.state.peers[k]
      if (
        peer.clock[id] != null ||
        (peer.replicating && peer.replicating[id] != null)
      ) {
        const rep = peer.replicating && peer.replicating[id]
        data.peers[k] = {
          seq: peer.clock[id],
          replicating: rep,
        }
      }
    }

    return data
  }

  function clock(opts, cb) {
    if (!cb) {
      cb = opts
      opts = { format: 'classic' }
    }

    onReady(() => {
      const ebt = getEBT(opts.format)
      cb(null, ebt.state.clock)
    })
  }

  function setClockForSlicedReplication(feedId, sequence, formatName) {
    onReady(() => {
      const ebt = findEBTForFeed(feedId, formatName)

      ebt.state.clock[feedId] = sequence
    })
  }

  return {
    request,
    block,
    forget,
    replicate: replicateFormat,
    replicateFormat,
    peerStatus,
    clock,
    setClockForSlicedReplication,
    registerFormat,
  }
}
