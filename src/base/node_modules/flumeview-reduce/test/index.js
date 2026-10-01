var Log = require('flumelog-memory')
var Reduce = require('../')
var tape = require('tape')
var Flume = require('flumedb')
var pull = require('pull-stream')

module.exports = function (createFlume) {
  tape('simple', function (t) {
    t.plan(14)

    var db = createFlume()
      .use('view', Reduce(
        1,
        function reduce (acc, item) {
          t.pass('reducing')
          return {
            sum: acc.sum+item,
            squareSum: acc.squareSum+item*item
          }
        },
        function map (data) {
          t.pass('saw message')
          return data.value
        },
        null, { sum: 0, squareSum: 0 } // codec, initial state
      ))

    var values = [{value: 10}, {value: 20}]

    var asyncDone = false
    var streamDone = false

    pull(
      db.view.stream({ live: true }),
      pull.take(3),
      pull.collect((err, values) => {
        t.deepEqual(values, [
          { sum: 0, squareSum: 0 },
          10,
          20
        ], 'streams reduction of view')

        streamDone = true
        if (asyncDone && streamDone) t.end()
      })
    )

    db.view.get(function (err, v) {
      if(err) throw err
      t.deepEqual(v, { sum: 0, squareSum: 0 }, 'initial state')

      db.append(values, function (err) {
        db.view.get(function (err, value) {
          if(err) throw err
          t.deepEqual(value, { sum: 30, squareSum: 500 }, 'reduces view')

          db.view.get({meta: true, values: true}, function (err, value) {
            if(err) throw err
            t.deepEqual(value, {seq: value.seq, value: { sum: 30, squareSum: 500 }, version: 1}, 'meta: true, values: true')

            db.view.get({values: false}, function (err, value) {
              if(err) throw err
              t.deepEqual(value, {seq: value.seq, version: 1, size: null}, 'values: false')

              asyncDone = true
              if (asyncDone && streamDone)
              db.rebuild((err) => {
                t.error(err)
                t.end()
              })
            })
          })
        })
      })
    })
  })
}

if(!module.parent)
  module.exports(function () { return Flume(Log()) })
