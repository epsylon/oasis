module.exports = function reduce (acc, value) {
  //handle when called without initial
  if('number' === typeof acc)
    return reduce(reduce(null, acc), value)
  //set initial if initial was null
  else if(null == acc)
    return {
      mean: value,
      stdev: 0,

      count: 1,
      sum: value,
      sqsum: value*value
    }

  var sum = acc.sum + value
  var count = acc.count + 1
  var sq = value*value

  var mean = sum/count
  var sqsum = acc.sqsum + sq

  return {
    //these values useful output
    mean: mean,
    stdev: Math.sqrt(sqsum/count - mean*mean),

    //these values needed to maintain state.
    count: count,
    sum: sum,
    sqsum: sqsum
  }
}

module.exports.initial = require('./initial')

