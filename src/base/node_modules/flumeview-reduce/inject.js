var Obv = require('obv')
var Drain = require('pull-stream/sinks/drain')
var Once = require('pull-stream/sources/once')
var path = require('path')
var deepEqual = require('deep-equal')
var Notify = require('pull-notify')
var AsyncSingle = require('async-single')

/*
Replication Ideas.

//value is skipped if seq is the same. or value option is false, or max > 
getState({seq, value}, cb(null, {seq: _seq, value: value}))

*/

function isEmpty (o) {
  if(o == null) return
  for(var k in o) return false
  return true
}

function isObject (o) {
  return o && 'object' === typeof o
}

function isFunction (f) {
  return 'function' === typeof f
}

function id (e) { return e }

module.exports = function (Store) {
return function (version, reduce, map, codec, initial, writeInterval = null) {
  var opts
  if(isObject(reduce)) {
    opts = reduce
    reduce = opts.reduce
    map = opts.map
    codec = opts.codec
    initial = opts.initial
  }
  else opts = {}
  //timers for updating the state file.
  //always wait min ms after a write,
  //up to max since first write?
  opts.min = opts.min || 100
  opts.max = opts.max || 500


  if(isFunction(version))
    throw new Error('version must be a number')

  map = map || id
  var notify = Notify()
  return function (log, name) { //name is where this view is mounted
    var acc, since = Obv()
    var value = Obv(), state

    //if we are in sync, and have not written recently, then write the current state.

    // if the log is persisted,
    // then also save the reduce state.
    // save whenever the view gets in sync with the log,
    // as long as it hasn't beet updated in 1 minute.


    var w = AsyncSingle(function (value, cb) {
      if(state) {
        if(value) state.set(value, cb)
        else state.destroy(cb)
      } else cb()
    }, opts)

    function write () {
      w.write({
        seq: since.value,
        version: version,
        value: value.value
      })
    }

    //depending on the function, the reduction may not change on every update.
    //but currently, we still need to rewrite the file to reflect that.
    //(or accept that we'll have to reprocess some items)
    //might be good to have a cheap way to update the seq. maybe put it in the filename,
    //so filenames monotonically increase, instead of write to `name~` and then `mv name~ name`

    if(log.filename) {
      var dir = path.dirname(log.filename)
      state = Store(dir, name, codec)
      state.get(function (err, data) {
        if(err || data == null || isEmpty(data) || data.version !== version) {
          since.set(-1) //overwrite old data.
          value.set(initial)
        }
        else {
          value.set(data.value)
          since.set(data.seq)
        }
      })
    }
    else {
      write = function (){}
      since.set(-1)
      value.set(initial)
    }

    let closeStream = () => {}

    return {
      since: since,
      value: value,
      methods: {get: 'async', stream: 'source', value: 'sync'},
      get: function (opts, cb) {
        if('function' === typeof opts) {
          cb = opts, opts = null
        }
        if(!opts || isEmpty(opts))
          cb(null, value.value)
        else if(isObject(opts)) {
          since.once(function (v) {
            //ways to call:
            //check seq => seq, version, size
            //get seq,value => seq, version, value
            cb(null,
              opts.values === false ? {seq: v, version: version, size: state && state.size || null}
            : opts.meta === false ? value.value
            : {seq: v, version: version, value: value.value}
            )
          })
        }
      },
      stream: function (opts) {
        opts = opts || {}
        //todo: send the HASH of the value, and only resend it if it is different!
        if(opts.live !== true)
          return Once(value.value)
        var source = notify.listen()
        //start by sending the current value...
        source.push(value.value)
        return source
      },
      createSink: function (cb) {
        closeStream = cb;
        let count = 0
        return Drain(function (data) {
          var _data = map(data.value, data.seq)
          if(_data != null) value.set(reduce(value.value, _data, data.seq))
          since.set(data.seq)
          notify(_data)

          // If we are now in sync with the log, write.
          const inSyncWithLog = since.value === log.since.value

          // Alternatively, write every 10,000 messages.
          const periodicWrite = writeInterval && count % writeInterval == 0

          if(inSyncWithLog || periodicWrite) {
            write()
          }

          count += 1
        }, cb)
      },
      destroy: function (cb) {
        value.set(initial)
        since.set(-1)
        w.write(initial)
        closeStream()
        w.close(cb)
      },
      close: function (cb) {
        notify.abort(true)
        if(!since.value || !state) return cb()
        w.close(cb)
      }
    }
  }
}}


