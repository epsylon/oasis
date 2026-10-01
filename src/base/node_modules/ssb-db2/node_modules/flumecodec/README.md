# flumecodec

exports encoding/decoding functions for flumedb.

currently, this just reexports level-codec's codecs, but more convienently.

``` js

var OffsetLog = require('flumelog-offset')

var json_log = OffsetLog(file, 1024, require('flumecodec/json'))


```


## License

MIT
