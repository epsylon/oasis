var cp = require('child_process')
var MuxRpcStream = require('muxrpc/stream')
var toPull = require('stream-to-pull-stream')
var pull = require('pull-stream')
var path = require('path')

module.exports = function run(location, localCall) {
  var proc = cp.spawn(path.join(location, 'bin'), [], {})
  var stream = MuxRpcStream(
    localCall,
    require('packet-stream-codec')
  )

  pull(
    toPull.source(proc.stdout),
    stream,
    toPull.sink(proc.stdin)
  )

  pull(
    toPull.source(proc.stderr),
    toPull.sink(process.stderr)
  )

  return {
    kill: function (cb) {
      proc.once('exit', function () { cb() })
      proc.kill('SIGKILL')
    },
    remoteCall: stream.remoteCall,
    proc: proc,
  }
}











