module.exports = function Obz (filter) {
  let value = null
  const listeners = []
  let oncers = []

  function trigger (nextValue) {
    value = nextValue
    let length = listeners.length
    for (let i = 0; i < length && value === nextValue; i++) { // eslint-disable-line
      const listener = listeners[i]
      if (listener(value) === false) {
        listeners.splice(i, 1)
        i--
        length--
      }
      if (listeners.length !== length) {
        // something was removed
        length = listeners.length
        if (listener !== listeners[i]) {
          // we removed an earlier listener, must decrement i also
          i -= 1
        }
      }
    }
    // decrement from length, in case an immediately
    // listener is added during a trigger
    let oncersLen = oncers.length
    const oldOncers = oncers
    oncers = []
    while (oncersLen-- && nextValue === value) { // eslint-disable-line
      oldOncers.shift()(value)
    }
  }

  function obz (listener, immediately) {
    let i = listeners.push(listener) - 1
    if (value !== null && immediately !== false) {
      if (listener(value) === false) {
        remove()
        return function noop () {}
      }
    }
    function remove () {
      // manually remove...
      // fast path, will happen if an earlier listener has not been removed.
      if (listeners[i] !== listener) i = listeners.indexOf(listener)
      if (i >= 0) listeners.splice(i, 1)
    }
    return remove
  }

  obz.set = function set (nextValue) {
    if (filter ? filter(value, nextValue) : true) {
      trigger((obz.value = nextValue))
    }
    return obz
  }

  obz.once = function once (oncer, immediately) {
    if (value !== null && immediately !== false) {
      oncer(value)
      return function noop () {}
    } else {
      let i = oncers.push(oncer) - 1
      return function remove () {
        if (oncers[i] !== oncer) i = oncers.indexOf(oncer)
        if (i >= 0) oncers.splice(i, 1)
      }
    }
  }

  return obz
}
