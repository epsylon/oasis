const pull = require('../server/node_modules/pull-stream')
const moment = require('../server/node_modules/moment')
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler }) => {
  let ssb
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb }

  return {
    type: 'bookmark',

    async createBookmark(url, tagsRaw, description, category, lastVisit) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      let tags = Array.isArray(tagsRaw) ? tagsRaw.filter(t => t) : tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
      const isInternal = url.includes('127.0.0.1') || url.includes('localhost')
      if (!tags.includes(isInternal ? 'internal' : 'external')) {
        tags.push(isInternal ? 'internal' : 'external')
      }
      const formattedLastVisit = lastVisit
        ? moment(lastVisit, moment.ISO_8601, true).toISOString()
        : moment().toISOString()
      const content = {
        type: 'bookmark',
        author: userId,
        url,
        tags,
        description,
        category,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastVisit: formattedLastVisit,
        opinions: {},
        opinions_inhabitants: []
      }
      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => err ? reject(new Error("Error creating bookmark: " + err.message)) : resolve(res))
      })
    },

    async listAll(author = null, filter = 'all') {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const results = await new Promise((res, rej) => {
        pull(
          ssbClient.createLogStream({ limit: logLimit }),
          pull.collect((err, msgs) => err ? rej(err) : res(msgs))
        )
      })
      const tombstoned = new Set(
        results
          .filter(m => m.value.content?.type === 'tombstone')
          .map(m => m.value.content.target)
      )
      const replaces = new Map()
      const latest = new Map()
      for (const m of results) {
        const k = m.key
        const c = m.value.content
        if (!c || c.type !== 'bookmark') continue
        if (tombstoned.has(k)) continue
        if (c.replaces) replaces.set(c.replaces, k)
        latest.set(k, {
          id: k,
          url: c.url,
          description: c.description,
          category: c.category,
          createdAt: c.createdAt,
          lastVisit: c.lastVisit,
          tags: c.tags || [],
          opinions: c.opinions || {},
          opinions_inhabitants: c.opinions_inhabitants || [],
          author: c.author
        })
      }
      for (const oldId of replaces.keys()) {
        latest.delete(oldId)
      }
      let bookmarks = Array.from(latest.values())
      if (filter === 'mine' && author === userId) {
        bookmarks = bookmarks.filter(b => b.author === author)
      } else if (filter === 'external') {
        bookmarks = bookmarks.filter(b => b.tags.includes('external'))
      } else if (filter === 'internal') {
        bookmarks = bookmarks.filter(b => b.tags.includes('internal'))
      }
      return bookmarks
    },

    async updateBookmarkById(bookmarkId, updatedData) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const old = await new Promise((res, rej) =>
        ssbClient.get(bookmarkId, (err, msg) =>
          err || !msg?.content ? rej(err || new Error("Error retrieving old bookmark.")) : res(msg)
        )
      )
      if (Object.keys(old.content.opinions || {}).length > 0) {
        throw new Error('Cannot edit bookmark after it has received opinions.')
      }
      const tags = updatedData.tags
        ? updatedData.tags.split(',').map(t => t.trim()).filter(Boolean)
        : []
      const isInternal = updatedData.url.includes('127.0.0.1') || updatedData.url.includes('localhost')
      if (!tags.includes(isInternal ? 'internal' : 'external')) {
        tags.push(isInternal ? 'internal' : 'external')
      }
      const formattedLastVisit = updatedData.lastVisit
        ? moment(updatedData.lastVisit, moment.ISO_8601, true).toISOString()
        : moment().toISOString()
      const updated = {
        type: 'bookmark',
        replaces: bookmarkId,
        author: old.content.author,
        url: updatedData.url,
        tags,
        description: updatedData.description,
        category: updatedData.category,
        createdAt: old.content.createdAt,
        updatedAt: new Date().toISOString(),
        lastVisit: formattedLastVisit,
        opinions: old.content.opinions,
        opinions_inhabitants: old.content.opinions_inhabitants
      }
      return new Promise((resolve, reject) => {
        ssbClient.publish(updated, (err2, res) => err2 ? reject(new Error("Error creating updated bookmark.")) : resolve(res))
      })
    },

    async deleteBookmarkById(bookmarkId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const msg = await new Promise((res, rej) =>
        ssbClient.get(bookmarkId, (err, m) => err ? rej(new Error("Error retrieving bookmark.")) : res(m))
      )
      if (msg.content.author !== userId) throw new Error("Error: You are not the author of this bookmark.")
      const tombstone = {
        type: 'tombstone',
        target: bookmarkId,
        deletedAt: new Date().toISOString(),
        author: userId
      }
      return new Promise((resolve, reject) => {
        ssbClient.publish(tombstone, (err2, res) => {
          if (err2) return reject(new Error("Error creating tombstone."))
          resolve(res)
        })
      })
    },

    async getBookmarkById(bookmarkId) {
      const ssbClient = await openSsb()
      return new Promise((resolve, reject) => {
        ssbClient.get(bookmarkId, (err, msg) => {
          if (err || !msg || !msg.content) return reject(new Error("Error retrieving bookmark"))
          const c = msg.content
          resolve({
            id: bookmarkId,
            url: c.url || "Unknown",
            description: c.description || "No description",
            category: c.category || "No category",
            createdAt: c.createdAt || "Unknown",
            updatedAt: c.updatedAt || "Unknown",
            lastVisit: c.lastVisit || "Unknown",
            tags: c.tags || [],
            opinions: c.opinions || {},
            opinions_inhabitants: c.opinions_inhabitants || [],
            author: c.author || "Unknown"
          })
        })
      })
    },

    async createOpinion(bookmarkId, category) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      return new Promise((resolve, reject) => {
        ssbClient.get(bookmarkId, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'bookmark') return reject(new Error('Bookmark not found'))
          if (msg.content.opinions_inhabitants?.includes(userId)) return reject(new Error('Already voted'))
          const updated = {
            ...msg.content,
            replaces: bookmarkId,
            opinions: {
              ...msg.content.opinions,
              [category]: (msg.content.opinions?.[category] || 0) + 1
            },
            opinions_inhabitants: [...(msg.content.opinions_inhabitants || []), userId],
            updatedAt: new Date().toISOString()
          }
          ssbClient.publish(updated, (err3, result) => err3 ? reject(err3) : resolve(result))
        })
      })
    }
  }
}

