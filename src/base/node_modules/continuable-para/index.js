var list = require('continuable-list')
var hash = require('continuable-hash')

module.exports = function (obj, cb) {
  if(Array.isArray(obj))
    return list(obj, cb)
  else if('object' === typeof obj)
    return hash(obj, cb)
  else
    return list([].slice.call(arguments))
}
