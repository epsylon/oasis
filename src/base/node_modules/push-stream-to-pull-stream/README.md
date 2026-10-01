# push-stream-to-pull-stream

wrap a push-stream into a pull-stream, for source, sink, and duplex.

``` js
var toPull = require('push-stream-to-pull-stream')
var Values = require('push-stream/values')

pull(
  toPull.source(new Values([1,2,3])),
  pull.drain(console.log)
)
```

generally, we follow the same api as [stream-to-pull-stream](github.com/pull-stream/stream-to-pull-stream)

## License

MIT

