
module.exports = function (async, opts) {
  opts = opts || {}
  delay = opts.setTimeout || setTimeout
  var self, timer, ts = 0, cb
  function write (_value, timeout) {
    self.value = _value
    clearTimeout(timer)
    timer = delay(function () {
      if(self.writing) return
      self.writing = true
      self.value = null
      async(_value, function () {
        ts = Date.now()
        self.writing = false
        if(self.value) //write again
          write(self.value, cb ? 0 : null)
        else {
          self.onDrain && self.onDrain()
          if(cb) {
            var _cb = cb; cb = null; _cb()
          }
        }
      })
    },
      timeout == null
      ? Math.max(
          (opts.min || 200),
          (opts.max || 60e3) - (Date.now() - ts)
        )
      : timeout
    )
  }
  return self = {
    writing: false,
    write: write,
    close: function (_cb) {
      if(!self.writing && self.value == null)
        _cb()
      else {
        cb = _cb
        if(self.value) write(self.value, 0)
      }
    }
  }
}

/*
this example is expanded from simple/closures
to be also able to remember not fire too frequently.

also, delays the next write. It's getting pretty ugly now.
but the tests are pretty good.

*/


