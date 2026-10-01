var Flume = require('flumedb')
var FlumelogOffset = require('flumelog-offset')

var file = '/tmp/test_flumeview-reduce/initial_'+Date.now()+'/log.offset'

require('./')(
function create () {
  return Flume(FlumelogOffset(file, {block: 1024, codec: require('flumecodec/json')}))
})



