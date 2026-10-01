'use strict'

var looper = require('pull-looper')

module.exports = function (push, cb) {
  var reading = false, ended, read
  while(push.source) push = push.source

  var adapter = push.source = {
    resume: more,
    paused: false,
    abort: function (err) {
      ended = err || true
      if(read)
        read(ended, function (err) {
          if(!push.ended) push.end(err)
        })
    }
  }

  function more () {
    if(reading) return
    if(!(adapter.paused = push.paused)) {
      reading = true
      read(null, function next (err, data) {
        reading = false
        if(err && err !== true) {
          if(!push.ended)
            push.end(ended = err)
        } else {
          //if the push-stream has already ended, abort the source.
          if(push.ended) {
            if(!err) read(push.ended, function () {})
            return
          }
          if(err) push.end(err)
          else push.write(data)
          if(push.ended && !err) return read(push.ended, cb || function () {})
          if(!push.paused && !err && !reading) more()
        }
      })
    }
  }

  return function (_read) {
    read = looper(_read)
    if(!push.paused && !ended) more()
  }
}


