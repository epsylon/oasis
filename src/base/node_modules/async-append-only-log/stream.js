// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

const ltgt = require('ltgt')
const looper = require('looper')

module.exports = Stream

const BLOCK_STATE = Object.freeze({
  GET_NEXT_BLOCK: 0,
  END_OF_STREAM: 1,
  PAUSED: 2,
})

const STREAM_STATE = Object.freeze({
  INITIALIZING: 0,
  LOADED: 1,
  RUNNING: 2,
  PAUSED: 3,
  ENDED: 4,
})

function Stream(log, opts) {
  opts = opts || {}

  this.log = log

  // configs
  this.live = !!opts.live
  this.offsets = opts.offsets !== false
  this.values = opts.values !== false
  this.sizes = opts.sizes === true
  this.limit = opts.limit || 0

  this.state = STREAM_STATE.INITIALIZING

  this.min = ltgt.lowerBound(opts, null)
  if (ltgt.lowerBoundInclusive(opts)) this.min_inclusive = this.min

  this.max = ltgt.upperBound(opts, null)
  if (ltgt.upperBoundInclusive(opts)) this.max_inclusive = this.max

  // this is properly initialized when this.log is ready
  this.cursor = -1

  // used together with limit
  this.count = 0

  // used for live (new values) & gt
  this.skip_next = false

  // needed in _ready
  this.opts = opts

  this._resumeCallback = this._resumeCallback.bind(this)
  this._resume = this._resume.bind(this)

  this.log.onLoad(this._ready.bind(this))()
}

Stream.prototype._ready = function _ready() {
  //note: cursor has default of the current length or zero.
  this.cursor = ltgt.lowerBound(this.opts, 0)

  if (this.cursor < 0) this.cursor = 0

  if (this.opts.gt >= 0) this.skip_next = true

  if (this.cursor === 0 && this.log.since.value === -1) {
    if (!this.live) this.state = STREAM_STATE.ENDED
    else this.state = STREAM_STATE.INITIALIZING // still not ready
  } else this.state = STREAM_STATE.LOADED

  this.resume()
}

Stream.prototype._writeToSink = function _writeToSink(value, size) {
  const offset = this.cursor

  const o = this.offsets
  const v = this.values
  const s = this.sizes
  if (o && v && s) this.sink.write({ offset, value, size })
  else if (o && v) this.sink.write({ offset, value })
  else if (o && s) this.sink.write({ offset, size })
  else if (v && s) this.sink.write({ value, size })
  else if (o) this.sink.write(offset)
  else if (v) this.sink.write(value)
  else if (s) this.sink.write(size)
  else this.sink.write(offset)
}

// returns a new BLOCK_STATE
Stream.prototype._handleBlock = function _handleBlock(blockBuf) {
  while (true) {
    if (this.sink.paused || this.sink.ended) return BLOCK_STATE.PAUSED

    const [offset, value, size] = this.log.getDataNextOffset(
      blockBuf,
      this.cursor
    )

    if (this.skip_next) {
      this.skip_next = false

      if (offset > 0) {
        this.cursor = offset
        continue
      } else if (offset === 0) return BLOCK_STATE.GET_NEXT_BLOCK
      else if (offset === -1) return BLOCK_STATE.END_OF_STREAM
    }

    this.count++

    const o = this.cursor

    if (
      (this.min === null || this.min < o || this.min_inclusive === o) &&
      (this.max === null || this.max > o || this.max_inclusive === o)
    ) {
      this._writeToSink(value, size)

      if (offset > 0) this.cursor = offset
      else if (offset === 0) return BLOCK_STATE.GET_NEXT_BLOCK
      else if (offset === -1) return BLOCK_STATE.END_OF_STREAM

      if (this.limit > 0 && this.count >= this.limit)
        return BLOCK_STATE.END_OF_STREAM
    } else return BLOCK_STATE.END_OF_STREAM
  }
}

Stream.prototype._resume = function _resume() {
  if (this.state === STREAM_STATE.ENDED) {
    if (this.sink && !this.sink.ended) this.abort()
    return
  }

  if (this.state === STREAM_STATE.INITIALIZING) return // not ready yet

  if (!this.sink || this.sink.paused) {
    this.state = STREAM_STATE.PAUSED
    return
  }

  this.state = STREAM_STATE.RUNNING

  this.log.getBlock(this.cursor, this._resumeCallback)
}

Stream.prototype._resumeCallback = function _resumeCallback(err, block) {
  if (err) {
    console.error(err)
    return
  }

  const blockState = this._handleBlock(block)
  if (blockState === BLOCK_STATE.GET_NEXT_BLOCK) {
    this.cursor = this.log.getNextBlockStart(this.cursor)
    this._next()
  } else if (blockState === BLOCK_STATE.PAUSED) {
    this.state = STREAM_STATE.PAUSED
  } else if (blockState === BLOCK_STATE.END_OF_STREAM) {
    if (!this.live) this.abort()
    else {
      this.state = STREAM_STATE.PAUSED
      this.skip_next = true
    }
  }
}

Stream.prototype.resume = function resume() {
  if (this.state === STREAM_STATE.RUNNING) return

  this._next = looper(this._resume)
  this._next()
}

Stream.prototype.liveResume = function liveResume() {
  if (this.state === STREAM_STATE.INITIALIZING) this.state = STREAM_STATE.LOADED

  this.resume()
}

Stream.prototype.postCompactionReset = function postCompactionReset(offset) {
  this.cursor = Math.min(offset, this.cursor)
  this.min = null
  this.min_inclusive = null
}

Stream.prototype.abort = function abort(err) {
  this.state = STREAM_STATE.ENDED
  this.log.streams.delete(this)
  if (!this.sink.ended && this.sink.end) {
    this.sink.ended = true
    this.sink.end(err === true ? null : err)
  }
}

Stream.prototype.pipe = require('push-stream/pipe')
