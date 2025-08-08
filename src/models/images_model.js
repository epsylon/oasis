const pull = require('../server/node_modules/pull-stream')
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler }) => {
  let ssb
  let userId

  const openSsb = async () => {
    if (!ssb) {
      ssb = await cooler.open()
      userId = ssb.id
    }
    return ssb
  }

  return {
    async createImage(blobMarkdown, tagsRaw, title, description, meme) {
      const ssbClient = await openSsb()
      const match = blobMarkdown?.match(/\(([^)]+)\)/)
      const blobId = match ? match[1] : blobMarkdown
      const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []
      const content = {
        type: 'image',
        url: blobId,
        createdAt: new Date().toISOString(),
        author: userId,
        tags,
        title: title || '',
        description: description || '',
        meme: !!meme,
        opinions: {},
        opinions_inhabitants: []
      }
      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res))
      })
    },

    async updateImageById(id, blobMarkdown, tagsRaw, title, description, meme) {
      const ssbClient = await openSsb()
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, oldMsg) => {
          if (err || !oldMsg || oldMsg.content?.type !== 'image') return reject(new Error('Image not found'))
          if (oldMsg.content.author !== userId) return reject(new Error('Not the author'))
          const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : oldMsg.content.tags
          const match = blobMarkdown?.match(/\(([^)]+)\)/)
          const blobId = match ? match[1] : blobMarkdown
	  const updated = {
	    ...oldMsg.content,
	    replaces: id,
	    url: blobId || oldMsg.content.url,
	    tags,
	    title: title ?? oldMsg.content.title,
	    description: description ?? oldMsg.content.description,
	    meme: meme != null ? !!meme : !!oldMsg.content.meme,
	    updatedAt: new Date().toISOString()
	  }
          ssbClient.publish(updated, (err2, result) => err2 ? reject(err2) : resolve(result))
        })
      })
    },

    async deleteImageById(id) {
      const ssbClient = await openSsb()
      const author = ssbClient.id
      const getMsg = (mid) => new Promise((resolve, reject) => {
        ssbClient.get(mid, (err, msg) => err || !msg ? reject(new Error('Image not found')) : resolve(msg))
      })
      const publishTomb = (target) => new Promise((resolve, reject) => {
        ssbClient.publish({
          type: 'tombstone',
          target,
          deletedAt: new Date().toISOString(),
          author
        }, (err, res) => err ? reject(err) : resolve(res))
      })
      const tip = await getMsg(id)
      if (tip.content?.type !== 'image') throw new Error('Image not found')
      if (tip.content.author !== author) throw new Error('Not the author')
      let currentId = id
      while (currentId) {
        const msg = await getMsg(currentId)
        await publishTomb(currentId)
        currentId = msg.content?.replaces || null
      }
      return { ok: true }
    },

    async listAll(filter = 'all') {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const messages = await new Promise((res, rej) => {
        pull(
          ssbClient.createLogStream({ limit: logLimit }),
          pull.collect((err, msgs) => err ? rej(err) : res(msgs))
        )
      })
      const tombstoned = new Set(
        messages
          .filter(m => m.value.content?.type === 'tombstone')
          .map(m => m.value.content.target)
      )
      const replaces = new Map()
      const latest = new Map()
      for (const m of messages) {
        const k = m.key
        const c = m.value?.content
        if (!c || c.type !== 'image') continue
        if (c.replaces) replaces.set(c.replaces, k)
        if (tombstoned.has(k)) continue
        latest.set(k, {
          key: k,
          url: c.url,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt || null,
          tags: c.tags || [],
          author: c.author,
          title: c.title || '',
          description: c.description || '',
          meme: !!c.meme,
          opinions: c.opinions || {},
          opinions_inhabitants: c.opinions_inhabitants || []
        })
      }
      for (const oldId of replaces.keys()) {
        latest.delete(oldId)
      }
      for (const delId of tombstoned) {
        latest.delete(delId)
      }
      let images = Array.from(latest.values())
      if (filter === 'mine') {
        images = images.filter(img => img.author === userId)
      } else if (filter === 'recent') {
        const now = Date.now()
        images = images.filter(img => new Date(img.createdAt).getTime() >= (now - 24 * 60 * 60 * 1000))
      } else if (filter === 'meme') {
        images = images.filter(img => img.meme === true)
      } else if (filter === 'top') {
        images = images.sort((a, b) => {
          const sumA = Object.values(a.opinions).reduce((sum, v) => sum + v, 0)
          const sumB = Object.values(b.opinions).reduce((sum, v) => sum + v, 0)
          return sumB - sumA
        })
      } else {
        images = images.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      }
      return images
    },

    async getImageById(id) {
      const ssbClient = await openSsb()
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'image') return reject(new Error('Image not found'))
          resolve({
            key: id,
            url: msg.content.url,
            createdAt: msg.content.createdAt,
            updatedAt: msg.content.updatedAt || null,
            tags: msg.content.tags || [],
            author: msg.content.author,
            title: msg.content.title || '',
            description: msg.content.description || '',
            meme: !!msg.content.meme,
            opinions: msg.content.opinions || {},
            opinions_inhabitants: msg.content.opinions_inhabitants || []
          })
        })
      })
    },

    async createOpinion(id, category) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'image') return reject(new Error('Image not found'))
          if (msg.content.opinions_inhabitants?.includes(userId)) return reject(new Error('Already voted'))
          const updated = {
            ...msg.content,
            replaces: id,
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

