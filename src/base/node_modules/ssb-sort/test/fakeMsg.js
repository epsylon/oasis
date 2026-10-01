var crypto = require('crypto')
//just fake messages for testing.

var minute = 60*1000
var addTime = 0

module.exports = function fakeMsg (content) {
  var value = {
    content,
    timestamp: Date.now() + addTime // user declared
  }

  addTime += 10

  return {
    key: hash(value),
    value,
    // timestamp: someTimeLater(timestamp) // time received
  }
}

function hash (msg) {
  return '%'+crypto.createHash('sha256')
    .update(JSON.stringify(msg, null, 2))
    .digest('base64')+'.sha256'
}

function someTimeLater (timestamp) {
  return timestamp + Math.floor(Math.random()*120*minute) 
}

