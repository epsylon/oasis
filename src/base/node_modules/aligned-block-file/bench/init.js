var crypto = require('crypto')

module.exports = function (blocks, n, cb) {
  ;(function next (i) {
    if(i == n) return cb(null, blocks)
    blocks.append(crypto.randomBytes(1024), function (err) {
      if(err) cb(err)
      else next(i + 1)
    })
  })(0)
}

