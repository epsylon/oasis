var pull = require('pull-stream')
var create = require('../')
var testLog = require('test-flumelog')

function test(name, opts, cb) {
  testLog(function () {
    return create('/tmp/test_flumelog-offset_'+Date.now(), Object.assign({
      blockSize: 1024,
      codec: {
        encode: function (v) {
          return Buffer.from(JSON.stringify(v))
        },
        decode: function (v) {
          return JSON.parse(v)
        },
        buffer: false
      }
    }, opts))
  }, function () {
    console.log(name + ' done')
    cb()
  })
}

pull(
  pull.values([32, 48, 53]),
  pull.asyncMap( function(bits, cb) {
    test(bits + 'bit', {offsetCodec: bits}, cb)
  }),
  pull.drain()
)
