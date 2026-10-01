
function reduce (state, ev) {
  if(ev.type == 'init')
    return {
      writing: false,
      value: null
    }
  else if(ev.type == 'write') {
    if(state.writing)
      return {
        writing: true, value: ev.value
      }
    else
      return {
        writing: true, value: null,
        effect: {type: 'write', value: ev.value}
      }
  }
  else if(ev.type == 'cb') {
    if(state.value)
      return {
        writing: true, value: null,
        effect: {type: 'write', value: state.value}
      }
    else
      return {
        writing: false, value: null,
        effect: {type: 'drain'}
      }
  }
  else
    throw new Error('unknown state')
}

module.exports = function (async) {
  var state = reduce(null, {type: 'init'}) //initialize

  var self = {
    writing: state.writing,
    write: function (value) {
      effect(state = reduce(state, {type: 'write', value: value}))
    }
  }

  function effect () {
    var ef = state.effect
    self.writing = state.writing
    if(!ef) return
    state.effect = null
    if(ef.type == 'drain')
      self.onDrain && self.onDrain()
    else if(ef.type === 'write')
      async(ef.value, function () {
        effect(state = reduce(state, {type: 'cb'}))
      })
  }
  return self
}

