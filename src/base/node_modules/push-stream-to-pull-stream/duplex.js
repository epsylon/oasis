var toSource = require('./source')
var toSink = require('./sink')

module.exports = function (push, cb) {
  return {
    source: toSource(push, cb),
    sink: toSink(push)
  }
}
