# continuable-series

given an array of continuables return a continuable that executes them in series.

[![travis](https://travis-ci.org/dominictarr/continuable-series.png?branch=master)
](https://travis-ci.org/dominictarr/continuable-series)

[![testling](http://ci.testling.com/dominictarr/continuable-series.png)
](http://ci.testling.com/dominictarr/continuable-series)

see [continuable](https://github.com/Raynos/continuable)

## Example

``` js
series([
  continuable1,
  continuable2,
  continuable3,
]) (function (err, lastValue) {
  //...
})

```

## Passing in a callback as second argument

`series` also works as a "normal" async function

``` js
series([
  continuable1,
  continuable2,
  continuable3,
], function (err, lastValue) {
  //...
})
```

## License

MIT
