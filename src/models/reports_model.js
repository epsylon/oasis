const pull = require('../server/node_modules/pull-stream')
const moment = require('../server/node_modules/moment')

module.exports = ({ cooler }) => {
  let ssb
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb }

  return {
    type: 'report',

    async createReport(title, description, category, image, tagsRaw = [], severity = 'low', isAnonymous = false) {
      const ssb = await openSsb()
      const userId = ssb.id
      let blobId = null
      if (image) {
        const match = image.match(/\(([^)]+)\)/)
        blobId = match ? match[1] : image
      }
      const tags = Array.isArray(tagsRaw)
        ? tagsRaw.filter(Boolean)
        : tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
      const content = {
        type: 'report',
        title,
        description,
        category,
        createdAt: new Date().toISOString(),
        author: userId,
        image: blobId,
        tags,
        opinions: {},
        opinions_inhabitants: [],
        confirmations: [],
        severity,
        status: 'OPEN',
        isAnonymous
      }
      return new Promise((resolve, reject) => {
        ssb.publish(content, (err, res) => err ? reject(err) : resolve(res))
      })
    },

    async updateReportById(id, updatedContent) {
      const ssb = await openSsb()
      const userId = ssb.id
      return new Promise((resolve, reject) => {
        ssb.get(id, (err, report) => {
          if (err || !report || !report.content) return reject(new Error('Report not found'))
          if (report.content.author !== userId) return reject(new Error('Not the author'))
          if (Object.keys(report.content.opinions || {}).length > 0) return reject(new Error('Cannot edit report after it has received opinions.'))
          const tags = updatedContent.tags
            ? updatedContent.tags.split(',').map(t => t.trim()).filter(Boolean)
            : report.content.tags
          let blobId = null
          if (updatedContent.image) {
            const match = updatedContent.image.match(/\(([^)]+)\)/)
            blobId = match ? match[1] : updatedContent.image
          }
          const updated = {
            ...report.content,
            ...updatedContent,
            type: 'report',
            replaces: id,
            image: blobId || report.content.image,
            tags,
            updatedAt: new Date().toISOString(),
            author: report.content.author
          }
          ssb.publish(updated, (e, r) => e ? reject(e) : resolve(r))
        })
      })
    },

    async deleteReportById(id) {
      const ssb = await openSsb()
      const userId = ssb.id
      return new Promise((resolve, reject) => {
        ssb.get(id, (err, report) => {
          if (err || !report || !report.content) return reject(new Error('Report not found'))
          if (report.content.author !== userId) return reject(new Error('Not the author'))
          const tombstone = {
            type: 'tombstone',
            target: id,
            deletedAt: new Date().toISOString(),
            author: userId
          }
          ssb.publish(tombstone, (err, res) => err ? reject(err) : resolve(res))
        })
      })
    },

    async listAll(filter = 'all') {
      const ssb = await openSsb()
      const userId = ssb.id
      return new Promise((resolve, reject) => {
        pull(
          ssb.createLogStream(),
          pull.collect((err, results) => {
            if (err) return reject(err)
            const tombstonedIds = new Set(
              results
                .filter(msg => msg.value.content?.type === 'tombstone')
                .map(msg => msg.value.content.target)
            )
            const replaces = new Map()
            const latest = new Map()
            for (const msg of results) {
              const k = msg.key
              const c = msg.value?.content
              if (!c || c.type !== 'report') continue
              if (tombstonedIds.has(k)) continue
              if (c.replaces) replaces.set(c.replaces, k)
              latest.set(k, {
                id: k,
                title: c.title,
                description: c.description,
                category: c.category,
                createdAt: c.createdAt,
                author: c.author,
                image: c.image || null,
                tags: c.tags || [],
                opinions: c.opinions || {},
                opinions_inhabitants: c.opinions_inhabitants || [],
                confirmations: c.confirmations || [],
                severity: c.severity || 'LOW',
                status: c.status || 'OPEN',
                isAnonymous: c.isAnonymous || false
              })
            }
            for (const oldId of replaces.keys()) {
              latest.delete(oldId)
            }
            let reports = Array.from(latest.values())
            if (filter === 'mine') reports = reports.filter(r => r.author === userId)
            if (['features', 'bugs', 'abuse', 'content'].includes(filter)) {
              reports = reports.filter(r => r.category.toLowerCase() === filter)
            }
            if (filter === 'confirmed') reports = reports.filter(r => r.confirmations.length >= 3)
            if (['open', 'resolved', 'invalid', 'underreview'].includes(filter)) {
              reports = reports.filter(r => r.status.toLowerCase() === filter)
            }
            resolve(reports)
          })
        )
      })
    },

    async getReportById(id) {
      const ssb = await openSsb()
      return new Promise((resolve, reject) => {
        ssb.get(id, (err, report) => {
          if (err || !report || !report.content) return reject(new Error('Report not found'))
          const c = report.content
          resolve({
            id,
            title: c.title,
            description: c.description,
            category: c.category,
            createdAt: c.createdAt,
            author: c.author,
            image: c.image || null,
            tags: c.tags || [],
            opinions: c.opinions || {},
            opinions_inhabitants: c.opinions_inhabitants || [],
            confirmations: c.confirmations || [],
            severity: c.severity || 'LOW',
            status: c.status || 'OPEN',
            isAnonymous: c.isAnonymous || false
          })
        })
      })
    },

    async confirmReportById(id) {
      const ssb = await openSsb()
      const userId = ssb.id
      return new Promise((resolve, reject) => {
        ssb.get(id, (err, report) => {
          if (err || !report || !report.content) return reject(new Error('Report not found'))
          if ((report.content.confirmations || []).includes(userId)) return reject(new Error('Already confirmed'))
          const updated = {
            ...report.content,
            replaces: id,
            confirmations: [...(report.content.confirmations || []), userId],
            updatedAt: new Date().toISOString()
          }
          ssb.publish(updated, (err2, result) => err2 ? reject(err2) : resolve(result))
        })
      })
    },

    async createOpinion(id, category) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'report') return reject(new Error('Report not found'))
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
          ssbClient.publish(updated, (err2, result) => err2 ? reject(err2) : resolve(result))
        })
      })
    }
  }
}

