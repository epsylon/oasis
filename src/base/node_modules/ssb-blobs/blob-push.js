const pull = require('pull-stream')
const pl = require('pull-level')
const Obz = require('obz')

module.exports = function BlobPush (db) {
  const state = {}
  const isReady = Obz()
  const updates = Obz()

  pull(
    pl.read(db, { old: true, live: false }),
    pull.drain(
      (e) => {
        if (e.type === 'del') delete state[e.key]
        else state[e.key] = e.value
      },
      (err) => {
        if (err) throw err

        updates.set(state)
        isReady.set(true)
      }
    )
  )

  pull(
    pl.read(db, { live: true, old: false }),
    pull.drain(e => {
      if (e.type === 'del') delete state[e.key]
      else {
        if (!(e.key in state)) {
          updates.set({ [e.key]: e.value })
        }
        state[e.key] = e.value
      }
    })
  )

  return {
    onReady (fn) {
      if (isReady.value === true) return fn()

      isReady.once(fn)
    },
    updates,
    add (key, cb) {
      db.put(key, -1, cb)
      // why was this set to -1?
      // was this meaning to say "I want this", or track how many we've pushed to?
    },
    remove (key, cb) {
      db.del(key, cb)
    }
  }
}
