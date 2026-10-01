'use strict'
var range = require('./range')
var Skip = require('./skip')
var createCursor = require('./cursor')
var Take = require('pull-stream/throughs/take')

function Test(opts) {
  var end = opts.end
  if(end == null) return
  if(!opts.endInclusive) {
    return function (seq) {
      return opts.reverse ? seq > end : seq < end
    }
  }
  else {
    var once = false
    return function (seq) {
      if(once)
        return false
      else if(!(opts.reverse ? seq > end : seq < end))
        return once = true
      else
        return true
    }
  }
}

function Format (seqs, values) {
  return function (seq, value) {
    return (
      seqs
      ? (values ? {value: value, seq: seq} : seq)
      : value
    )
  }
}

module.exports = function (since, getMeta) {
  var Cursor = createCursor(since, getMeta)
  return function (opts) {
    opts = range(opts || {})

    var stream = Cursor(
      opts.old === false ? null : opts.start,
      opts.live || (opts.old === false),
      opts.reverse,
      Format(opts.seqs !== false, opts.values !== false),
      Test(opts),
      opts.cache
    )

    if(!opts.startInclusive || opts.old === false)
      stream = Skip(1)(stream)
    if(opts.limit)
      stream = Take(opts.limit)(stream)
    return stream
  }
}

