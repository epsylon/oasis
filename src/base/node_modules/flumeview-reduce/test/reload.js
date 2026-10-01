var FlumelogOffset = require('flumelog-offset')
var Flume = require('flumedb')
var Reduce = require('../')

function sum (a, b) {
      return (a || 0) + b
  }
function create (filename) {
  return Flume(FlumelogOffset(filename, 1024, require('flumecodec/json')))
  .use('view', Reduce(1, sum))
}

var tape = require('tape')

var file = '/tmp/test_flumeview-reduce/'+Date.now()+'/log.offset'

var db = create(file)

function check (t, v) {
  db.view.get(function (err, sum) {
    t.deepEqual(sum, v)
    t.end()
  })
}

tape('simple', function (t) {

  db.append([1, 2, 3, 4, 5], function (err) {
    check(t, 15)
  })

})

tape('reload', function (t) {
  db = create(file)
  check(t, 15)
})

tape('remote', function (t) {
  var view = require('../inject')(
    require('../store/remote')(db.view.get, require('../store/fs'))
  )(1, sum)({filename: file}, 'view2')

  view.since.once(function (seq) {
    t.equal(seq, db.since.value)
    view.get(function (err, v) {
      if(err) throw err
      t.equal(v, 15)
      t.end()
    })
  })
})

tape('remote 2', function (t) {
  db = create(file)
  db.append(6, function (err) {
    if(err) throw err

    var view = require('../inject')(
      require('../store/remote')(db.view.get, require('../store/fs'))
    )(1, sum)({filename: file}, 'view2')

    view.since.once(function (seq) {
      view.get(function (err, v) {
        if(err) throw err
        t.equal(v, 21)
        t.end()
      })
    })
  })
})

//remote, but check that it streams if the load amount is too big
