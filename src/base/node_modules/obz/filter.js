const observer = require('./')

module.exports = function filter (observ, test) {
  const obv = observer()
  observ(function (_value) {
    if (test(_value)) obv.set(_value)
  })

  return obv
}

module.exports = function filter (observ, test) {
  return function (ready) {

  }
}
