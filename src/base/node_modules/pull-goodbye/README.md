# pull-goodbye

Add a goodbye handshake to a duplex pull-stream.

In a uniplex stream, the end event signifies the end of the stream.
But a duplex stream, it's a little more complicated - there are two paired
streams that may end independently. node's net module has an
[allowHalfOpen](http://nodejs.org/api/net.html#net_new_net_socket_options)
mode, but support for this method is patchy - more often, by default
duplex streams are like a telephone - when one side hangs up, both streams are
terminated. Humans deal with this problem by moving stream termination
into the "application" layer - it's polite to say "goodbye", and to wait to receive
"goodbye" before call termination.

## example

given another duplex stream, wrap it with `pull-goodbye`.
`goodbye(stream, goodbye_message)` takes a duplex stream and a message,
(by default, the string `"GOODBYE"`, this must be encodable whatever codec
the stream uses. The codec should probably be applied outside of `pull-goodbye`

``` js
var goodbye = require('pull-goodbye')
var serializer = require('pull-serializer')

//a duplex stream from somewhere...
var duplex = whatever.createStream()

return serializer(goodbye(duplex, 'GoodBye'))
```

## License

MIT
