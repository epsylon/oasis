
var tape = require('tape')
var v = require('../')

var data = require('ssb-validation-dataset')

const isObject = (subject) => typeof subject === 'object' && subject != null && Array.isArray(subject) === false

data.forEach(function (e, i) {
  var state = { feeds: {}, queue: [] }
  if (isObject(e.message)) {
    if (isObject(e.state)) {
      e.state.queue = []
    }
    state.feeds[e.message.author] = e.state
  }
  if (e.valid) {
    tape(`Message ${i} is valid`, function (t) {
      try {
        t.equal(v.id(e.message), e.id)
        v.append(state, e.hmacKey, e.message)
      } catch (err) {
        console.log(e)
        t.fail(err)
      }
      t.end()
    })
  } else {
    tape(`Message ${i} is invalid: ${e.error}`, function (t) {
      var state = { feeds: {}, queue: [] }
      if (isObject(e.message)) {
        state.feeds[e.message.author] = e.state
      }
      t.throws(function () {
        state = v.append(state, e.hmacKey, e.message)
        console.log(e)
      })
      t.end()
    })
  }
})
