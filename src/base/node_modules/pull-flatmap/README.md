# pull-flatmap

flatmap for pull-streams

map an input to an array, but the items in those arrays become the stream.
so you can use this module to make expanding or contracting streams.

taken from example on [introduction to pull-streams](http://dominictarr.com/post/149248845122/pull-streams-pull-streams-are-a-very-simple)

## example

``` js
var pull = require('pull-stream')
pull(
  pull.values([1,2,3]),
  flatmap(function (n) {
    //return an array of n n's [2,2] or [3,3,3], etc
    return new Array(n).map(function () { return n })
  }),
  pull.collect(function (err, ary) {
    if(err) throw err
    console.log(ary)
  })
)
```
output:
```
[1, 2, 2, 3, 3, 3]
```

## License

MIT






