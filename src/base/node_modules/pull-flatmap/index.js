module.exports = function flatmap (fn) {
  var queue = []
  return function (read) {
    return function again (abort, cb) {
      if(abort)        return read(abort, cb)
      if(queue.length) return cb(null, queue.shift())

      read(null, function (err, data) {
        if(err) return cb(err)
        queue = fn(data)
        again(null, cb) //cb or read again if queue is empty.
      })
    }
  }
}
