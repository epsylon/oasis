# ssb-sort

sort a collection of messages by their causal order.

A hash can be interpreted as a link,
(except it is _what_ link, not a _where_ link.
Like cinderella's glass slipper, a hash lets you confirm
when you have found a thing, but doesn't clue you in to
where that thing is)

An interesting thing about hashes as links, is that they
always point backwards in time. That is because you can't
know the hash of something you've seen it, or seen evidence of it.
You could make up a random hash - but then the chance that
something with that hash will actually turn up is basically impossible.

This means that hashes represent _causation_, in some sense,

## api

``` js
var sort = require('ssb-sort')
```

all functions will throw if there is a duplicate message in the input.

### `sort (set) => Array`

sort a set (array of unique messages) by causal order,
sorts first by causal order, but if two messages are concurrent,
breaks the tie by their received, then self-stated timestamps, then order by keys.

mutates the original set

### `sort.heads (set) => Array`

returns the most "recent keys" in the set (furtherest down the
causation chain). `sort.heads` is used to calculate the `branch`
property is [patchwork](https://github.com/ssbc/patchwork) threads.

Usually, a single key is returned, but if there have been
[concurrent](https://en.wikipedia.org/wiki/Concurrent_computing)
responses `heads` will return multiple values. If two or more peers
respond while not having the latest messages, (for example because
they are offline, or they respond before all the messages have
reached them)

You can think of "concurrent" as meaning both "at the same time"
or "not knowing about the other".

### `sort.roots (set) => Array`

returns the earliest keys in the set, since this operates
on an arbitary set of messages, there may be more than one root.
but usually you'll select a set by getting messages that point
to a particular root node, in which case this will return one key.

### `sort.missingContext (set) => Object`

with scuttlebutt, it's possible for people to post message simultaneously 
(or even at different times) and not know about other messages that were written.
this method tells you which messages were on 'different branches', 
as in did not know about other messages at the time of writing.

```

    A     // first message
   / \
  B1  B2  // messages which were posted without know about each other
   \ /
    C     // this message was posted and had see B1+B2 (and A)
    |
    D     // most recent message
```

here `sort.missingContext([A, B1, B2, C, D])` returns:

```js
{
  B1.key: [ B2 ],
  B2.key: [ B1 ]
}
```

There are more complicated examples (with diagrams!) in the tests.

## License

MIT


