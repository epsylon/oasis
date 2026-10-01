module.exports = function series (continuables, callback) {
  if('function' === typeof continuables)
    return series([].slice.call(arguments))

  if (callback) {
    next(callback)
  } else {
    return next
  }

  function next (callback) {
    continuables.shift() (function (err, value) {
      if (err || !continuables.length)
        return callback(err, value)
      next (callback)
    })
  }
}
