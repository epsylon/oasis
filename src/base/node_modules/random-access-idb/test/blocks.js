var blocks = require('../lib/blocks.js')
var test = require('tape')

test('blocks', function (t) {
  t.deepEqual(blocks(4,0,8), [
    { block: 0, start: 0, end: 4 },
    { block: 1, start: 0, end: 4 }
  ])
  t.deepEqual(blocks(1,0,4), [
    { block: 0, start: 0, end: 1 },
    { block: 1, start: 0, end: 1 },
    { block: 2, start: 0, end: 1 },
    { block: 3, start: 0, end: 1 }
  ])
  t.deepEqual(blocks(16,15,38), [
    { block: 0, start: 15, end: 16 },
    { block: 1, start: 0, end: 16 },
    { block: 2, start: 0, end: 6 }
  ])
  t.deepEqual(blocks(5,100,122), [
    { block: 20, start: 0, end: 5 },
    { block: 21, start: 0, end: 5 },
    { block: 22, start: 0, end: 5 },
    { block: 23, start: 0, end: 5 },
    { block: 24, start: 0, end: 2 }
  ])
  t.deepEqual(blocks(5,106,109), [
    { block: 21, start: 1, end: 4 }
  ])
  t.deepEqual(blocks(5,107,110), [
    { block: 21, start: 2, end: 5 }
  ])
  t.deepEqual(blocks(5,107,111), [
    { block: 21, start: 2, end: 5 },
    { block: 22, start: 0, end: 1 }
  ])
  t.end()
})
