var tape = require('tape')
var ma = require('../')
var valid = [
  'net:host.com:8008',
  'net:host.com:8008~shs:oaercuhroaecuh',
  'net:host.com:8008~shs:oaercuhroaecuh~gzip',
  'ws://host.com:8008~shs:oaercuhroaecuh~gzip',
  'ws://host.com:8008~shs:oaercuhroaecuh~gzip;net:host.com:8008~shs:oaercuhroaecuh~gzip',
  'shs:::' //data fields may be empty
]

var invalid = [
  '', //empty
  ':host.com:8008', //missing name
  '1a:host.com:8008', //missing name starting with number

  'ABC:host.com:8008', //capitals in name
  'a.b:host.com:8008', //punctuation in name
  '~:host.com:8008',   //protocol separator in name
  ';:host.com:8008',   //address separator in name
  '!:host.com:8008',   //escape in name
  'net:host.com:8008~', //empty protocol
  'net:host.com:8008~~gzip', //empty protocol
]


valid.forEach(function (e) {
  tape('parse:'+e, function (t) {
    var d = ma.decode(e)
    console.log(e, d)
    t.equal(ma.check(e), true)
    t.equal(ma.encode(ma.decode(e)), e)
    t.end()
  })
})

invalid.forEach(function (e) {
  tape('error: '+e, function (t) {
    t.equal(ma.check(e), false)
    t.throws(function () {
      ma.decode(e)
    })
    t.end()
  })
})

//test that check passes the output of `nearley-unparse ./multiserver.ne -n 100`
var random = require('fs').readFileSync(__dirname+'/random.txt', 'utf8').split('\n')
tape('can check randomly generated data', function (t) {
  random.forEach(function (e) {
    if(e != '')
      t.ok(ma.check(e), 'should check:'+JSON.stringify(e))
  })
  t.end()
})
