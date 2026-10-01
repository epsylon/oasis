
var pushable = require('pull-pushable')

module.exports = function () {
  var listeners = []
  var closed = false

  function notify (message) {
    // notify by pushing to all listeners
    for (var i = 0; i < listeners.length; i++) {
      if (closed) return message
      listeners[i].push(message)
    }
    return message
  }

  notify.listen = function () {
    // create listener with `onClose` handler
    var listener = pushable()
    listeners.push(listener)
    return listener
  }

  notify.abort = function (err) {
    // abort by ending all listeners
    closed = true
    while (listeners.length) listeners.shift().end(err)
  }

  notify.end = function () {
    return notify.abort(true)
  }

  return notify
}
