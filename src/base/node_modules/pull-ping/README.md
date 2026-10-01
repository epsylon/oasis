# pull-ping

have a server and a client ping/pong each other

the server and client are symmetrical.
first the client pings the server,
then the server pings the client.
this means both can measure keep the connection alive,
and clock skew correctly, which is sure to be useful at some point.

``` js

var ping = require('pull-ping-pong')
var toPull = require('stream-to-pull-stream')

net.createServer(function (stream) {
  stream = toPull.duplex(stream)
  pull(
    stream,
    ping({timeout: 10e3}), //ping every 10 seconds
    stream
  )
}).listen(1234, function () {

  var stream = toPull.duplex(net.connect(1234))

  pull(
    stream,
    //ping every 10 seconds, set 'serve' to true to begin the ping.
    ping({timeout: 10e3, serve: true}),
    stream
  )

  setInterval(function () {
    //check rtt and skew to get statistics about the connection
    console.log(stream.rtt.mean, stream.skew.mean)
  }, 1000)

})

```

## api

### ping({timeout: ms, serve: boolean}) => Duplex pull-stream

`timeout` is the number of milliseconds. the default is 5 minutes,
although the first ping will happen immediately.

set `serve` to true on one side of connection, this starts the ping pong.
"serve" is ment in the (table) tennis sense, I set it on the client.

### stream.rtt, stream.skew

Statistics on the round trip time and clock skew will be set on the
stream object. These are instances of [statistics](https://www.npmjs.com/package/statistics)

## License

MIT

