
var cp = require('child_process')
var i = 1
console.log('blocksize(k), ms, blocks')
;(function next () {
  if(i < 128) {
    var proc = cp.spawn(process.execPath, [require.resolve('./bench-blocksize.js'), process.argv[2], i++])
    proc.stdout.pipe(process.stdout)
    proc.stderr.pipe(process.stderr)
    //.stdout.pipe(process.stdout)
/   proc.on('exit', next)
  }
})()

