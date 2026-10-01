var pull = require('pull-stream/pull')
var Through = require('pull-stream/throughs/through')

//up, down * loopback, network, internet

function Sensor (onRate, up) {
  if(!onRate)
    return function (read) { return read }
  return Through(function (data) {
    onRate(data.length, up)
  })
}

module.exports = function Rate (stream, onRate) {
  if(stream.length == 1) //sink
    return pull(Sensor(onRate, true), stream)
  else if(stream.length == 2) //source
    return pull(stream, Sensor(onRate, false))
  else
    return {
      source: Rate(stream.source, onRate), sink: Rate(stream.sink, onRate),
      address: stream.address
    }
}







