# split-buffer

split a buffer into sections with a max length.

# example

``` js
var split = require('split-buffer')

var buffers = split(buffer, M)
```

`split` returns an array of buffers,
if `buffer.length <= M` it returns `[buffer]`. 

If `buffer.length > M` it returns `ceil(buffer.length/M)`,
all but the last buffer will have length `M` and the last buffer
will have length `buffer.length%M`.

`split-buffer` uses `Buffer#slice` so all buffers still refer
to the same memory as the original buffer.

## License

MIT
