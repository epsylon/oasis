# map-merge

deep merge two objects with a rule.
A new object is always returned.

I fear this may be a haskelly thing,
I suspect it might be an applicative functor.

almost the same module as [deep-merge](https://npm.im/deep-merge) but not quite.

## Example

``` js

var merge = require('map-merge')

merge(a, b, function (av, bv) {
  //use the value from b if a's corrisponding value is null/undefined
  return bv == null ? av : bv
  // btw, this is the default merge rule.
})

```

## Objects {}

objects are merged by their keys,
first all the keys in the left object are added,
then any keys in the right object which are not in the left.

This determins the order the keys appear in.

``` js
var merge = require('map-merge')

var a = {
  a: 'apple',
  b: 'banana',
  d: 'durian'
}
var b = {
  b: 'banana',
  c: 'cherry'
  e: 'elderberry'
}

var c = merge(a, b)
```

the order of the keys in `c` will depend on the order in a and b
``` js

{
  a: 'apple',
  b: 'banana',
  d: 'durian',
  c: 'cherry',
  e: 'elderberry'
}

```

## License

MIT
