var pull = require('pull-stream')

function rate (s) {
  var recent = []
  var stream = pull.through(function (d) {
    stream.ts = Date.now()
    recent.push({size: d.length, ts: stream.ts})
    if(recent.length > 5)
      recent.shift()

  })

  stream.ts = Date.now()

  stream.rate = function () {
    var ts = Date.now()
    if(recent.length > 1) {
      var rate = (recent.reduce(function (size, item) {
        return size + item.size
      }, 0)/1000000) / ((ts - recent[0].ts)/1000)

      return rate
    }
  }

  return stream
}

module.exports = rate
