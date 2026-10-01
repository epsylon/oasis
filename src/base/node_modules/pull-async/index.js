module.exports = pullAsync

function pullAsync (continuable) {
  var done
  return function (abort, cb) {
    if (abort) return cb(abort)
    if (done) return cb(true)
    continuable(function (err, data) {
      done = true
      cb(err, data)
    })
  }
}
