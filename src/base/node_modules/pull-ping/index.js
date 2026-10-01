var Pushable = require('pull-pushable')
var stats = require('statistics/mutate')
var Drain = require('pull-stream/sinks/drain')

module.exports = function (opts) {
  var timeout = opts && opts.timeout || 5*60*1000 //default: 5 minutes
  var serve = false, timer
  var source = Pushable()
  var rtt = stats.initial(), skew = stats.initial()

  function ping () {
    //serve the ping pong, opponent
    //will volley it back to us, keeping connection alive
    //and revealing clock skew.
    serve = true
    source.push(ts = Date.now())
  }

  //we send the first ping
  if(opts && opts.serve) ping()

  var self
  return self = {
    source: source,
    sink: Drain(function (remote_ts) {
      if(serve) {
        var ts2 = Date.now()
        self.rtt = stats(self.rtt, ts2 - ts)
        //if their time is behind half a round trip behing ts2
        //consider that to be negative skew.
        self.skew = stats(self.skew, remote_ts - ((ts2 + ts)/2))
        serve = false
      }
      else {
        //volley timestamp back to opponent.
        source.push(ts = Date.now())
        //we'll serve next time.
        timer = setTimeout(ping, timeout)
      }
    }, function (err) {
      clearTimeout(timer)
    }),
    rtt: rtt, skew: skew
  }

}

