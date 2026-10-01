
function id (e) { return e }

module.exports = function (get, LocalStore, estimate) {
  //default strategy for deciding wether to stream the log
  //or to rerequest the current state depends on the size of
  //the stored state, assuming we are using flumelog-offset,
  //the difference in offsets is less than the size of the object
  //then we should stream. (if a view is quite large, this
  //may save lots of bandwidth for small updates)
  estimate = id
  return function (dir, name, codec) {
    var local = LocalStore(dir, name, codec)
    return {
      get: function (cb) {
        local.get(function (_, data) {
          if(!data)
            return update()

          get({values: false, meta: true}, function (_, meta) {
            if (data.seq === meta.seq)
              cb(null, data) //use local data.
            //decide whether to replicate view or stream
            //if the size to stream the data is smaller
            //than the size of the snapshot, then stream it.
            else if(estimate(data.since) - estimate(local.since)  < data.size)
              cb(null, data)
            else
              update()
          })
          function update () {
            get({values: true, meta: true}, function (err, _data) {
              if(err || !_data) cb(null, data)
              local.set(_data, function () { cb(err, _data) })
            })          }

        })
      },
      set: local.set
    }
  }
}

