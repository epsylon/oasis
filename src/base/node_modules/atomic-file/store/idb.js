const IdbKvStore = require('idb-kv-store')

module.exports = function (file, suffix, isBuffer) {
  const parts = file.split('/')
  const key = parts.pop()
  const storename = parts.join('/')
  const store = new IdbKvStore(storename, { disableBroadcast: true })
  return {
    set: function (value, cb) {
      store.set(key, isBuffer ? value.toString('base64') : value , cb)
    },
    get: function (cb) {
      store.get(key, function (err, value) {
        if(err) cb(err)
        else if(!value) cb(new Error('not found'))
        else cb(null, value && (isBuffer ? Buffer.from(value, 'base64') : value))
      })
    },
    destroy: function (cb) {
      store.remove(key, cb)
    }
  }
}




















