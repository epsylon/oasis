var tape = require('tape')
var pull = require('pull-stream')
var mux = require('muxrpc')
var goodbye = require('../')
var pushable = require('pull-pushable')

  var client = {
    async: ['hello', 'goodbye'],
    source: ['stuff', 'bstuff'],
    sink: ['things'],
    duplex: ['suchstreamwow']
  }

  tape('duplex', function (t) {

    var A = mux(client, null) ()
    var B = mux(null, client) ({
      suchstreamwow: function (someParam) {
        // did the param come through?
        t.equal(someParam, 5)

        // normally, we'd use pull.values and pull.collect
        // however, pull.values sends 'end' onto the stream, which closes the muxrpc stream immediately
        // ...and we need the stream to stay open for the drain to collect
        var nextValue = 0
        var p = pushable()
        for (var i=0; i < 5; i++)
          p.push(i)

        return goodbye({
          source: pull.values([1,2,3,4,5]),
          sink: pull.collect(function(err, value) {
            if(err) throw err
            t.deepEqual(value, [1,2,3,4,5])
            t.end()
          })
        })
      }
    })

    var s = A.createStream()
    pull(
      s,
      pull.through(console.log.bind(console, 'IN')),
      B.createStream(),
      pull.through(console.log.bind(console,'OUT')),
      s
    )
    var dup = A.suchstreamwow(5)
    pull(dup, dup)
  })


