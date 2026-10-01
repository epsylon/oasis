module.exports = function (since, getMeta) {
  return function (cursor, live, reverse, format, test, cache) {
    if(!format)
      format = function (_, value) { return value }

    return function (abort, cb) {
      if(abort) return cb(abort)

      if(test && cursor != null && !test(cursor))
        return cb(true)

      since.once(function (_offset) {
        if(cursor == null)
          cursor = _offset

        if(cursor < 0 && reverse)
          cb(true)
        else if(cursor <= _offset)
          next()
        else if(live)
          since.once(next, false)
        else
          cb(true) //end of the stream

        function next () {
          getMeta(cursor, cache, function (err, value, prev, next) {
            //this should also handle ended state.
            if(err) return cb(err)
            var _cursor = cursor
            cursor = reverse ? prev : next
            cb(null, format(_cursor, value))
          })
        }
      })
    }
  }
}

