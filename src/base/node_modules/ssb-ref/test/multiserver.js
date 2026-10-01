var tape = require('tape')
var R = require('../')

var multiserver1 = 'net:145.12.20.3:8080~shs:gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc='
var multiserver2 = 'onion:xyz.onion:8080~shs:gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc='

tape('parse multiserver address to legacy', function (t) {
  var objAddr = {
    host: '145.12.20.3',
    port: 8080,
    key: '@gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=.ed25519'
  }

  t.ok(R.isAddress(multiserver1))
  t.deepEqual(R.parseAddress(multiserver1), objAddr)

  t.ok(R.isAddress(objAddr))
  t.notOk(R.isAddress({}))

  t.end()
})

tape('check that onions pass', function (t) {
  t.ok(R.isAddress(multiserver2))
  t.end()
})
