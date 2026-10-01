var tape = require('tape')
var pull = require('pull-stream')

var createCursor = require('../cursor')
var Obv = require('obv')

function createMock(ary) {
  var since = Obv()
  since.set(ary.length - 1)
  return {
    getMeta: function (o, cache, cb) {
      if(o < 0 || o >= ary.length)
        cb(new Error('out of bounds:'+o))
      else
        cb(null, ary[o], o-1, o+1)
    },
    get: function (o, cb) {
      cb(null, ary[o])
    },
    since: since
  }
}

tape('simple, forward', function (t) {
  var input = ['a', 'b', 'c']
  var mock = createMock(input)

  var Cursor = createCursor(mock.since, mock.getMeta)

  pull(
    Cursor(0),
    pull.collect(function (err, ary) {
      if(err) throw err
      t.deepEqual(ary, input)
      t.end()
    })
  )

})

tape('simple, live', function (t) {
  var input = ['a', 'b', 'c']
  var mock = createMock(input)
  var output = []
  var Cursor = createCursor(mock.since, mock.getMeta)

  pull(
    Cursor(0, true),
    pull.drain(function (item) {
      output.push(item)
    })
  )

  t.deepEqual(output, input, 'has already streamed old data')
  input.push('d')
  mock.since.set(3)

  t.deepEqual(output, input, 'also streamed new data')
  t.end()
})

tape('empty live', function (t) {
  var input = []
  var mock = createMock(input)
  var output = []
  var Cursor = createCursor(mock.since, mock.getMeta)

  pull(
    Cursor(0, true),
    pull.drain(function (item) {
      output.push(item)
    }, function () {
      throw new Error('should not end')
    })
  )

  t.end()

})


tape('simple, live', function (t) {
  var input = ['a', 'b', 'c']
  var mock = createMock(input)
  var output = []

  var Cursor = createCursor(mock.since, mock.getMeta)

  pull(
    Cursor(null, true),
    pull.drain(function (item) {
      output.push(item)
    }, function () {
      throw new Error("live stream shouldn't end")
    })
  )

  t.deepEqual(output, ['c'])
  input.push('d')
  mock.since.set(3)
  input.push('e')
  input.push('f')
  mock.since.set(5)

  //starts by getting the latest item
  //so cdef is actually correct.
  t.deepEqual(output, ['c', 'd', 'e', 'f'])
  t.end()
})


tape('simple, reverse', function (t) {
  var input = ['a', 'b', 'c']
  var mock = createMock(input)
  var Cursor = createCursor(mock.since, mock.getMeta)

  pull(
    Cursor(2, false, true),
    pull.collect(function (err, ary) {
      if(err) throw err
      t.deepEqual(ary.reverse(), input)
      t.end()
    })
  )

})

var createStream = require('../')

tape('stream, gte', function (t) {
  var input = ['a', 'b', 'c']
  var mock = createMock(input)

  var Stream = createStream(mock.since, mock.getMeta)

  pull(
    Stream({gte: 0, seqs: false}),
    pull.collect(function (err, ary) {
      if(err) throw err
      t.deepEqual(ary, input)
      t.end()
    })
  )

})

tape('stream, gt', function (t) {
  var input = ['a', 'b', 'c']
  var mock = createMock(input)

  var Stream = createStream(mock.since, mock.getMeta)

  pull(
    Stream({gt: 0, seqs: false}),
    pull.collect(function (err, ary) {
      if(err) throw err
      t.deepEqual(ary, input.slice(1))
      t.end()
    })
  )

})


tape('stream, live', function (t) {
  var input = ['a', 'b', 'c']
  var mock = createMock(input)
  var output = []

  var Stream = createStream(mock.since, mock.getMeta)

  pull(
    Stream({old: false, seqs: false}),
    pull.drain(function (item) {
      output.push(item)
    })
  )

  t.deepEqual(output, [])
  input.push('d')
  mock.since.set(3)
  input.push('e')
  input.push('f')
  mock.since.set(5)

  //starts by getting the latest item
  //so cdef is actually correct.
  t.deepEqual(output, ['d', 'e', 'f'])
  t.end()
})

tape('stream, lt', function (t) {
  var input = ['a', 'b', 'c']
  var mock = createMock(input)

  var Stream = createStream(mock.since, mock.getMeta)

  pull(
    Stream({lt: 2, seqs: false}),
    pull.collect(function (err, ary) {
      if(err) throw err
      t.deepEqual(ary, input.slice(0, 2))
      t.end()
    })
  )

})

tape('stream, lte', function (t) {
  var input = ['a', 'b', 'c']
  var mock = createMock(input)

  var Stream = createStream(mock.since, mock.getMeta)

  pull(
    Stream({lte: 1, seqs: false}),
    pull.collect(function (err, ary) {
      if(err) throw err
      t.deepEqual(ary, input.slice(0, 2))
      t.end()
    })
  )
})

tape('stream, lte', function (t) {
  var input = ['a', 'b', 'c']
  var mock = createMock(input)

  var Stream = createStream(mock.since, mock.getMeta)

  pull(
    Stream({lte: 2, live: true, seqs: false}),
    pull.collect(function (err, ary) {
      if(err) throw err
      t.deepEqual(ary, input)
      t.end()
    })
  )
})

tape('stream, {}', function (t) {
  var input = ['a', 'b', 'c']
  var mock = createMock(input)

  var Stream = createStream(mock.since, mock.getMeta)

  pull(
    Stream({}),
    pull.collect(function (err, ary) {
      if(err) throw err
      t.deepEqual(ary, [
        {seq:0,value: 'a'},
        {seq:1,value: 'b'},
        {seq:2,value: 'c'}
      ])
      t.end()
    })
  )
})

tape('stream, gt, reverse, seqs', function (t) {
  var input = ['a', 'b', 'c']
  var mock = createMock(input)

  var Stream = createStream(mock.since, mock.getMeta)
  pull(
    Stream({gt:0, reverse: true}),
    pull.collect(function (err, ary) {
      if(err) throw err
      t.deepEqual(ary, [
        {seq:2,value: 'c'},
        {seq:1,value: 'b'}
      ])
      t.end()
    })
  )
})

tape('stream, gt:-1', function (t) {
  var input = ['a', 'b', 'c']
  var mock = createMock(input)

  var Stream = createStream(mock.since, mock.getMeta)
  pull(
    Stream({gt:-1}),
    pull.collect(function (err, ary) {
      if(err) throw err
      t.deepEqual(ary, [
        {seq:0,value: 'a'},
        {seq:1,value: 'b'},
        {seq:2,value: 'c'}
      ])
      t.end()
    })
  )
})

tape('stream, gt:-1, reverse', function (t) {
  var input = ['a', 'b', 'c']
  var mock = createMock(input)

  var Stream = createStream(mock.since, mock.getMeta)
  pull(
    Stream({gt:-1, reverse: true}),
    pull.collect(function (err, ary) {
      if(err) throw err
      t.deepEqual(ary.reverse(), [
        {seq:0,value: 'a'},
        {seq:1,value: 'b'},
        {seq:2,value: 'c'}
      ])
      t.end()
    })
  )
})

