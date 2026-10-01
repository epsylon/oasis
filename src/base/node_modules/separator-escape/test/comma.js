var split = require('../')(',','\\')

var tape = require('tape')

var input = [
  'a,b,c',
  'a,b\\,c,d',
  'a,b\\\\c,d',
  'a,b,c,d\\\\'
]
var output = [
  'a,b,c'.split(','),
  ['a','b,c', 'd'],
  ['a','b\\c', 'd'],
  ['a','b', 'c', 'd\\']
]

input.map(function (e, i) {
  tape('split:'+e, function (t) {
    console.log(output)
    t.deepEqual(split.parse(e), output[i])
    t.end()
  })
  tape('join:'+JSON.stringify(output[i]), function (t) {
    console.log(output)
    t.deepEqual(split.stringify(output[i]), e)
    t.end()
  })
})



tape('trailing escape treated as literal', function (t) {
  t.deepEqual(split.parse('a,b,c\\'),['a','b','c\\'])
  t.deepEqual(split.stringify(['a','b','c\\']), 'a,b,c\\\\')
  t.end()

})


