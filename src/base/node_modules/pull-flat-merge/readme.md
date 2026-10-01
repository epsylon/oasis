# pull flat merge

A transform that takes a stream of streams and emits their values, in the order they arrive. This is in contrast to `.flatten`, which keeps the original order.

## example

join:

```js
var test = require('tape')
var S = require('pull-stream')
var join = require('pull-flat-merge')

test('flat merge', function (t) {
    t.plan(2)
    var ss = S.values([
        S.values([1,2,3]),
        S.values(['a', 'b', 'c'])
    ])

    S(
        ss,
        join(),
        S.collect(function (err, evs) {
            t.error(err)
            t.deepEqual(evs, [1,'a',2,'b',3,'c'], 'should emit the events')
        })
    )
})
```

chain:

```js
// this is equivalent to `map` followed by `join` 
var S = require('pull-stream')
var chain = require('pull-flat-merge/chain')

S(
    S.values([1,2,3]),
    chain(function (n) {
        return S.once(n)
    }),
    S.log()
)
```

