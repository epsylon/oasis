
function noop () {}

module.exports = function (filter) {
  var value
  function observer (ready) {
    if(value)
      if(ready(value)) return noop
    else
      listener = ready
    return function () {
      if(listener === ready) listener = null
    }
  }

  observer.set = function (value) {
    if(filter(value, _value)) {
      if(listener) listener(value = _value)
    }
  }
}

