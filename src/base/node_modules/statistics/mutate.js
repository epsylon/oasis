'use strict'
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

  var sum = (acc.sum||0) + value
  var count = (acc.count||0) + 1
  var sq = value*value
  var sqsum = (acc.sqsum||0) + sq

  acc.mean = sum/count
  acc.stdev = Math.sqrt(sqsum/count - acc.mean*acc.mean)

  acc.count = count
  acc.sum = sum
  acc.sqsum = sqsum

  return acc
}

module.exports.initial = require('./initial')
