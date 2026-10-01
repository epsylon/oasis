var ltgt = require('ltgt')

module.exports = function (opts) {
  var start = opts.reverse ?
    ltgt.upperBound(opts, null) :
    ltgt.lowerBound(opts, 0)

  var startInclusive = ltgt.startInclusive(opts)
  if(start < 0) {
    start = 0
    startInclusive = true
  }
  return {
    start: start,
    end: (
      opts.reverse ?
      ltgt.lowerBound(opts, 0) :
      ltgt.upperBound(opts, null)
    ),
    startInclusive: startInclusive,
    endInclusive: ltgt.endInclusive(opts),
    reverse: !!opts.reverse,
    live: opts.live,
    old: opts.old,
    limit: opts.limit,
    seqs: opts.seqs, values: opts.values,
    cache: opts.cache !== false
  }
}
