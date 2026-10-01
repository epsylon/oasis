const test = require('tape')

const pullAsync = require('../')

test('pull-async', function(t) {
  t.ok(pullAsync, 'module is require-able')
  t.end()
})
