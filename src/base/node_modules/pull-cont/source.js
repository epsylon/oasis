'use strict'
function isFunction (f) {
  return 'function' === typeof f
}
function isContinuable (c) {
  return isFunction(c) && c.length === 1
}
function isSource (s) {
  return isFunction(s) && s.length === 2
}

module.exports = function (continuable) {
  var read = null
  return function (abort, cb) {
    if(read) return read(abort, cb)
    if(abort) return cb(abort)

    continuable(function again (err, value) {
      if(err) return cb(err)
      if(isSource(value)) (read = value)(abort, cb) //if it's a source... then read from it
      else if(isContinuable(value)) value(again) //if it's another continuable... then continue
      else throw new Error('not a valid source stream or continuable')
    })
  }
}










