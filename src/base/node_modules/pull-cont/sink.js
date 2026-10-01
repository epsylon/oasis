
module.exports = function (cont) {
  return function (read) {
    cont(function again (err, value) {
      if(err) read(err, function () {
        value(function (abort, cb) { cb(err) })
      })
      else value(read)
    })
  }
}

