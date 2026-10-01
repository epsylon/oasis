
var endable = require('./endable')
var pull = require('pull-stream')
module.exports = function (stream, goodbye) {
  goodbye = goodbye || 'GOODBYE'
  var e = endable(goodbye)

  return {
    // when the source ends,
    // send the goodbye and then wait to recieve
    // the other goodbye.
    source: pull(stream.source, e),
    sink: pull(
      //when the goodbye is received, allow the source to end.
      pull.filter(function (data) {
        if(data !== goodbye) return true
        e.end()
      }),
      stream.sink
    )
  }

}
