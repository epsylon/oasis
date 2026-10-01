var filename = '/tmp/test_block-reader_'+Date.now()
var Blocks = require('../blocks')
var File = require('../file')

require('./append')(function (b) {
  return Blocks(File(filename, 32, 'a+'), 32)
})
