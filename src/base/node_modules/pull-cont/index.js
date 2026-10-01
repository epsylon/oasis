
var Source = require('./source')
var Sink = require('./sink')
var Duplex = require('./duplex')

module.exports = function (cont) {
  return Source(cont)
}

module.exports.Source = Source
module.exports.Sink = Sink
module.exports.Duplex = Duplex
