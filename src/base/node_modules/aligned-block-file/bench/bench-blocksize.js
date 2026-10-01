
var k = +process.argv[3] || 64
var length = k*1024
var blocks = require('../')(process.argv[2], length, 'r')

blocks.offset.once(function () {
  var start = 0, i = 0
  var ts = Date.now()
  blocks.read(start, Math.min(start+length, blocks.offset.value), function next (err, buffer, bytes) {
    if(err) throw err
    ++i
    if(buffer.length < length) {
      console.log([k, Date.now()-ts, i].join(', '))
      return
    }
    start += buffer.length
    blocks.read(start, Math.min(start+length, blocks.offset.value), next)
  })
})




