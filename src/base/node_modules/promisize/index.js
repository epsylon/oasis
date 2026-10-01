module.exports = promisize

function promisize (cb) {
  var promise
  var res
  var rej

  if (cb != null && typeof cb !== 'function') throw new Error('cb must be a function')

  if (cb == null && typeof Promise !== 'undefined') {
    promise = new Promise(function (resolve, reject) {
      res = resolve
      rej = reject
    })
  }

  function intercept (err, result) {
    if (promise) {
      if (err) rej(err)
      else res(result)
    } else {
      if (cb) cb(err, result)
      else if (err) throw err
    }
  }

  intercept.promise = promise

  return intercept
}
