

module.exports = function (blocks, opts, cb) {

  var start = Date.now()
  blocks.offset.once(function (v) {
    ;(function next () {
      blocks.append(opts.data, function (err) {
        if(err) return cb(err)
        var time = Date.now()-start
        opts.onUpdate && opts.onUpdate(blocks.offset.value, time)
        if(time > opts.time || blocks.offset.value > opts.size)
          cb(null, blocks.offset.value, time)
        else
          next()
      })
    })()
  })
}





