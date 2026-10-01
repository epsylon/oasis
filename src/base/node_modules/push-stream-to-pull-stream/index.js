var duplex = require('./duplex')
var source = require('./source')
var sink = require('./sink')

function transform (push) {
  return function (read) {
    var reader = source(push)
    sink(push)(read)
    return reader
  }
}

exports = module.exports = function (push, cb) {
  if(push.write && push.resume)
    return duplex(push, cb)
  else if(push.write && !push.resume)
    return sink(push, cb)
  else
    return source(push)
}

exports.source = source
exports.sink = sink
exports.duplex = duplex
exports.transform = transform

