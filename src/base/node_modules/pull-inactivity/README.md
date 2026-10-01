# pull-inactivity

Abort a pull-stream (duplex or transform) when the rate of throughput gets too low.

This is useful for a p2p protocol where you must manage multiple
connections, aborting connections to unhelpful peers.

## example

``` js
var inactivity = require('pull-inactivity')
var pull = require('pull-stream')
//some sort of p2p system, eg, scuttlebot.
var peer = createPeer()

//create a reliable stream to a remote peer
//i.e. tcp, websockets, or webrtc data channel
var stream = connect(remotePeer)

//create the protocol stream, give a min data rate (megabytes/second)
var peerStream = inactivity(peer.createStream(), 0.001, function (err) {
  //this cb is triggered when stream is aborted.
  console.log('disconnected')
})

pull(stream, peerStream, stream)
```

## example - transform

if you have a normal source, transform, sink pipeline,
you can use `pull-inactivity` with that too.

``` js
var inactivity = require('pull-inactivity')
var pull = require('pull-stream')

pull(
  source,
  transform,
  inactivity.through(0.01, function (err) {
    console.log('stream ended')
  }),
  sink
)


```



## License

MIT
