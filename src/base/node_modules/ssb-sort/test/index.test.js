var tape = require('tape')
var fs = require('fs')
var path = require('path')
var sort = require('../')
var kv = require('./fakeMsg')
var shuffle = require('./shuffle')

tape('sequential', function (t) {
  var a = kv({okay: true})
  var b = kv({okay: 2, root: a.key})
  var c = kv({okay: 3, root: a.key, branch: b.key})
  var msgs = [a, b, c]
  var rand = shuffle(msgs)

  t.deepEqual(sort.roots(rand), [a.key], 'correct roots')
  t.deepEqual(sort.heads(rand), [c.key], 'correct heads')
  t.deepEqual(sort.missingContext(rand), {}, 'correct missingContext')
  t.deepEqual(sort(rand), msgs, 'correct sort')
  t.end()
})

tape('concurrent', function (t) {
  var a = kv({okay: true})
  var b = kv({okay: 2, root: a.key})
  var c = kv({okay: 3, root: a.key})
  var msgs = [a, b, c]
  var rand = shuffle(msgs)

  t.deepEqual(sort.roots(rand), [a.key], 'correct roots')
  t.deepEqual(sort.heads(rand).sort(), [b.key, c.key].sort(), 'correct heads')
  t.deepEqual(
    sort.missingContext(rand),
    { [b.key]: [c], [c.key]: [b] },
    'correct missingContext'
  )
  // NOTE - sort must go last as it's a mutating function
  t.deepEqual(sort(rand), msgs, 'correct sort')
  t.end()
})

tape('merge', function (t) {
  var a = kv({okay: true})
  var b = kv({okay: 2, root: a.key})
  var c = kv({okay: 3, root: a.key})
  var d = kv({okay: 4, root: a.key, branch: [b.key, c.key]})
  var msgs = [a, b, c, d]
  var rand = shuffle(msgs)

  t.deepEqual(sort.roots(rand), [a.key], 'correct roots')
  t.deepEqual(sort.heads(rand), [d.key], 'correct heads')
  t.deepEqual(
    sort.missingContext(rand),
    { [b.key]: [c], [c.key]: [b] },
    'correct missingContext'
  )
  t.deepEqual(sort(rand), msgs, 'correct sort')
  t.end()
})

tape('merge - missing ultimate root', function (t) {
  var a = kv({okay: true}) // this is left out of the set.

  var b = kv({okay: 2, root: a.key})
  var c = kv({okay: 3, root: a.key})
  var d = kv({okay: 4, root: a.key, branch: [b.key, c.key]})
  var msgs = [b, c, d]
  var rand = shuffle(msgs)

  t.deepEqual(sort.roots(rand), [b.key, c.key], 'correct roots')
  t.deepEqual(sort.heads(rand), [d.key], 'correct heads')
  t.deepEqual(
    sort.missingContext(rand),
    { [b.key]: [c], [c.key]: [b] },
    'correct missingContext'
  )
  t.deepEqual(sort(rand), msgs, 'correct sort')
  t.end()
})

tape('multiple merge', function (t) {
  // This case from the README :
  //
  // 1:       A
  //         /|\
  //        / | \
  //       /  |  \
  // 2:   B1  B2  B3
  //       \ /   /
  // 3:     C   /
  //         \ /
  // 4:       D
  var a = kv({okay: true, name: 'a'})
  var b1 = kv({okay: 2, name: 'b1', root: a.key})
  var b2 = kv({okay: 2, name: 'b2', root: a.key})
  var b3 = kv({okay: 2, name: 'b3', root: a.key})
  var c = kv({okay: 3, name: 'c', branch: [b1.key, b2.key], root: a.key})
  var d = kv({okay: 4, name: 'd', branch: [c.key, b3.key], root: a.key})

  var msgs = [a, b1, b2, b3, c, d]
  var rand = shuffle(msgs)

  t.deepEqual(sort.roots(rand), [a.key], 'correct roots')
  t.deepEqual(sort.heads(rand), [d.key], 'correct heads')


  t.deepEqual(
    sortVals(sort.missingContext(rand)),
    {
      [b1.key]: [b2, b3],
      [b2.key]: [b1, b3],
      [b3.key]: [b1, b2, c],
      [c.key]: [b3]
    },
    'correct missingContext'
  )
  t.deepEqual(sort(rand), msgs, 'correct sort')

  function sortVals (obj) {
    Object.keys(obj).forEach(k => {
      obj[k] = obj[k].sort((a, b) => a.value.timestamp - b.value.timestamp)
    })
    return obj
  }

  t.end()
})

tape('concurrent complex', function (t) {
  // This case :
  //
  // 1:       A
  //         /|\
  //        / | \
  //       /  |  \
  // 2:   B1  B2  B3
  //       \ /
  // 3:     C
  //
  var a = kv({okay: true, name: 'a'})
  var b1 = kv({okay: 2, name: 'b1', root: a.key})
  var b2 = kv({okay: 2, name: 'b2', root: a.key})
  var b3 = kv({okay: 2, name: 'b3', root: a.key})
  var c = kv({okay: 3, name: 'c', branch: [b1.key, b2.key], root: a.key})

  var msgs = [a, b1, b2, b3, c]
  var rand = shuffle(msgs)

  t.deepEqual(sort.roots(rand), [a.key], 'correct roots')
  t.deepEqual(sort.heads(rand).sort(), [c.key, b3.key].sort(), 'correct heads')
  t.deepEqual(
    sortVals(sort.missingContext(rand)),
    {
      [b1.key]: [b2, b3],
      [b2.key]: [b1, b3],
      [b3.key]: [b1, b2, c],
      [c.key]: [b3]
    },
    'correct missingContext'
  )
  t.deepEqual(sort(rand), msgs, 'correct sort')

  function sortVals (obj) {
    Object.keys(obj).forEach(k => {
      obj[k] = obj[k].sort((a, b) => a.value.timestamp - b.value.timestamp)
    })
    return obj
  }

  t.end()
})

tape('concurrent complex, 2', function (t) {
  // This case :
  //
  // 1:       A
  //         /|\
  //        / | \
  //       /  |  \
  // 2:   B1  B2  B3
  //       \ /     \
  // 3:     C1      C2
  //
  var a = kv({okay: true, name: 'a'})
  var b1 = kv({okay: 2, name: 'b1', root: a.key})
  var b2 = kv({okay: 2, name: 'b2', root: a.key})
  var b3 = kv({okay: 2, name: 'b3', root: a.key})
  var c1 = kv({okay: 3, name: 'c1', branch: [b1.key, b2.key], root: a.key})
  var c2 = kv({okay: 3, name: 'c2', branch: b3.key, root: a.key})

  var msgs = [a, b1, b2, b3, c1, c2]
  var rand = shuffle(msgs)

  // ## handy output for debugging
  // const mc = sort.missingContext(rand)
  // const getName = m => m.value.content.name
  // msgs
  //   .filter(m => mc[m.key])
  //   .forEach(m => console.log(getName(m), ' ', mc[m.key].map(getName)) )

  t.deepEqual(sort.roots(rand), [a.key], 'correct roots')
  t.deepEqual(sort.heads(rand).sort(), [c1.key, c2.key].sort(), 'correct heads')
  t.deepEqual(
    sortVals(sort.missingContext(rand)),
    sortVals({
      [b1.key]: [b2, b3, c2],
      [b2.key]: [b1, b3, c2],
      [b3.key]: [b1, b2, c1],
      [c1.key]: [b3, c2],
      [c2.key]: [b1, b2, c1]
    }),
    'correct missingContext'
  )
  t.deepEqual(sort(rand), msgs, 'correct sort')

  function sortVals (obj) {
    Object.keys(obj).forEach(k => {
      obj[k] = obj[k].sort((a, b) => a.value.timestamp - b.value.timestamp)
    })
    return obj
  }

  // function vals(obj) {
  //   Object.keys(obj).forEach(k => obj[k] = obj[k].map(m=> m.value.content.name))
  //   return obj
  // }

  t.end()
})

tape('real', function (t) {
  var thread = fs.readFileSync(path.join(__dirname, 'thread.json'), 'utf8').split('\n\n').filter(Boolean).map(JSON.parse)

  var thread2 = sort(thread.slice())
  var thread3 = thread.slice().sort(function () { return Math.random() - 0.5 })
  var h1 = sort.heads(thread)
  var r1 = sort.roots(thread)
  var h2 = sort.heads(thread2)
  var r2 = sort.roots(thread2)
  var h3 = sort.heads(thread3)
  var r3 = sort.roots(thread3)

  t.deepEqual(h1, h2)
  t.deepEqual(h2, h3)
  t.deepEqual(h1, h3)

  t.deepEqual(r1, r2)
  t.deepEqual(r2, r3)
  t.deepEqual(r1, r3)

  var sorted = sort(thread)
  t.equal(sorted[0].key, r1[0])
  var a = []
  sort.ancestors(thread, h1[0], function (e, k) {
    a.push(k)
  })
  var b = []
  sort.ancestors(thread, h1[1], function (e, k) {
    b.push(k)
  })
  // console.log(a, b)
  t.end()
})
