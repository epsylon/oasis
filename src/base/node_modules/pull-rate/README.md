# pull-rate

track the rate of flow of a pull-stream.

``` js
var Rate = require('pull-rate')
var bytes = 0
pull(
  Rate(source, function (length) { bytes += length }),
  ...
)
```

## License

MIT
