'use strict'

module.exports = function (append) {

  var writing = false, queue = []

  function drain () {
    if(writing || !queue.length) return
    writing = true
    var _queue = queue
    queue = []

    var values = []
    _queue.forEach(function (e) {
      if(Array.isArray(e.value))
        e.value.forEach(function (e) { values.push(e) })
      else values.push(e.value)
    })

    append(values, function (err, max) {
      writing = false
      for(var i in _queue) _queue[i].cb(err, max)

      drain() //if there is more to write, write it.
    })
  }


  function write (value, cb) {
    queue.push({value: value, cb: cb}); drain()
  }

  return write

}


