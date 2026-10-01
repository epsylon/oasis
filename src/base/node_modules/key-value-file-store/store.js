
function isEmpty (o) {
  for(var k in o) return false
  return true
}
module.exports = function (read, write, del) {

  var store = {}, dirty = {}, reading = {}, writing = false, waiting = []

  //this writes only once at a time.
  //at least, we want it to write at most once per file.
  //or maybe if it's written recently then wait.
  //anyway, this is good enough for now.

  function apply_write (key, value, err) {
    var _reading = reading[key]
    reading[key] = null
    while(_reading && _reading.length)
      _reading.shift()(err, value)
    _write()
  }

  function _write () {
    if(writing) return
    var d = 0
    //note, only one key is written at a time.
    for(var k in dirty) {
      if(dirty[k]) {
        dirty[k] = false
        writing = true
        var val = store[k]
        if (val === void 0) {
          return del(k, function (err) {
            writing = false
            _write()
          })
        } else {
          return write(k, val, function (err) {
            writing = false
            _write()
          })
        }
      }
    }
    //if we wrote something, we returned.
    //so clear todo list and fire listeners.
    dirty = {}
    while(waiting.length)
      waiting.shift()()
  }

  function has (key) {
    return store[key] !== undefined
  }
  var self
  return self = {
    has: has,
    ensure: function (key, cb) {
      if(has(key)) cb(null, store[key])
      else if(reading[key])
        reading[key].push(cb)
      else {
        var cbs = reading[key] = [cb]
        read(key, function (err, value) {
          //unusual, but incase someone overwrites the value
          //while we are reading. see apply_write
          if(cbs !== reading[key]) return

          apply_write(key, store[key] = value, err)
        })
      }
    },
    get: function (key, cb) {
      if(cb) self.ensure(key, cb)
      else return store[key]
    },
    //if set is called during a read,
    //cb the readers immediately, and cancel the current read.
    set: function (key, value) {
      store[key] = value
      //not urgent, but save this if we are not doing anything.
      dirty[key] = true
      apply_write(key, value)
    },
    delete: function (key) {
      store[key] = void 0
      //not urgent, but save this if we are not doing anything.
      dirty[key] = true
      apply_write(key, void 0)
    },
    onDrain: function (cb) {
      if(isEmpty(dirty)) cb()
      else waiting.push(cb)
    }
  }
}





