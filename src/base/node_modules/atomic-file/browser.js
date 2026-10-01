const Store = require('./store/idb')
const Inject = require('./inject')

module.exports = function (filename, suffix, codec) {
  return Inject(Store(filename, suffix, codec && codec.buffer), codec)
}
