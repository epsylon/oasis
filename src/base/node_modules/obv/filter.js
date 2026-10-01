var observer = require('./')

module.exports = function filter (observ, test) {
  var obv = observer()
  var listeners = []
  var rm = observ(function (_value) {
    if(test(_value)) obv.set(_value)
  })

  return obv
}

module.exports = function filter(observ, test) {

  return function (ready) {
    
  }

}



