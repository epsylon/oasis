var File = require('./file')
var Blocks = require('./blocks')

module.exports = function (file, block_size, flags, cache) {
  return Blocks(File(file, block_size, flags), block_size, cache)
}
