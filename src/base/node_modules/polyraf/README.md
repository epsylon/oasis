# polyraf

like rafify, but uses either [random-access-file](https://github.com/random-access-storage/random-access-file/) if running in node (or electron)
and [random-access-web](https://github.com/random-access-storage/random-access-web) (if running in a browser or similar)

``` js
var PolyRAF = require('polyraf')
var raf = PolyRAF(filename) //and if passed a raf instance

var _raf = PolyRAF(raf) //if called with a raf instance, returns it.
//_raf == raf

//also, keeps the filename as a property (non-standard)
console.log(raf.filename)
```

## License

MIT


