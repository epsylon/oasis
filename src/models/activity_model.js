const pull = require('../server/node_modules/pull-stream')

module.exports = ({ cooler }) => {
  let ssb

  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open()
    return ssb
  }

  return {
    async listFeed(filter = 'all') {
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      const results = await new Promise((resolve, reject) => {
        pull(
          ssbClient.createLogStream({ reverse: true, limit: 1000 }),
          pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
        )
      })

      const tombstoned = new Set()
      const replaces = new Map()
      const latest = new Map()

      for (const msg of results) {
        const k = msg.key
        const c = msg.value?.content
        const author = msg.value?.author
        if (!c?.type) continue
        if (c.type === 'tombstone' && c.target) {
          tombstoned.add(c.target)
          continue
        }
        if (c.replaces) replaces.set(c.replaces, k)
        latest.set(k, {
          id: k,
          author,
          ts: msg.value.timestamp,
          type: c.type,
          content: c
        })
      }

      for (const oldId of replaces.keys()) {
        latest.delete(oldId)
      }

      for (const t of tombstoned) {
        latest.delete(t)
      }

      let actions = Array.from(latest.values())

      if (filter === 'mine') {
        actions = actions.filter(a => a.author === userId)
      }

      return actions
    }
  }
}

