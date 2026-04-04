const pull = require("../server/node_modules/pull-stream")
const { getConfig } = require("../configs/config-manager.js")
const categories = require("../backend/opinion_categories")
const logLimit = getConfig().ssbLogStream?.limit || 1000

const safeArr = (v) => (Array.isArray(v) ? v : [])
const safeText = (v) => String(v || "").trim()
const normalizeTags = (raw) => {
  if (raw === undefined || raw === null) return []
  if (Array.isArray(raw)) return raw.map(t => String(t || "").trim()).filter(Boolean)
  return String(raw).split(",").map(t => t.trim()).filter(Boolean)
}
const voteSum = (opinions = {}) => Object.values(opinions || {}).reduce((s, n) => s + (Number(n) || 0), 0)

module.exports = ({ cooler }) => {
  let ssb
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb }

  const readAll = async (ssbClient) =>
    new Promise((resolve, reject) =>
      pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((err, msgs) => err ? reject(err) : resolve(msgs)))
    )

  const buildIndex = (messages) => {
    const tomb = new Set()
    const nodes = new Map()
    const parent = new Map()
    const child = new Map()

    for (const m of messages) {
      const k = m.key
      const v = m.value || {}
      const c = v.content
      if (!c) continue
      if (c.type === "tombstone" && c.target) { tomb.add(c.target); continue }
      if (c.type === "shop" || c.type === "shopProduct") {
        nodes.set(k, { key: k, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        if (c.replaces) { parent.set(k, c.replaces); child.set(c.replaces, k) }
      }
    }

    const rootOf = (id) => { let cur = id; while (parent.has(cur)) cur = parent.get(cur); return cur }
    const tipOf = (id) => { let cur = id; while (child.has(cur)) cur = child.get(cur); return cur }

    const roots = new Set()
    for (const id of nodes.keys()) roots.add(rootOf(id))
    const tipByRoot = new Map()
    for (const r of roots) tipByRoot.set(r, tipOf(r))

    return { tomb, nodes, parent, child, rootOf, tipOf, tipByRoot }
  }

  const buildShop = (node, rootId) => {
    const c = node.c || {}
    if (c.type !== "shop") return null
    return {
      key: node.key,
      rootId,
      title: c.title || "",
      shortDescription: c.shortDescription || "",
      description: c.description || "",
      image: c.image || null,
      url: c.url || "",
      location: c.location || "",
      tags: safeArr(c.tags),
      visibility: c.visibility || "OPEN",
      author: c.author || node.author,
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      opinions: c.opinions || {},
      opinions_inhabitants: safeArr(c.opinions_inhabitants),
      mapUrl: c.mapUrl || ""
    }
  }

  const buildProduct = (node, rootId) => {
    const c = node.c || {}
    if (c.type !== "shopProduct") return null
    return {
      key: node.key,
      rootId,
      shopId: c.shopId || "",
      title: c.title || "",
      description: c.description || "",
      image: c.image || null,
      price: c.price || "0.000000",
      stock: Number(c.stock) || 0,
      featured: !!c.featured,
      author: c.author || node.author,
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      opinions: c.opinions || {},
      opinions_inhabitants: safeArr(c.opinions_inhabitants),
      buyers: safeArr(c.buyers)
    }
  }

  const countProductsFromIndex = (idx, shopRootId) => {
    let count = 0
    for (const tipId of idx.tipByRoot.values()) {
      if (idx.tomb.has(tipId)) continue
      const node = idx.nodes.get(tipId)
      if (!node || node.c.type !== "shopProduct") continue
      if (node.c.shopId === shopRootId) count++
    }
    return count
  }

  return {
    type: "shop",

    async resolveRootId(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      let tip = id
      while (idx.child.has(tip)) tip = idx.child.get(tip)
      if (idx.tomb.has(tip)) throw new Error("Not found")
      let root = tip
      while (idx.parent.has(root)) root = idx.parent.get(root)
      return root
    },

    async resolveCurrentId(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      let tip = id
      while (idx.child.has(tip)) tip = idx.child.get(tip)
      if (idx.tomb.has(tip)) throw new Error("Not found")
      return tip
    },

    async createShop(title, shortDescription, description, image, url, location, tagsRaw, visibility, mapUrl) {
      const ssbClient = await openSsb()
      const blobId = image ? String(image).trim() || null : null
      const tags = normalizeTags(tagsRaw)
      const vis = String(visibility || "OPEN").toUpperCase() === "CLOSED" ? "CLOSED" : "OPEN"
      const now = new Date().toISOString()

      const content = {
        type: "shop",
        title: safeText(title),
        shortDescription: safeText(shortDescription),
        description: safeText(description),
        image: blobId,
        url: safeText(url),
        location: safeText(location),
        tags,
        visibility: vis,
        mapUrl: safeText(mapUrl),
        author: ssbClient.id,
        createdAt: now,
        updatedAt: now,
        opinions: {},
        opinions_inhabitants: []
      }

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg))
      })
    },

    async updateShopById(id, data) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Shop not found"))
          if (item.content.author !== userId) return reject(new Error("Not the author"))

          const c = item.content
          const updated = {
            ...c,
            title: data.title !== undefined ? safeText(data.title) : c.title,
            shortDescription: data.shortDescription !== undefined ? safeText(data.shortDescription) : c.shortDescription,
            description: data.description !== undefined ? safeText(data.description) : c.description,
            image: data.image !== undefined ? (data.image ? String(data.image).trim() || null : c.image) : c.image,
            url: data.url !== undefined ? safeText(data.url) : c.url,
            location: data.location !== undefined ? safeText(data.location) : c.location,
            tags: data.tags !== undefined ? normalizeTags(data.tags) : c.tags,
            visibility: data.visibility !== undefined ? (String(data.visibility).toUpperCase() === "CLOSED" ? "CLOSED" : "OPEN") : c.visibility,
            updatedAt: new Date().toISOString(),
            replaces: tipId
          }

          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
          ssbClient.publish(tombstone, (e1) => {
            if (e1) return reject(e1)
            ssbClient.publish(updated, (e2, res) => e2 ? reject(e2) : resolve(res))
          })
        })
      })
    },

    async deleteShopById(id) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Shop not found"))
          if (item.content.author !== userId) return reject(new Error("Not the author"))
          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
          ssbClient.publish(tombstone, (e) => e ? reject(e) : resolve())
        })
      })
    },

    async getShopById(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)

      let tip = id
      while (idx.child.has(tip)) tip = idx.child.get(tip)
      if (idx.tomb.has(tip)) return null

      const node = idx.nodes.get(tip)
      if (!node || node.c.type !== "shop") return null

      let root = tip
      while (idx.parent.has(root)) root = idx.parent.get(root)

      const shop = buildShop(node, root)
      if (!shop) return null
      shop.productCount = countProductsFromIndex(idx, root)
      return shop
    },

    async listAll({ filter = "all", q = "", sort = "recent", viewerId } = {}) {
      const ssbClient = await openSsb()
      const uid = viewerId || ssbClient.id
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)

      const items = []
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue
        const node = idx.nodes.get(tipId)
        if (!node || node.c.type !== "shop") continue
        const shop = buildShop(node, rootId)
        if (!shop) continue
        if (shop.visibility === "CLOSED" && shop.author !== uid) continue
        shop.productCount = countProductsFromIndex(idx, rootId)
        items.push(shop)
      }

      let list = items
      const now = Date.now()

      if (filter === "mine") list = list.filter(s => s.author === uid)
      else if (filter === "recent") list = list.filter(s => new Date(s.createdAt).getTime() >= now - 86400000)
      else if (filter === "top") list = list.slice().sort((a, b) => voteSum(b.opinions) - voteSum(a.opinions) || new Date(b.createdAt) - new Date(a.createdAt))

      if (q) {
        const qq = q.toLowerCase()
        list = list.filter(s => {
          const t = String(s.title || "").toLowerCase()
          const d = String(s.description || "").toLowerCase()
          const loc = String(s.location || "").toLowerCase()
          const tags = safeArr(s.tags).join(" ").toLowerCase()
          return t.includes(qq) || d.includes(qq) || loc.includes(qq) || tags.includes(qq)
        })
      }

      if (filter !== "top") {
        if (sort === "top") list = list.slice().sort((a, b) => voteSum(b.opinions) - voteSum(a.opinions) || new Date(b.createdAt) - new Date(a.createdAt))
        else list = list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      }

      return list
    },

    async createProduct(shopId, title, description, image, price, stock, featured) {
      const ssbClient = await openSsb()
      const blobId = image ? String(image).trim() || null : null
      const p = parseFloat(String(price || "").replace(",", "."))
      if (!Number.isFinite(p) || p <= 0) throw new Error("Invalid price")
      const s = parseInt(String(stock || "1"), 10)
      if (!Number.isFinite(s) || s < 0) throw new Error("Invalid stock")
      const now = new Date().toISOString()

      const content = {
        type: "shopProduct",
        shopId,
        title: safeText(title),
        description: safeText(description),
        image: blobId,
        price: p.toFixed(6),
        stock: s,
        featured: !!featured,
        author: ssbClient.id,
        createdAt: now,
        updatedAt: now,
        opinions: {},
        opinions_inhabitants: []
      }

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg))
      })
    },

    async updateProductById(id, data) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Product not found"))
          if (item.content.author !== userId) return reject(new Error("Not the author"))

          const c = item.content
          const pRaw = data.price !== undefined ? parseFloat(String(data.price || "").replace(",", ".")) : null
          const sRaw = data.stock !== undefined ? parseInt(String(data.stock || "0"), 10) : null

          const updated = {
            ...c,
            title: data.title !== undefined ? safeText(data.title) : c.title,
            description: data.description !== undefined ? safeText(data.description) : c.description,
            image: data.image !== undefined ? (data.image ? String(data.image).trim() || null : c.image) : c.image,
            price: pRaw !== null && Number.isFinite(pRaw) && pRaw > 0 ? pRaw.toFixed(6) : c.price,
            stock: sRaw !== null && Number.isFinite(sRaw) && sRaw >= 0 ? sRaw : c.stock,
            featured: data.featured !== undefined ? !!data.featured : !!c.featured,
            updatedAt: new Date().toISOString(),
            replaces: tipId
          }

          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
          ssbClient.publish(tombstone, (e1) => {
            if (e1) return reject(e1)
            ssbClient.publish(updated, (e2, res) => e2 ? reject(e2) : resolve(res))
          })
        })
      })
    },

    async deleteProductById(id) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Product not found"))
          if (item.content.author !== userId) return reject(new Error("Not the author"))
          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
          ssbClient.publish(tombstone, (e) => e ? reject(e) : resolve())
        })
      })
    },

    async getProductById(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)

      let tip = id
      while (idx.child.has(tip)) tip = idx.child.get(tip)
      if (idx.tomb.has(tip)) return null

      const node = idx.nodes.get(tip)
      if (!node || node.c.type !== "shopProduct") return null

      let root = tip
      while (idx.parent.has(root)) root = idx.parent.get(root)

      return buildProduct(node, root)
    },

    async listProducts(shopRootId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)

      const items = []
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue
        const node = idx.nodes.get(tipId)
        if (!node || node.c.type !== "shopProduct") continue
        if (node.c.shopId !== shopRootId) continue
        const prod = buildProduct(node, rootId)
        if (prod) items.push(prod)
      }

      return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    },

    async listFeaturedProducts(shopRootId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)

      const items = []
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue
        const node = idx.nodes.get(tipId)
        if (!node || node.c.type !== "shopProduct") continue
        if (node.c.shopId !== shopRootId) continue
        if (!node.c.featured) continue
        const prod = buildProduct(node, rootId)
        if (prod) items.push(prod)
      }

      return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4)
    },

    async listAllProducts({ filter = "all", sort = "recent" } = {}) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)

      const items = []
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue
        const node = idx.nodes.get(tipId)
        if (!node || node.c.type !== "shopProduct") continue
        const prod = buildProduct(node, rootId)
        if (prod) items.push(prod)
      }

      if (filter === "top") return items.slice().sort((a, b) => voteSum(b.opinions) - voteSum(a.opinions) || new Date(b.createdAt) - new Date(a.createdAt))
      return items.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    },

    async buyProduct(productId) {
      const tipId = await this.resolveCurrentId(productId)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Product not found"))
          const c = item.content
          if (c.author === userId) return reject(new Error("Cannot buy your own product"))
          const stock = Number(c.stock) || 0
          if (stock <= 0) return reject(new Error("Out of stock"))

          const updated = {
            ...c,
            stock: stock - 1,
            buyers: safeArr(c.buyers).concat(userId),
            updatedAt: new Date().toISOString(),
            replaces: tipId
          }

          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
          ssbClient.publish(tombstone, (e1) => {
            if (e1) return reject(e1)
            ssbClient.publish(updated, (e2, res) => e2 ? reject(e2) : resolve(res))
          })
        })
      })
    },

    async createOpinion(id, category) {
      if (!categories.includes(category)) throw new Error("Invalid category")
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const tipId = await this.resolveCurrentId(id)

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Not found"))
          const c = item.content
          const buyers = safeArr(c.buyers)
          if (!buyers.includes(userId)) return reject(new Error("Must purchase before rating"))
          const voters = safeArr(c.opinions_inhabitants)
          if (voters.includes(userId)) return reject(new Error("Already voted"))

          const updated = {
            ...c,
            opinions: { ...(c.opinions || {}), [category]: ((c.opinions || {})[category] || 0) + 1 },
            opinions_inhabitants: voters.concat(userId),
            updatedAt: new Date().toISOString(),
            replaces: tipId
          }

          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
          ssbClient.publish(tombstone, (e1) => {
            if (e1) return reject(e1)
            ssbClient.publish(updated, (e2, res) => e2 ? reject(e2) : resolve(res))
          })
        })
      })
    }
  }
}
