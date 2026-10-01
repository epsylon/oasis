var test = require('tape')
var Values = require('push-stream/sources/values')
var Collect = require('push-stream/sinks/collect')
var pull = require('pull-stream')

var toPull = require('../')

test('simple', function (t) {
  pull(
    toPull.source(new Values([1,2,3])),
    toPull.sink(new Collect(function (err, ary) {
      t.deepEqual(ary, [1,2,3])
      t.end()
    }))
  )
})

test('simple, async', function (t) {
  pull(
    toPull.source(new Values([1,2,3])),
    pull.asyncMap(function (data, cb) {
      setImmediate(function () {
        cb(null, data)
      })
    }),
    toPull.sink(new Collect(function (err, ary) {
      t.deepEqual(ary, [1,2,3])
      t.end()
    }))
  )
})

function Echo () {
  return {
    write: function (data) {
      this.sink.write(data)
      this.paused = this.sink.paused
    },
    end: function (err) {
      this.sink.end(err)
    },
    resume: function () {
      this.paused = this.sink.paused
      this.source.resume()
    },
    paused: false,
    pipe: function (sink) {
      this.sink = sink
      sink.source = this
      if(!sink.paused && this.source)
        this.source.resume()
      return sink
    }
  }
}


test('simple, duplex', function (t) {
  pull(
    pull.values([1,2,3]),
    toPull.duplex(Echo()),
    pull.collect(function (err, ary) {
      t.deepEqual(ary, [1,2,3])
      t.end()
    })
  )
})

test('simple, source, duplex, sink', function (t) {
  pull(
    toPull.source(new Values([1,2,3])),
    toPull.duplex(Echo()),
    toPull.sink(new Collect(function (err, ary) {
      t.deepEqual(ary, [1,2,3])
      t.end()
    }))
  )
})

test('simple, transform', function (t) {
  pull(
    pull.values([1,2,3]),
    toPull.transform(Echo()),
    pull.collect(function (err, ary) {
      t.deepEqual(ary, [1,2,3])
      t.end()
    })
  )
})

test('simple, source, transform, sink', function (t) {
  pull(
    toPull.source(new Values([1,2,3])),
    toPull.transform(Echo()),
    toPull.sink(new Collect(function (err, ary) {
      t.deepEqual(ary, [1,2,3])
      t.end()
    }))
  )
})




