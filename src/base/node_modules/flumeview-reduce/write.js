/*
write after a leading edge but not a falling edge.

*/

function init () {
  return {
    cleanTs: 0,
    dirtyTs: 0,
    queue: false,
    write: false,
    value: null,
    since: -1
  }
}

// Test if now is a good time to write.
// don't write if we are already writing
// don't write if the view is not in sync with log
// don't write if we already wrote in the last minute.
// (note: this isn't stored, so doesn't effect the first write after process starts)

var updaters = {
  maybeWrite: function (state, update) {
    state.dirty = true
    state.dirtyTs = update.ts
    state.queue = false
    state.since = update.since
    state.value = update.value
    if(state.writing || state.ts + 60e3 > ts)
      return {state: state}
    return {state: state, effects: {type: 'queue'}}
  },

  //don't actually start writing immediately.
  //incase writes are coming in fast...
  //this will delay until they stop for 200 ms

  timeout: function (state, ev) {
    if(state.dirtyTs + 200 < ev.ts && state.queue) {
      state.cleanTs = ev.ts
      state.writing = true
      state.dirty = false
      return {state: state, effects: {type: 'write'}}
    }
    return state
  },

  written: function (state) {
    state.writing = false
    if(state.dirty)
      return {state: state, effects: {type: 'queue'}}
    return {state: state}
  },

  close: function (state) {
    if(state.dirty && !state.writing)
      return {state: state, effects: {type: 'write'}}
    return {state: state}
  }
}

module.exports = function (state, version) {
  var int
    //write state
  var wState = init()

  var effects = {
    write: function _write (wState, _, cause) {
      state.set({seq: wState.since, version: version, value: wState.value}, function () {
        cause({type: 'written', ts: Date.now()})
        if(cb && !wState.writing) cb()
      })
    },
    queue: function (_, __, cause) {
      clearTimeout(int)
      int = setTimeout(function () {
        cause({type: 'timeout', ts: Date.now() })
      })
    }
  }

  var cause = Fun(function update(state, event) {
    return (updaters)[event.type](state, event)
  }, function (state, effect, cause) {
    effects[effect.type](state, effect, cause)
  }, state)

  function write (since, value) {
    if(!state) return //purely in memory.
    cause({
      type: 'maybeWrite',
      since: since,
      value: value,
      ts: Date.now()
    })
  }

  write.close = function (cb) {
    cause({type: 'close'})
    if(!wState.writing) cb()
  }

  return write

}

module.exports.updaters = updaters

