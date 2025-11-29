const pull = require('../server/node_modules/pull-stream')
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;
const categories = require('../backend/opinion_categories')

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
    async createAudio(blobMarkdown, tagsRaw, title, description) {
      const ssbClient = await openSsb()
      const match = blobMarkdown?.match(/\(([^)]+)\)/)
      const blobId = match ? match[1] : blobMarkdown
      const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []
      const content = {
        type: 'audio',
        url: blobId,
        createdAt: new Date().toISOString(),
        author: userId,
        tags,
        title: title || '',
        description: description || '',
        opinions: {},
        opinions_inhabitants: []
      }
      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res))
      })
    },

    async updateAudioById(id, blobMarkdown, tagsRaw, title, description) {
      const ssbClient = await openSsb()
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, oldMsg) => {
          if (err || !oldMsg || oldMsg.content?.type !== 'audio') return reject(new Error('Audio not found'))
          if (Object.keys(oldMsg.content.opinions || {}).length > 0) return reject(new Error('Cannot edit audio after it has received opinions.'))
          if (oldMsg.content.author !== userId) return reject(new Error('Not the author'))
          const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : oldMsg.content.tags
          const match = blobMarkdown?.match(/\(([^)]+)\)/)
          const blobId = match ? match[1] : blobMarkdown
          const updated = {
            ...oldMsg.content,
            replaces: id,
            url: blobId || oldMsg.content.url,
            tags,
            title: title || '',
            description: description || '',
            updatedAt: new Date().toISOString()
          }
          ssbClient.publish(updated, (err3, result) => err3 ? reject(err3) : resolve(result))
        })
      })
    },

    async deleteAudioById(id) {
      const ssbClient = await openSsb()
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'audio') return reject(new Error('Audio not found'))
          if (msg.content.author !== userId) return reject(new Error('Not the author'))
          const tombstone = {
            type: 'tombstone',
            target: id,
            deletedAt: new Date().toISOString(),
            author: userId
          }
          ssbClient.publish(tombstone, (err2, res) => err2 ? reject(err2) : resolve(res))
        })
      })
    },

    async listAll(filter = 'all') {
      const ssbClient = await openSsb()
      const messages = await new Promise((res, rej) => {
        pull(
          ssbClient.createLogStream({ limit: logLimit }),
          pull.collect((err, msgs) => err ? rej(err) : res(msgs))
        )
      })

      const tombstoned = new Set(
        messages
          .filter(m => m.value?.content?.type === 'tombstone')
          .map(m => m.value.content.target)
      )

      const replaces = new Map()
      const latest = new Map()
      for (const m of messages) {
        const k = m.key
        const c = m.value?.content
        if (!c || c.type !== 'audio') continue
        if (tombstoned.has(k)) continue
        if (c.replaces) replaces.set(c.replaces, k)
        latest.set(k, {
          key: k,
          url: c.url,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt || null,
          tags: c.tags || [],
          author: c.author,
          title: c.title || '',
          description: c.description || '',
          opinions: c.opinions || {},
          opinions_inhabitants: c.opinions_inhabitants || []
        })
      }
      for (const oldId of replaces.keys()) {
        latest.delete(oldId)
      }

      let audios = Array.from(latest.values())

      if (filter === 'mine') {
        audios = audios.filter(a => a.author === userId)
      } else if (filter === 'recent') {
        const now = Date.now()
        audios = audios.filter(a => new Date(a.createdAt).getTime() >= (now - 24 * 60 * 60 * 1000))
      } else if (filter === 'top') {
        audios = audios.sort((a, b) => {
          const sumA = Object.values(a.opinions).reduce((sum, v) => sum + v, 0)
          const sumB = Object.values(b.opinions).reduce((sum, v) => sum + v, 0)
          return sumB - sumA
        })
      } else {
        audios = audios.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      }

      return audios
    },

    async getAudioById(id) {
      const ssbClient = await openSsb()
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'audio') return reject(new Error('Audio not found'))
          resolve({
            key: id,
            url: msg.content.url,
            createdAt: msg.content.createdAt,
            updatedAt: msg.content.updatedAt || null,
            tags: msg.content.tags || [],
            author: msg.content.author,
            title: msg.content.title || '',
            description: msg.content.description || '',
            opinions: msg.content.opinions || {},
            opinions_inhabitants: msg.content.opinions_inhabitants || []
          })
        })
      })
    },

    async createOpinion(id, category) {
      const ssbClient = await openSsb()
      if (!categories.includes(category)) return reject(new Error('Invalid voting category'))
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'audio') return reject(new Error('Audio not found'))
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

