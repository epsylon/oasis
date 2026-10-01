var FlumeLog = require('./')
var codec = require('flumecodec')

require('bench-flumelog')(function () {
  return FlumeLog('/tmp/bench-flumelog-offset' + Date.now(), {
    blockSize: 1024*64,
    codec: codec.json
  })
}, null, null, function (obj) {
    return obj
//  return Buffer.from(JSON.stringify(obj))
})

