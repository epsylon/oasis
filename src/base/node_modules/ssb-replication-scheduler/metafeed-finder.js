// SPDX-FileCopyrightText: 2021 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const pull = require('pull-stream')
const debug = require('debug')('ssb:replication-scheduler')
const pushable = require('pull-pushable')
const detectSsbNetworkErrorSeverity = require('ssb-network-errors')
const { where, type, live, toPullStream } = require('ssb-db2/operators')
const { validateMetafeedAnnounce } = require('ssb-meta-feeds/validate')

class ReadyGate {
  constructor() {
    this.waiting = new Set()
    this.ready = false
  }

  onReady(cb) {
    if (this.ready) cb()
    else this.waiting.add(cb)
  }

  setReady() {
    this.ready = true
    for (const cb of this.waiting) cb()
    this.waiting.clear()
  }
}

module.exports = class MetafeedFinder {
  constructor(ssb, opts, batchLimit = 8, period = 500) {
    this._ssb = ssb
    this._myDebugId = ssb.id.substring(0, 5)
    this._opts = opts
    this._period = period
    this._batchLimit = batchLimit
    this._map = new Map() // mainFeedId => rootMetaFeedId
    this._inverseMap = new Map() // rootMetaFeedId => mainFeedId
    this._requestsByMainfeedId = new Map() // mainFeedId => Array<Calback>
    this._retryables = new Set() // mainFeedIds
    this._latestRequestTime = 0
    this._timer = null
    this._liveStream = pushable()
    this._onLoaded = new ReadyGate()

    // If at least one hops template is configured, then load
    if (
      this._opts.partialReplication &&
      Object.values(this._opts.partialReplication).some((templ) => !!templ)
    ) {
      if (!this._ssb.db || !this._ssb.db.query) {
        throw new Error(
          'ssb-replication-scheduler expects ssb-db2 to be installed, to use partial replication'
        )
      }
      this._loadAllFromLog()
      this._monitorConnectedPeers()
    }
  }

  fetch(mainFeedId, cb) {
    this._onLoaded.onReady(() => {
      if (this._map.has(mainFeedId)) {
        const metaFeedId = this._map.get(mainFeedId)
        cb(null, metaFeedId)
      } else if (mainFeedId === this._ssb.id) {
        this._ssb.metafeeds.findOrCreate((err, rootMF) => {
          if (err) cb(err)
          else if (!rootMF) cb(null, null)
          else {
            const metaFeedId = rootMF.id
            this._map.set(mainFeedId, metaFeedId)
            this._inverseMap.set(metaFeedId, mainFeedId)
            cb(null, metaFeedId)
          }
        })
      } else {
        this._request(mainFeedId, cb)
      }
    })
  }

  get(mainFeedId) {
    return this._map.get(mainFeedId)
  }

  getInverse(metaFeedId) {
    return this._inverseMap.get(metaFeedId)
  }

  liveStream() {
    return this._liveStream
  }

  _loadAllFromLog() {
    pull(
      this._ssb.db.query(where(type('metafeed/announce')), toPullStream()),
      pull.filter(this._validateMetafeedAnnounce),
      pull.drain(
        (msg) => {
          this._updateMapsFromMsgValue(msg.value)
        },
        () => {
          debug(
            '%s loaded Map of all known main=>rootMF from disk, total %d',
            this._myDebugId,
            this._map.size
          )
          this._onLoaded.setReady()
          this._startLiveStream()
        }
      )
    )
  }

  _startLiveStream() {
    pull(
      this._ssb.db.query(
        where(type('metafeed/announce')),
        live(),
        toPullStream()
      ),
      pull.filter(this._validateMetafeedAnnounce),
      pull.drain((msg) => {
        this._updateMapsFromMsgValue(msg.value)
        this._liveStream.push(this._pluckFromAnnounceMsg(msg.value))
      })
    )
  }

  _monitorConnectedPeers() {
    if (!this._ssb.conn) {
      console.warn(
        'No ssb-conn installed, ssb-replication-scheduler will ' +
          ' miss some useful data from connected peers regarding metafeeds'
      )
      return
    }

    pull(
      this._ssb.conn.hub().listen(),
      pull.filter((ev) => ev.type === 'connected'),
      pull.drain((ev) => {
        if (this._retryables.size > 0) {
          this._retryWithPeer(ev.details.rpc)
        }
      })
    )
  }

  _validateMetafeedAnnounce(msg) {
    const err = validateMetafeedAnnounce(msg)
    if (err) {
      console.warn(err)
      return false
    } else {
      return true
    }
  }

  _pluckFromAnnounceMsg(msgVal) {
    const mainFeedId = msgVal.author
    const metaFeedId = msgVal.content.metafeed
    return [mainFeedId, metaFeedId]
  }

  _updateMapsFromMsgValue(msgVal) {
    const [mainFeedId, metaFeedId] = this._pluckFromAnnounceMsg(msgVal)
    this._map.set(mainFeedId, metaFeedId)
    this._inverseMap.set(metaFeedId, mainFeedId)
    this._retryables.delete(mainFeedId)
  }

  _request(mainFeedId, cb) {
    const callbacks = this._requestsByMainfeedId.get(mainFeedId) || []
    callbacks.push(cb)
    this._requestsByMainfeedId.set(mainFeedId, callbacks)
    this._latestRequestTime = Date.now()
    if (this._requestsByMainfeedId.size >= this._batchLimit) {
      this._flush()
    } else {
      this._scheduleDebouncedFlush()
    }
  }

  _persist(msgVal) {
    this._ssb.db.addOOO(msgVal, (err) => {
      if (err) {
        debug(
          '%s failed to addOOO for a metafeed/announce: %s',
          this._myDebugId,
          err.message || err
        )
      }
    })
  }

  async _forEachNeighborPeer(run) {
    for (const peerId of Object.keys(this._ssb.peers)) {
      if (peerId === this._ssb.id) continue
      for (const rpc of this._ssb.peers[peerId]) {
        const goToNext = await new Promise((resolve) => run(rpc, resolve))
        if (!goToNext) return
      }
    }
  }

  _scheduleDebouncedFlush() {
    if (this._period === 0) {
      this._flush()
      return
    }
    if (this._timer) return // Timer is already enabled
    this._timer = setInterval(() => {
      // Turn off the timer if there is nothing to flush
      if (this._requestsByMainfeedId.size === 0) {
        clearInterval(this._timer)
        this._timer = null
      }
      // Flush if enough time has passed
      else if (Date.now() - this._latestRequestTime > this._period)
        this._flush()
    }, this._period * 0.5)
    if (this._timer.unref) this._timer.unref()
  }

  _makeQL1(mapOrSet) {
    const query = {
      op: 'or',
      args: [],
    }
    for (const mainFeedId of mapOrSet.keys()) {
      query.args.push({
        op: 'and',
        args: [
          { op: 'type', string: 'metafeed/announce' },
          { op: 'author', feed: mainFeedId },
        ],
      })
    }
    return query
  }

  async _flush() {
    if (this._requestsByMainfeedId.size === 0) return

    const requests = new Map(this._requestsByMainfeedId)
    this._requestsByMainfeedId.clear()

    await this._forEachNeighborPeer((rpc, goToNextNeighbor) => {
      debug(
        '%s "getSubset" for peer %s for metafeed/announce messages',
        this._myDebugId,
        rpc.id
      )
      pull(
        rpc.getSubset(this._makeQL1(requests), { querylang: 'ssb-ql-1' }),
        pull.filter((value) => this._validateMetafeedAnnounce({ value })),
        pull.drain(
          (msgVal) => {
            this._updateMapsFromMsgValue(msgVal)
            const [mainFeedId, metaFeedId] = this._pluckFromAnnounceMsg(msgVal)
            this._liveStream.push([mainFeedId, metaFeedId])
            this._persist(msgVal)

            if (requests.has(mainFeedId)) {
              const callbacks = requests.get(mainFeedId)
              requests.delete(mainFeedId)
              for (const cb of callbacks) cb(null, metaFeedId)
            }

            if (requests.size === 0) {
              goToNextNeighbor(false)
              return false // abort this drain
            }
          },
          (err) => {
            if (err && detectSsbNetworkErrorSeverity(err) >= 2) {
              debug(
                '%s failed "getSubset" muxrpc with peer %s because: %s',
                this._myDebugId,
                rpc.id,
                err.message || err
              )
            }
            goToNextNeighbor(true)
          }
        )
      )
    })

    if (requests.size > 0) {
      // We couldn't find metaFeedIds for some mainFeedIds, so we assume there
      // none. Note, this may give false negatives depending on who you're
      // connected to!
      for (const [mainFeedId, callbacks] of requests.entries()) {
        this._retryables.add(mainFeedId)
        for (const cb of callbacks) cb(null, null)
      }
      requests.clear()
    }
  }

  _retryWithPeer(rpc) {
    debug(
      '%s "getSubset" retry on peer %s for metafeed/announce messages',
      this._myDebugId,
      rpc.id
    )
    pull(
      rpc.getSubset(this._makeQL1(this._retryables), { querylang: 'ssb-ql-1' }),
      pull.filter((value) => this._validateMetafeedAnnounce({ value })),
      pull.drain(
        (msgVal) => {
          this._updateMapsFromMsgValue(msgVal)
          this._liveStream.push(this._pluckFromAnnounceMsg(msgVal))
          this._persist(msgVal)
        },
        (err) => {
          if (err && detectSsbNetworkErrorSeverity(err) >= 2) {
            debug(
              '%s failed "getSubset" muxrpc retry with peer %s because: %s',
              this._myDebugId,
              rpc.id,
              err.message || err
            )
          }
        }
      )
    )
  }
}
