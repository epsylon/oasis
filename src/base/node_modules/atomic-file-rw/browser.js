// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: MIT

const IdbKvStore = require('idb-kv-store')

function getStoreAndKey(filename) {
  const parts = filename.split('/')
  const key = parts.pop()
  const storename = parts.join('/')
  const store = new IdbKvStore(storename, { disableBroadcast: true })
  return { store, key }
}

function isUint8Array(value) {
  return toString.call(value).indexOf('Uint8Array') !== -1
}

module.exports = {
  readFile: function(filename, opts, cb) {
    if (!cb) cb = opts
    const { store, key } = getStoreAndKey(filename)
    const storeGet = store.get.bind(store)
    storeGet(key, (err, value) => {
      if (err) return cb(err)
      else cb(null, isUint8Array(value) ? Buffer.from(value) : value)
    })
  },
  writeFile: function(filename, value, opts, cb) {
    if (!cb) cb = opts

    const { store, key } = getStoreAndKey(filename)
    return store.set.bind(store)(key, value, cb)
  },
  deleteFile: function(filename, cb) {
    const { store, key } = getStoreAndKey(filename)
    store.remove(key, cb)
  }
}
