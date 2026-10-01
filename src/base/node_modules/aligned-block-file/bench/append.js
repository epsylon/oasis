
module.exports = function (ABF) {
  var _time = 0
  function log (bytes, time, log) {
    if(log || _time + 1e3 < time) {
      _time = time
      console.log(bytes/1e6, time/1e3, (bytes/1e6)/(time/1e3))
    }
  }

  require('./')(ABF, {
    data: new Buffer.alloc(1024*16),
    time:10e3, size: 100e6,
    onUpdate: log
  }, function (err, size, time) {
    if(err) throw err
    log(size, time, true)
  })

}

if(!module.parent && process.title != 'browser')

module.exports(require('../')(
  '/tmp/bench_aligned-block-file/'+Date.now()+'.blocks'
  , 1024, 'a+'))

