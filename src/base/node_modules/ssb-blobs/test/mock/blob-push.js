const Obz = require('obz')
const debug = require('debug')('ssb-blobs')

module.exports = function (async) {
  debug(async)

  const state = {}
  const isReady = Obz()
  const updates = Obz()

  setTimeout(() => {
    updates.set({})
    isReady.set(true)
  }, 300)

  return {
    updates,
    onReady (fn) {
      if (isReady.value === true) return fn()

      isReady.once(fn)
    },
    add: async(function (key, cb) {
      if (!(key in state)) updates.set({ [key]: true })
      state[key] = true
      cb && async(cb)()
    }),
    remove: async(function (key, cb) {
      delete state[key]
      cb && async(cb)()
    })
  }
}
