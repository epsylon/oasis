// SPDX-FileCopyrightText: 2021 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const pull = require('pull-stream')
const cat = require('pull-cat')
const debug = require('debug')('ssb:replication-scheduler')
const bendyButtEBTFormat = require('ssb-ebt/formats/bendy-butt')
const indexedEBTFormat = require('ssb-ebt/formats/indexed')
const Template = require('./template')
const MetafeedFinder = require('./metafeed-finder')

const DEFAULT_PERIOD = 150 // ms
const BATCH_LIMIT = 8

module.exports = class RequestManager {
  constructor(ssb, opts) {
    this._ssb = ssb
    this._myDebugId = ssb.id.substring(0, 5)
    this._opts = opts
    this._metafeedFinder = new MetafeedFinder(ssb, opts, BATCH_LIMIT)
    this._period =
      // debouncePeriod basically controls how often will we trigger
      // ssb.ebt.request() calls. We trigger those when the
      // requestManager.add() has "calmed down", i.e. after debouncePeriod
      // milliseconds have passed in which add() was not called.
      typeof opts.debouncePeriod === 'number'
        ? opts.debouncePeriod
        : DEFAULT_PERIOD
    this._hopsCache = new Map() // mainFeedId => hops
    this._groupMembers = new Set() // rootFeedIds
    this._requestableMains = new Set() // mainFeedIds
    this._requestableRoots = new Set() // rootFeedIds
    this._requested = new Set() // feedIds
    this._requestedInGroupBranch = new Set() // feedIds
    this._unrequested = new Set() // feedIds
    this._blocked = new Set() // feedIds
    this._tombstoned = new Set() // feedIds
    this._flushing = false
    this._wantsMoreFlushing = false
    this._latestAdd = 0
    this._timer = null
    this._oldBranchDrainer = null
    this._liveBranchDrainer = null
    this._tombstonedBranchDrainer = null
    this._liveFinderDrainer = null
    this._hasCloseHook = false
    this._templates = this._setupTemplates(this._opts.partialReplication)
    this._myGroupSecrets = new Set() // base64 encoded

    // If at least one hops template is configured, then setup ssb-ebt
    if (this._templates) {
      this._ssb.ebt.registerFormat(bendyButtEBTFormat)
      if (this._someTemplate((t) => t.hasIndexLeaf())) {
        this._ssb.ebt.registerFormat(indexedEBTFormat)
      }
    }
  }

  add(mainFeedId, hops) {
    this._hopsCache.set(mainFeedId, hops)

    if (!this._requestableMains.has(mainFeedId)) {
      this._requestableMains.add(mainFeedId)
      this._latestAdd = Date.now()
      this._scheduleDebouncedFlush()
    }
  }

  addGroupMember(rootFeedId, groupSecret) {
    this._myGroupSecrets.add(groupSecret.toString('base64'))
    this._groupMembers.add(rootFeedId)

    if (!this._requestableRoots.has(rootFeedId)) {
      this._requestableRoots.add(rootFeedId)
      this._latestAdd = Date.now()
      this._scheduleDebouncedFlush()
    }
  }

  reconfigure(opts) {
    this._opts = { ...this._opts, ...opts }
    this._period =
      typeof opts.debouncePeriod === 'number'
        ? opts.debouncePeriod
        : this._period
    this._templates = this._setupTemplates(this._opts.partialReplication)
    for (const feedId of this._requested) {
      this._requested.delete(feedId)
      if (this._hopsCache.has(feedId)) this._requestableMains.add(feedId)
      if (this._groupMembers.has(feedId)) this._requestableRoots.add(feedId)
    }
    // Refresh only the old branches stream drainer, not the live streams
    if (this._oldBranchDrainer) this._oldBranchDrainer.abort()
    this._oldBranchDrainer = null
    this._flush()
  }

  _setupTemplates(optsPartialReplication) {
    if (!optsPartialReplication) return null
    if (Object.values(optsPartialReplication).every((t) => !t)) return null
    const hopsArr = Object.keys(optsPartialReplication)
      .map(Number)
      .filter((x) => x >= 0)
    const templates = new Map()
    for (const hops of hopsArr) {
      if (Array.isArray(optsPartialReplication[hops])) {
        templates.set(hops, new Template(optsPartialReplication[hops]))
      } else {
        templates.set(hops, null)
      }
    }
    if (optsPartialReplication.group) {
      templates.set('group', new Template(optsPartialReplication.group))
    }
    return templates
  }

  _someTemplate(fn) {
    if (!this._templates) return false
    return [...this._templates.values()].filter((t) => !!t).some(fn)
  }

  _interpretHops(hops) {
    if (hops === -1) return 'block'
    else if (hops < -1) return 'unrequest'
    else if (hops >= 0) return 'request'
    else return null
  }

  /**
   * @param {number | "group"} category hops or groups
   */
  _findTemplateForCategory(category) {
    if (category == null) return null
    if (!this._templates) return null
    if (category === 'group') return this._templates.get('group')
    const hops = category
    const templateKeys = [...this._templates.keys()].filter(
      (key) => typeof key === 'number'
    )
    const eligibleHopsArr = templateKeys.filter((h) => h >= hops)
    const pickedHops =
      eligibleHopsArr.length > 0
        ? Math.min(...eligibleHopsArr)
        : Math.max(...templateKeys)
    return this._templates.get(pickedHops)
  }

  _setupCloseHook() {
    this._hasCloseHook = true
    const that = this
    this._ssb.close.hook(function (fn, args) {
      if (that._oldBranchDrainer) that._oldBranchDrainer.abort()
      if (that._liveBranchDrainer) that._liveBranchDrainer.abort()
      if (that._tombstonedBranchDrainer) that._tombstonedBranchDrainer.abort()
      if (that._liveFinderDrainer) that._liveFinderDrainer.abort()
      fn.apply(this, args)
    })
  }

  _setupStreamDrainers() {
    if (!this._hasCloseHook) this._setupCloseHook()

    if (!this._oldBranchDrainer) {
      const opts = { tombstoned: false, old: true, live: false }
      pull(
        this._ssb.metafeeds.branchStream(opts),
        pull.filter((branch) => this._isValidBranch(branch)),
        (this._oldBranchDrainer = pull.drain((branch) => {
          this._handleBranch(branch)
        }))
      )
    }

    if (!this._liveBranchDrainer) {
      const opts = { tombstoned: false, old: false, live: true }
      pull(
        this._ssb.metafeeds.branchStream(opts),
        pull.filter((branch) => this._isValidBranch(branch)),
        (this._liveBranchDrainer = pull.drain((branch) => {
          this._handleBranch(branch)
        }))
      )
    }

    if (!this._tombstonedBranchDrainer) {
      const opts = { tombstoned: true, old: true, live: true }
      pull(
        this._ssb.metafeeds.branchStream(opts),
        pull.filter((branch) => this._isValidBranch(branch)),
        (this._tombstonedBranchDrainer = pull.drain((branch) => {
          const leaf = branch[branch.length - 1]
          this._tombstone(leaf.id, true)
        }))
      )
    }

    // Automatically switch to partial replication if (while replicating fully)
    // we bump into a metafeed/announce msg
    if (!this._liveFinderDrainer) {
      pull(
        this._metafeedFinder.liveStream(),
        (this._liveFinderDrainer = pull.drain(([mainFeedId, metaFeedId]) => {
          if (
            this._requested.has(mainFeedId) &&
            !this._requested.has(metaFeedId)
          ) {
            debug(
              '%s switch from full replication to partial replication for %s',
              this._myDebugId,
              mainFeedId
            )
            this._unrequest(mainFeedId)
            this._requestTreeFromMain(mainFeedId)
          }
        }))
      )
    }
  }

  /**
   * @param {number | "group"} category hops or groups
   */
  _matchBranchWith(category, branch, mainFeedId = null) {
    const template = this._findTemplateForCategory(category)
    if (!template) return
    return template.matchBranch(branch, mainFeedId, this._myGroupSecrets)
  }

  _isGroupMemberBranch(branch) {
    const root = branch[0]
    return (
      this._groupMembers.has(root.id) && this._matchBranchWith('group', branch)
    )
  }

  /**
   * Validation according to metafeeds tree structure v1
   */
  _isValidBranch(branch) {
    if (!Array.isArray(branch)) return false
    if (branch.length <= 0 || branch.length > 4) return false
    const [root, v1, shard] = branch
    if (root.purpose !== 'root') return false
    if (branch.length === 1) return true
    if (v1.purpose !== 'v1') return false
    if (branch.length === 2) return true
    if (shard.purpose.length !== 1) return false
    return true
  }

  _handleBranch(branch) {
    const root = branch[0]
    const mainFeedId = this._metafeedFinder.getInverse(root.id)
    const hops = mainFeedId ? this._hopsCache.get(mainFeedId) : null
    const hopsCase = typeof hops === 'number' ? this._interpretHops(hops) : null
    debug(
      '%s handle branch case=%s %s=>%s',
      this._myDebugId,
      hopsCase || '?',
      mainFeedId ? mainFeedId.substring(0, 5) : '?',
      branch.map((feed) => feed.purpose).join('/')
    )

    if (this._isGroupMemberBranch(branch)) {
      for (const feed of branch) this._requestedInGroupBranch.add(feed.id)
      this._requestBranch(branch)
      return
    }

    if (mainFeedId && hopsCase) {
      switch (hopsCase) {
        case 'request':
          if (this._matchBranchWith(hops, branch, mainFeedId)) {
            this._requestBranch(branch)
          }
          break
        case 'unrequest':
          this._unrequestBranch(branch)
          break
        case 'block':
          this._blockBranch(branch)
          break
      }
    }
  }

  _requestBranch(branch) {
    for (const feed of branch) this._request(feed.id)
  }

  _unrequestBranch(branch) {
    for (const feed of branch) {
      if (!this._requestedInGroupBranch.has(feed.id)) {
        this._unrequest(feed.id)
      }
    }
  }

  _blockBranch(branch) {
    for (const feed of branch) {
      if (!this._requestedInGroupBranch.has(feed.id)) {
        this._block(feed.id)
      }
    }
  }

  _fetchAndRequestMetafeed(mainFeedId) {
    this._metafeedFinder.fetch(mainFeedId, (err, metafeedId) => {
      if (err) {
        console.error(err)
      } else if (!metafeedId) {
        console.error('cannot partially replicate ' + mainFeedId)
      } else {
        this._request(metafeedId)
      }
    })
  }

  _requestTreeFromMain(mainFeedId) {
    debug('%s will process metafeed tree for %s', this._myDebugId, mainFeedId)

    // We may already have the meta feed, so continue replicating
    const root = this._metafeedFinder.get(mainFeedId)
    if (root) {
      let branchesFound = false
      const opts = { root, tombstoned: false, old: true, live: false }
      pull(
        this._ssb.metafeeds.branchStream(opts),
        pull.filter((branch) => this._isValidBranch(branch)),
        pull.drain(
          (branch) => {
            branchesFound = true
            this._handleBranch(branch)
          },
          () => {
            if (branchesFound === false) {
              this._fetchAndRequestMetafeed(mainFeedId)
            }
          }
        )
      )
    }
    // Fetch metafeedId for this (main) feedId for the first time
    else {
      this._fetchAndRequestMetafeed(mainFeedId)
    }
  }

  _requestTreeFromRoot(rootFeedId) {
    debug('%s will process metafeed tree under %s', this._myDebugId, rootFeedId)

    this._request(rootFeedId)
    const opts = { root: rootFeedId, tombstoned: false, old: true, live: false }
    pull(
      this._ssb.metafeeds.branchStream(opts),
      pull.filter((branch) => this._isValidBranch(branch)),
      pull.drain((branch) => {
        this._handleBranch(branch)
      })
    )
  }

  _processTreeByHops(mainFeedId) {
    const hops = this._hopsCache.get(mainFeedId)
    const hopsCase = this._interpretHops(hops)
    if (hopsCase === 'request') {
      this._requestTreeFromMain(mainFeedId)
      return
    }

    const root = this._metafeedFinder.get(mainFeedId)
    if (!root) return
    pull(
      this._ssb.metafeeds.branchStream({ root, old: true, live: false }),
      pull.filter((branch) => this._isValidBranch(branch)),
      pull.drain((branch) => {
        if (this._isGroupMemberBranch(branch)) this._requestBranch(branch)
        else if (hopsCase === 'block') this._blockBranch(branch)
        else if (hopsCase === 'unrequest') this._unrequestBranch(branch)
      })
    )
  }

  _processMainByHops(mainFeedId) {
    const hops = this._hopsCache.get(mainFeedId)
    switch (this._interpretHops(hops)) {
      case 'request':
        this._request(mainFeedId)
        break
      case 'unrequest':
        this._unrequest(mainFeedId)
        break
      case 'block':
        this._block(mainFeedId)
        break
    }
  }

  _request(feedId) {
    if (this._requested.has(feedId)) return
    debug('%s will replicate %s', this._myDebugId, feedId)

    this._unrequested.delete(feedId)
    this._blocked.delete(feedId)
    this._requested.add(feedId)
    this._ssb.ebt.block(this._ssb.id, feedId, false)
    this._ssb.ebt.request(feedId, true)
  }

  _unrequest(feedId) {
    if (this._unrequested.has(feedId)) return
    debug('%s will stop replicating %s', this._myDebugId, feedId)

    this._requested.delete(feedId)
    this._blocked.delete(feedId)
    this._unrequested.add(feedId)
    this._ssb.ebt.request(feedId, false)
    this._ssb.ebt.block(this._ssb.id, feedId, false)
  }

  _block(feedId) {
    if (this._blocked.has(feedId)) return
    debug('%s will block replication of %s', this._myDebugId, feedId)

    this._requested.delete(feedId)
    this._unrequested.delete(feedId)
    this._blocked.add(feedId)
    this._ssb.ebt.request(feedId, false)
    this._ssb.ebt.block(this._ssb.id, feedId, true)
  }

  _tombstone(feedId, shouldWeave = false) {
    if (this._tombstoned.has(feedId)) return
    debug('%s will stop replicating tombstoned %s', this._myDebugId, feedId)

    this._requested.delete(feedId)
    this._blocked.delete(feedId)
    this._tombstoned.add(feedId)
    this._ssb.ebt.request(feedId, false)

    // Weave through all of the subfeeds and tombstone them too
    if (shouldWeave) {
      const opts = { root: feedId, tombstoned: null, old: true, live: false }
      pull(
        this._ssb.metafeeds.branchStream(opts),
        pull.filter((branch) => this._isValidBranch(branch)),
        pull.drain((branch) => {
          const leaf = branch[branch.length - 1]
          this._tombstone(leaf.id, false)
        })
      )
    }
  }

  _supportsMetafeedTree(mainFeedId, cb) {
    this._metafeedFinder.fetch(mainFeedId, (err, metafeedId) => {
      if (err) cb(err)
      else cb(null, !!metafeedId)
    })
  }

  _scheduleDebouncedFlush() {
    if (this._flushing) {
      this._wantsMoreFlushing = true
      return
    }
    this._wantsMoreFlushing = false

    if (this._period === 0) {
      this._flush()
      return
    }

    if (this._timer) return // Timer is already enabled
    this._timer = setInterval(() => {
      // Turn off the timer if there is nothing to flush
      if (
        this._requestableMains.size === 0 &&
        this._requestableRoots.size === 0
      ) {
        clearInterval(this._timer)
        this._timer = null
      }
      // Flush if enough time has passed
      else if (Date.now() - this._latestAdd > this._period) {
        clearInterval(this._timer)
        this._timer = null
        this._flush()
      }
    }, this._period * 0.5)
    if (this._timer.unref) this._timer.unref()
  }

  _flush() {
    this._flushing = true

    const mainFlushables = pull(
      pull.values([...this._requestableMains.values()]),
      pull.asyncMap((mainFeedId, cb) => {
        if (!this._templates) return cb(null, [mainFeedId, false])
        const hops = this._hopsCache.get(mainFeedId)
        const template = this._findTemplateForCategory(hops)
        if (!template && hops >= 0) return cb(null, [mainFeedId, false])

        this._supportsMetafeedTree(mainFeedId, (err, supports) => {
          if (err) cb(err)
          else cb(null, [mainFeedId, supports])
        })
      }),
      pull.map(([mainFeedId, supportsMetafeedTree]) => {
        this._requestableMains.delete(mainFeedId)
        if (supportsMetafeedTree) {
          this._processTreeByHops(mainFeedId)
        } else {
          this._processMainByHops(mainFeedId)
        }
        return null
      })
    )

    const rootFlushables =
      this._templates && this._templates.has('group')
        ? pull(
            pull.values([...this._requestableRoots.values()]),
            pull.map((rootFeedId) => {
              this._requestableRoots.delete(rootFeedId)
              this._requestTreeFromRoot(rootFeedId)
              return null
            })
          )
        : pull.empty()

    pull(
      cat([mainFlushables, rootFlushables]),
      pull.onEnd((err) => {
        this._flushing = false
        if (err) console.error(err)
        if (this._templates) this._setupStreamDrainers()
        if (this._wantsMoreFlushing) this._scheduleDebouncedFlush()
      })
    )
  }
}
