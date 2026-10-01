module.exports = function (filter) {
  let value
  let listeners = []
  let listener = null

  function trigger (_value) {
    eventually.value = value = _value
    if (listener) {
      const _listener = listener
      listener = null
      _listener(value)
    } else if (listeners.length) {
      while (listeners.length) { listeners.shift()(value) }
    }
  }

  function eventually (ready) {
    if (value != null) ready(value)
    else if (!listener) listener = ready
    else if (!listeners.length) {
      listeners = [listener, ready]
      listener = null
    } else listeners.push(ready)
  }

  eventually.set = function (_value) {
    if (filter ? filter(value, _value) : true) trigger(_value)
    return eventually
  }

  return eventually
}
