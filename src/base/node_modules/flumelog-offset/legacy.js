var Blocks = require('aligned-block-file')
var createFrame = require('./frame/basic')
var Cache = require('hashlru')
var inject = require('./inject')
function id (e) { return e }
function isNumber(n) { return 'number' == typeof n && !isNaN(n) }

module.exports = function (file, block_size, codec) {
  if(!isNumber(block_size))
    codec = block_size, block_size = 1024*16
  codec = codec || {encode: id, decode: id}

  var blocks = Blocks(file, block_size, 'a+', Cache(1024))
  return inject(
    blocks,
    createFrame(blocks, codec),
    codec,
    file
  )
}

