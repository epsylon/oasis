var OffsetLog = require('flumelog-offset')
var Reduce = require('../')
var tape = require('tape')
var Flume = require('flumedb')
var pull = require('pull-stream')
var rmrf = require('rimraf')

var output = {}
function log (name) {
  output[name] = []
  return function (value) {
    output[name].push(value)
    console.log(name, value)
  }
}

module.exports = function (createFlume) {
  tape('simple', function (t) {
    function create() {
      return createFlume()
      .use('view',
        Reduce("1", function (acc, item) {
          console.log("REDUCE", acc, item, (acc || 0) + 1)
          return (acc || 0) + 1
        }, null, null, 0)
      )
    }
    var db = create()
    db.view.since.once(function () {
      console.log("VIEW", db.since.value, db.view.since.value, db.view.value.value)
    })

    db.since.once(function () {
      console.log("LOG", db.since.value, db.view.since.value, db.view.value.value)
    })
    pull(
      db.view.stream({live: true}),
      pull.drain(log(1), function () {
      })
    )

    var i = 0
    var int = setInterval(function () {
      db.append({value: 10*(i++)}, function (err) {
        if(i < 4) return
        clearInterval(int)
        db.close(function (err) {
          if(err) throw err
          const _db = create()
          pull(
            _db.view.stream({live: true}),
            pull.drain(log(2), function () {
            })
          )
          //wait until we are loaded
          console.log("GET")
          t.end()
          /*
          NOTE: this test is broken!
          _db.get(function (err, v) {
          if(err) throw err
          console.log('value', v)
            console.log("APPEND")
            _db.append({value: 'x'}, function () {
              _db.close(function (err) {
                if(err) throw err
                t.deepEqual(output, {
                  1: [0, {value: 0}, {value: 10}, {value: 20}, {value: 30}],
                  2: [4 ,{value:'x'}]
                })
              })
            })
          })
          */
        })
      })
    },40)
  })
}

if(!module.parent) {
  var file ='/tmp/test-ssb-flumeview_offsetlog2'
  module.exports(function () {
    rmrf.sync(file)
    return Flume(OffsetLog(file, {blockSize:1024, codec: require('flumecodec/json')}))
  })
}






