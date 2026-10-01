
# statistics

a reduce function that calculates mean and standard deviation in one pass


I first wrote this module a long long time ago, and i used an object oriented
api. Today I needed to serialize a stats output to JSON, and then later parse it,
and keep using it. Continuing to use an OO api would mean a bunch of glue code,
so I rewrote it as a reduce function.

## example

``` js
var stats = require('statistics')

console.log([1,2,3].reduce(stats))
=> {
  mean: 2,
  stdev: 0.8164965809277263,
  count: 3,
  sum: 6,
  sqsum: 14
}
```
you probably only want to have the mean and stdev, the other fields are necessary for the reduce
function however.

## mutating reduce: require('statistics/mutate')

sometimes, a mutating reduce is prefured. this eases garbage collection,
and allows you to maintain a reference to an updating value.

otherwise the api is the same.

## functional is better than object oriented

statistics@2 and earlier used an object oriented api, but then I needed to serialize and parse a stats
object and keep using it. That was incredibly easy with a reduce function, but would have meant
a bunch of ugly glue code with OO.

## LICENSE

MIT
