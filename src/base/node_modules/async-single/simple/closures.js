
module.exports = function (async, delay) {
  delay = delay || setTimeout
  var self, timer
  return self = {
    writing: false,
    write: function (_value) {
      (function flush (_value) {
        if(self.writing) return
        self.writing = true
        self.value = null
        async(_value, function () {
          self.writing = false
          if(self.value) //write again
            flush(self.value)
          else
            self.onDrain && self.onDrain()
        })
      })(self.value = _value)
    }
  }
}

/*
at just 21 lines this is the smallest by far.
but it's very dense. Okay it was actually more like 28
then i compacted it a bit. normally I wouldn't use
self.property but it was easier to test if some state
was exposed.

there are some basic patterns here:

```
if(writing) return
writing = true

...(..., function () {
  writing = false
})
```

make sure we do not enter ... until we are out of that section.

```
var _value = value; value = null
func(_value)
```
unset a state value before using it, this is useful because
you know that func cannot use `value` (btw, this was all you
needed to prevent the DAO hack!)

if the change is increment instead of assign null
this operation is very terse: `func(++value)` a pity
a similar operation doesn't exist for assignment!

recursive self-evaluating function.

```
;(function flush () {
  ...
  flush()
})()
```

One thing I like about this pattern is that you know flush
is never called from outside itself. It can't be because
nothing else can refer to it! nothing else can see the name
"flush"
*/






