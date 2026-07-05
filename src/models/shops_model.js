const pull = require("../server/node_modules/pull-stream")
const { getConfig } = require("../configs/config-manager.js")
const categories = require("../backend/opinion_categories")
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { dedupeByPreferring, norm } = require('../backend/dedupe')
const logLimit = getConfig().ssbLogStream?.limit || 1000

const safeArr = (v) => (Array.isArray(v) ? v : [])
const safeText = (v) => String(v || "").trim()
const normalizeTags = (raw) => {
  if (raw === undefined || raw === null) return []
  if (Array.isArray(raw)) return raw.map(t => String(t || "").trim()).filter(Boolean)
  return String(raw).split(",").map(t => t.trim()).filter(Boolean)
}
const voteSum = (opinions = {}) => Object.values(opinions || {}).reduce((s, n) => s + (Number(n) || 0), 0)

module.exports = ({ cooler, tribeCrypto }) => {
  let ssb
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb }

  const readAll = async (ssbClient) =>
    new Promise((resolve, reject) =>
      pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((err, msgs) => err ? reject(err) : resolve(msgs)))
    )

  const SELLER_STATUSES = ["ACCEPTED", "REJECTED", "PAID", "SHIPPED"]
  const BUYER_STATUSES = ["RECEIVED"]
  const ORDER_STATUSES = [...SELLER_STATUSES, ...BUYER_STATUSES]

  const buildOrderStatusMap = (ssbClient, messages) => {
    const map = new Map()
    for (const m of messages) {
      if (typeof m.value?.content !== "string") continue
      try {
        const dec = ssbClient.private.unbox({ key: m.key, value: m.value, timestamp: m.value?.timestamp || m.timestamp || 0 })
        const dc = dec?.value?.content
        if (!dc || dc.type !== "shop-purchase-status" || !dc.orderId) continue
        const ts = dec.value.timestamp || m.timestamp || 0
        const prev = map.get(dc.orderId)
        if (!prev || ts >= prev.ts) map.set(dc.orderId, { status: String(dc.status || "").toUpperCase(), ts })
      } catch (_) {}
    }
    return map
  }

  const decryptBuyers = (val, key) => {
    if (Array.isArray(val)) return val
    if (typeof val === 'string' && tribeCrypto && key) {
      try { return JSON.parse(tribeCrypto.decryptWithKey(val, key)) } catch {}
    }
    return []
  }

  const isEncrypted = (c) => !!(c && c.encryptedPayload)
  const productShopId = (c) => (c && (c.shopId || c.tribeId)) || ""

  const keysForRoot = (rootId) => {
    if (!tribeCrypto || !rootId) return []
    const ks = (tribeCrypto.getKeys && tribeCrypto.getKeys(rootId)) || []
    if (ks.length) return ks
    const k = tribeCrypto.getKey ? tribeCrypto.getKey(rootId) : null
    return k ? [k] : []
  }

  const decryptShopContent = (c, keyRootId) => {
    if (!isEncrypted(c)) return c
    if (!tribeCrypto) return { ...c, _undecryptable: true }
    const keys = keysForRoot(keyRootId)
    if (!keys.length) return { ...c, _undecryptable: true }
    return tribeCrypto.decryptContent(c, keys.map(k => [k]))
  }

  const encryptForShop = (plainContent, shopRootId) => {
    const keys = keysForRoot(shopRootId)
    if (!keys.length) throw new Error("Missing shop key")
    return tribeCrypto.encryptContent(plainContent, [keys[0]], true)
  }

  const buildIndex = (messages) => {
    const tomb = new Set()
    const nodes = new Map()
    const parent = new Map()
    const child = new Map()
    const strictChild = new Map()
    const opinionMsgs = []
    const purchaseMsgs = []

    for (const m of messages) {
      const k = m.key
      const v = m.value || {}
      const c = v.content
      if (!c) continue
      if (c.type === "tombstone" && c.target) { tomb.add(c.target); continue }
      if (c.type === "shopOpinion" && c.target) { opinionMsgs.push({ target: c.target, author: v.author, category: c.category }); continue }
      if (c.type === "shopPurchase" && c.target) { purchaseMsgs.push({ target: c.target, author: v.author }); continue }
      if (c.type === "shop" || c.type === "shopProduct") {
        nodes.set(k, { key: k, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        if (c.replaces) { parent.set(k, c.replaces); child.set(c.replaces, k) }
      }
    }

    for (const [k, node] of nodes) {
      const t = node.c.replaces
      if (t) { const orig = nodes.get(t); if (orig && orig.author === node.author) strictChild.set(t, k) }
    }

    const rootOf = (id) => { let cur = id, g = 0; while (parent.has(cur) && g++ < 100000) cur = parent.get(cur); return cur }
    const tipOf = (id) => { let cur = id, g = 0; while (child.has(cur) && g++ < 100000) cur = child.get(cur); return cur }
    const strictTipOf = (id) => {
      const root = rootOf(id)
      let cur = root, g = 0
      while (strictChild.has(cur) && g++ < 100000) cur = strictChild.get(cur)
      const n = nodes.get(cur), rn = nodes.get(root)
      return (n && rn && n.author === rn.author) ? cur : root
    }

    const roots = new Set()
    for (const id of nodes.keys()) roots.add(rootOf(id))

    const opinionsByRoot = new Map()
    for (const op of opinionMsgs) { if (!nodes.has(op.target)) continue; const r = rootOf(op.target); if (!opinionsByRoot.has(r)) opinionsByRoot.set(r, []); opinionsByRoot.get(r).push(op) }
    const purchasesByRoot = new Map()
    for (const pu of purchaseMsgs) { if (!nodes.has(pu.target)) continue; const r = rootOf(pu.target); if (!purchasesByRoot.has(r)) purchasesByRoot.set(r, []); purchasesByRoot.get(r).push(pu) }

    const tipByRoot = new Map()
    for (const r of roots) tipByRoot.set(r, strictTipOf(r))

    const aggregateFor = (rootId, decrypted) => {
      const opinions = { ...((decrypted && decrypted.opinions) || {}) }
      const voters = safeArr(decrypted && decrypted.opinions_inhabitants).slice()
      const voterSet = new Set(voters)
      for (const op of (opinionsByRoot.get(rootId) || [])) {
        if (voterSet.has(op.author)) continue
        voterSet.add(op.author); voters.push(op.author)
        if (op.category) opinions[op.category] = (opinions[op.category] || 0) + 1
      }
      return { opinions, opinions_inhabitants: voters }
    }

    const purchaseCountFor = (rootId) => (purchasesByRoot.get(rootId) || []).length
    const purchaseAuthorsFor = (rootId) => (purchasesByRoot.get(rootId) || []).map(p => p.author)

    return { tomb, nodes, parent, child, strictChild, rootOf, tipOf, strictTipOf, tipByRoot, aggregateFor, purchaseCountFor, purchaseAuthorsFor }
  }

  const buildShop = (node, rootId, idx) => {
    const raw = node.c || {}
    if (raw.type !== "shop") return null
    const encrypted = isEncrypted(raw)
    const c = encrypted ? decryptShopContent(raw, rootId) : raw
    const undecryptable = !!c._undecryptable
    const agg = idx ? idx.aggregateFor(rootId, c) : { opinions: c.opinions || {}, opinions_inhabitants: safeArr(c.opinions_inhabitants) }
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
      visibility: c.visibility || (encrypted ? "CLOSED" : "OPEN"),
      clearnetPublic: !!c.clearnetPublic,
      author: raw.author || c.author || node.author,
      createdAt: c.createdAt || raw.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || raw.updatedAt || null,
      opinions: agg.opinions,
      opinions_inhabitants: agg.opinions_inhabitants,
      mapUrl: c.mapUrl || "",
      encrypted,
      undecryptable
    }
  }

  const buildProduct = (node, rootId, idx) => {
    const raw = node.c || {}
    if (raw.type !== "shopProduct") return null
    const encrypted = isEncrypted(raw)
    const shopRoot = productShopId(raw)
    const c = encrypted ? decryptShopContent(raw, shopRoot) : raw
    const undecryptable = !!c._undecryptable
    const agg = idx ? idx.aggregateFor(rootId, c) : { opinions: c.opinions || {}, opinions_inhabitants: safeArr(c.opinions_inhabitants) }
    const sellerStock = Number(c.stock) || 0
    const purchaseCount = idx ? idx.purchaseCountFor(rootId) : 0
    const sellerBuyers = encrypted ? safeArr(c.buyers) : decryptBuyers(c.buyers, tribeCrypto ? tribeCrypto.getKey(rootId) : null)
    const buyers = Array.from(new Set(sellerBuyers.concat(idx ? idx.purchaseAuthorsFor(rootId) : [])))
    return {
      key: node.key,
      rootId,
      shopId: shopRoot,
      title: c.title || "",
      description: c.description || "",
      image: c.image || null,
      price: c.price || "0.000000",
      stock: Math.max(0, sellerStock - purchaseCount),
      featured: !!c.featured,
      author: raw.author || c.author || node.author,
      createdAt: c.createdAt || raw.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || raw.updatedAt || null,
      opinions: agg.opinions,
      opinions_inhabitants: agg.opinions_inhabitants,
      buyers,
      encrypted,
      undecryptable
    }
  }

  const countProductsFromIndex = (idx, shopRootId) => {
    let count = 0
    for (const tipId of idx.tipByRoot.values()) {
      if (idx.tomb.has(tipId)) continue
      const node = idx.nodes.get(tipId)
      if (!node || node.c.type !== "shopProduct") continue
      if (productShopId(node.c) === shopRootId) count++
    }
    return count
  }

  return {
    type: "shop",

    async resolveRootId(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      const tip = idx.strictTipOf(id)
      if (idx.tomb.has(tip)) throw new Error("Not found")
      return idx.rootOf(tip)
    },

    async resolveCurrentId(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      const tip = idx.strictTipOf(id)
      if (idx.tomb.has(tip)) throw new Error("Not found")
      return tip
    },

    async createShop(title, shortDescription, description, image, url, location, tagsRaw, visibility, mapUrl, clearnetPublic) {
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
        clearnetPublic: clearnetPublic === true || clearnetPublic === 'true' || clearnetPublic === 'on',
        mapUrl: safeText(mapUrl),
        author: ssbClient.id,
        createdAt: now,
        updatedAt: now,
        opinions: {},
        opinions_inhabitants: []
      }

      const wantsEncryption = vis === "CLOSED" && !!tribeCrypto
      return new Promise((resolve, reject) => {
        if (wantsEncryption) {
          const shopKey = tribeCrypto.generateTribeKey()
          const encrypted = tribeCrypto.encryptContent(content, [shopKey], true)
          ssbClient.publish(encrypted, (err, msg) => {
            if (err) return reject(err)
            if (msg && msg.key) tribeCrypto.setKey(msg.key, shopKey, 1)
            resolve(msg)
          })
        } else {
          ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg))
        }
      })
    },

    async updateShopById(id, data) {
      const tipId = await this.resolveCurrentId(id)
      const rootId = await this.resolveRootId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Shop not found"))
          const raw = item.content
          if (raw.author !== userId) return reject(new Error("Not the author"))

          const encrypted = isEncrypted(raw)
          const c = encrypted ? decryptShopContent(raw, rootId) : raw
          if (c._undecryptable) return reject(new Error("Cannot decrypt shop"))

          const plain = {
            ...c,
            title: data.title !== undefined ? safeText(data.title) : c.title,
            shortDescription: data.shortDescription !== undefined ? safeText(data.shortDescription) : c.shortDescription,
            description: data.description !== undefined ? safeText(data.description) : c.description,
            image: data.image !== undefined ? (data.image ? String(data.image).trim() || null : c.image) : c.image,
            url: data.url !== undefined ? safeText(data.url) : c.url,
            location: data.location !== undefined ? safeText(data.location) : c.location,
            tags: data.tags !== undefined ? normalizeTags(data.tags) : c.tags,
            visibility: encrypted ? "CLOSED" : c.visibility,
            clearnetPublic: data.clearnetPublic !== undefined ? (data.clearnetPublic === true || data.clearnetPublic === 'true' || data.clearnetPublic === 'on') : !!c.clearnetPublic,
            updatedAt: new Date().toISOString(),
            replaces: tipId
          }
          delete plain._decrypted
          delete plain._undecryptable
          delete plain.encryptedPayload

          let updated
          try {
            updated = encrypted ? encryptForShop(plain, rootId) : plain
          } catch (e) { return reject(e) }

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

      const tip = idx.strictTipOf(id)
      if (idx.tomb.has(tip)) return null

      const node = idx.nodes.get(tip)
      if (!node || node.c.type !== "shop") return null

      const root = idx.rootOf(tip)

      const shop = buildShop(node, root, idx)
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
        const shop = buildShop(node, rootId, idx)
        if (!shop) continue
        if (shop.encrypted) {
          if (shop.undecryptable) continue
        } else if (shop.visibility === "CLOSED" && shop.author !== uid) continue
        shop.productCount = countProductsFromIndex(idx, rootId)
        items.push(shop)
      }

      let list = dedupeByPreferring(items, (s) => (s.author && s.createdAt) ? norm(s.author) + "|" + norm(s.createdAt) : null, (s) => (Number(s.productCount) || 0) + voteSum(s.opinions))
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

      const shopKeys = keysForRoot(shopId)
      const e2e = shopKeys.length > 0
      if (e2e) content.tribeId = shopId

      return new Promise((resolve, reject) => {
        if (e2e) {
          let enc
          try { enc = tribeCrypto.encryptContent(content, [shopKeys[0]], true) } catch (e) { return reject(e) }
          ssbClient.publish(enc, (err, msg) => err ? reject(err) : resolve(msg))
        } else {
          ssbClient.publish(content, (err, msg) => {
            if (err) return reject(err)
            if (msg && msg.key && tribeCrypto) {
              const key = tribeCrypto.generateTribeKey()
              tribeCrypto.setKey(msg.key, key, 1)
            }
            resolve(msg)
          })
        }
      })
    },

    async updateProductById(id, data) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Product not found"))
          const raw = item.content
          if (raw.author !== userId) return reject(new Error("Not the author"))

          const encrypted = isEncrypted(raw)
          const shopRoot = productShopId(raw)
          const c = encrypted ? decryptShopContent(raw, shopRoot) : raw
          if (c._undecryptable) return reject(new Error("Cannot decrypt product"))

          const pRaw = data.price !== undefined ? parseFloat(String(data.price || "").replace(",", ".")) : null
          const sRaw = data.stock !== undefined ? parseInt(String(data.stock || "0"), 10) : null

          const plain = {
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
          delete plain._decrypted
          delete plain._undecryptable
          delete plain.encryptedPayload

          let updated
          try {
            updated = encrypted ? encryptForShop({ ...plain, tribeId: shopRoot }, shopRoot) : plain
          } catch (e) { return reject(e) }

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

      const tip = idx.strictTipOf(id)
      if (idx.tomb.has(tip)) return null

      const node = idx.nodes.get(tip)
      if (!node || node.c.type !== "shopProduct") return null

      const root = idx.rootOf(tip)

      return buildProduct(node, root, idx)
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
        if (productShopId(node.c) !== shopRootId) continue
        const prod = buildProduct(node, rootId, idx)
        if (prod && !prod.undecryptable) items.push(prod)
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
        if (productShopId(node.c) !== shopRootId) continue
        if (!node.c.featured) continue
        const prod = buildProduct(node, rootId, idx)
        if (prod && !prod.undecryptable) items.push(prod)
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
        const prod = buildProduct(node, rootId, idx)
        if (prod && !prod.undecryptable) items.push(prod)
      }

      if (filter === "top") return items.slice().sort((a, b) => voteSum(b.opinions) - voteSum(a.opinions) || new Date(b.createdAt) - new Date(a.createdAt))
      return items.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    },

    async buyProduct(productId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)

      const tipId = idx.strictTipOf(productId)
      if (idx.tomb.has(tipId)) throw new Error("Product not found")
      const rootId = idx.rootOf(tipId)

      const node = idx.nodes.get(tipId)
      if (!node) throw new Error("Product not found")
      const raw = node.c
      if (raw.author === userId) throw new Error("Cannot buy your own product")

      const encrypted = isEncrypted(raw)
      const shopRoot = productShopId(raw)
      const c = encrypted ? decryptShopContent(raw, shopRoot) : raw
      if (c._undecryptable) throw new Error("Cannot access product")
      const stock = Math.max(0, (Number(c.stock) || 0) - idx.purchaseCountFor(rootId))
      if (stock <= 0) throw new Error("Out of stock")

      const content = { type: "shopPurchase", target: rootId, createdAt: new Date().toISOString() }
      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => e ? rej(e) : res(m)))
    },

    async createPurchaseOrder(productId, deliveryDetails = {}) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)

      const tipId = idx.strictTipOf(productId)
      if (idx.tomb.has(tipId)) throw new Error("Product not found")
      const rootId = idx.rootOf(tipId)

      const node = idx.nodes.get(tipId)
      if (!node) throw new Error("Product not found")
      const raw = node.c
      const shopOwner = raw.author
      if (shopOwner === userId) throw new Error("Cannot buy your own product")
      const shopRoot = productShopId(raw)
      const c = isEncrypted(raw) ? decryptShopContent(raw, shopRoot) : raw

      const content = {
        type: "shop-purchase",
        productId: rootId,
        productTipId: tipId,
        shopId: shopRoot,
        seller: shopOwner,
        title: String(c.title || ""),
        price: c.price || "",
        deliveryAddress: String(deliveryDetails.deliveryAddress || ""),
        contact: String(deliveryDetails.contact || ""),
        notes: String(deliveryDetails.notes || ""),
        createdAt: new Date().toISOString()
      }

      const recps = [userId, shopOwner]
      return new Promise((res, rej) => ssbClient.private.publish(content, recps, (e, m) => e ? rej(e) : res(m)))
    },

    async listMyPurchases() {
      const ssbClient = await openSsb()
      const me = ssbClient.id
      const messages = await readAll(ssbClient)
      const out = []
      for (const m of messages) {
        if (typeof m.value?.content !== "string") continue
        try {
          const dec = ssbClient.private.unbox({ key: m.key, value: m.value, timestamp: m.value?.timestamp || m.timestamp || 0 })
          if (!dec?.value?.content) continue
          const dc = dec.value.content
          if (dc.type !== "shop-purchase") continue
          if (dec.value.author !== me) continue
          out.push({ id: m.key, ...dc, buyer: dec.value.author, ts: dec.value.timestamp || m.timestamp || 0 })
        } catch (_) {}
      }
      const statusMap = buildOrderStatusMap(ssbClient, messages)
      const sellerCache = new Map()
      for (const o of out) {
        if (!o.seller && o.shopId) {
          if (!sellerCache.has(o.shopId)) {
            const shop = await this.getShopById(o.shopId).catch(() => null)
            sellerCache.set(o.shopId, (shop && shop.author) || null)
          }
          o.seller = sellerCache.get(o.shopId) || null
        }
      }
      return out
        .map(o => ({ ...o, status: (statusMap.get(o.id) || {}).status || "PENDING" }))
        .sort((a, b) => b.ts - a.ts)
    },

    async listShopOrders(shopRootId) {
      const ssbClient = await openSsb()
      const me = ssbClient.id
      const shop = await this.getShopById(shopRootId).catch(() => null)
      if (!shop) throw new Error("Shop not found")
      if (shop.author !== me) throw new Error("Not the shop owner")

      const messages = await readAll(ssbClient)
      const out = []
      for (const m of messages) {
        if (typeof m.value?.content !== "string") continue
        try {
          const dec = ssbClient.private.unbox({ key: m.key, value: m.value, timestamp: m.value?.timestamp || m.timestamp || 0 })
          if (!dec?.value?.content) continue
          const dc = dec.value.content
          if (dc.type !== "shop-purchase") continue
          if (dc.shopId !== shopRootId) continue
          out.push({ id: m.key, ...dc, buyer: dec.value.author, ts: dec.value.timestamp || m.timestamp || 0 })
        } catch (_) {}
      }
      const statusMap = buildOrderStatusMap(ssbClient, messages)
      return out
        .map(o => ({ ...o, status: (statusMap.get(o.id) || {}).status || "PENDING" }))
        .sort((a, b) => b.ts - a.ts)
    },

    async setOrderStatus(orderId, status) {
      const ssbClient = await openSsb()
      const me = ssbClient.id
      const st = String(status || "").toUpperCase()
      if (!ORDER_STATUSES.includes(st)) throw new Error("Invalid status")
      const messages = await readAll(ssbClient)
      let order = null
      for (const m of messages) {
        if (m.key !== orderId) continue
        if (typeof m.value?.content !== "string") break
        try {
          const dec = ssbClient.private.unbox({ key: m.key, value: m.value, timestamp: m.value?.timestamp || m.timestamp || 0 })
          const dc = dec?.value?.content
          if (dc && dc.type === "shop-purchase") order = { ...dc, buyer: dec.value.author }
        } catch (_) {}
        break
      }
      if (!order) throw new Error("Order not found")
      const seller = order.seller || (await this.getShopById(order.shopId).catch(() => null) || {}).author || null
      if (BUYER_STATUSES.includes(st)) {
        if (me !== order.buyer) throw new Error("Only the buyer can set this status")
      } else {
        if (me !== seller) throw new Error("Only the seller can set this status")
      }
      const recps = Array.from(new Set([order.buyer, seller].filter(Boolean)))
      const content = { type: "shop-purchase-status", orderId, shopId: order.shopId, status: st, updatedAt: new Date().toISOString() }
      return new Promise((res, rej) => ssbClient.private.publish(content, recps, (e, m) => e ? rej(e) : res(m)))
    },

    async countPendingOrders(shopRootId) {
      try {
        const orders = await this.listShopOrders(shopRootId)
        return orders.filter(o => (o.status || "PENDING") === "PENDING").length
      } catch (_) { return 0 }
    },

    async createOpinion(id, category) {
      if (!categories.includes(category)) throw new Error("Invalid category")
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)

      const tipId = idx.strictTipOf(id)
      if (idx.tomb.has(tipId)) throw new Error("Not found")
      const rootId = idx.rootOf(tipId)

      const node = idx.nodes.get(tipId)
      if (!node) throw new Error("Not found")
      const raw = node.c
      const encrypted = isEncrypted(raw)
      const keyRoot = raw.type === "shop" ? rootId : productShopId(raw)
      const c = encrypted ? decryptShopContent(raw, keyRoot) : raw
      if (c._undecryptable) throw new Error("Cannot decrypt item")

      const voters = idx.aggregateFor(rootId, c).opinions_inhabitants
      if (voters.includes(userId)) throw new Error("Already voted")
      const myOrders = await this.listMyPurchases()
      const received = myOrders.some(o => o.productId === rootId && String(o.status || "").toUpperCase() === "RECEIVED")
      if (!received) throw new Error("You can rate only after confirming you received the item")

      const content = { type: "shopOpinion", target: rootId, category, createdAt: new Date().toISOString() }
      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => e ? rej(e) : res(m)))
    },

    async generateInvite(shopId) {
      if (!tribeCrypto) throw new Error("Shop crypto unavailable")
      const rootId = await this.resolveRootId(shopId)
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const raw = await new Promise((res, rej) => ssbClient.get(rootId, (e, m) => e ? rej(e) : res(m && m.content)))
      if (!raw) throw new Error("Shop not found")
      if (!isEncrypted(raw)) throw new Error("Only private shops use invitation codes")
      if (raw.author !== userId) throw new Error("Only the author can generate invites")
      const keys = keysForRoot(rootId)
      if (!keys.length) throw new Error("Missing shop key")
      const code = require("crypto").randomBytes(16).toString("hex")
      const salt = tribeCrypto.generateInviteSalt()
      const ek = tribeCrypto.encryptForInvite(keys[0], code, salt)
      await new Promise((resolve, reject) =>
        ssbClient.publish({ type: "shop-invite", target: rootId, ek, salt, codeHash: tribeCrypto.hashInviteCode(code, salt) }, (e) => e ? reject(e) : resolve())
      )
      return { code, shopId: rootId }
    },

    async getOpenInvite(shopId) {
      const ssbClient = await openSsb()
      const rootId = await this.resolveRootId(shopId).catch(() => shopId)
      const messages = await readAll(ssbClient)
      const markerTomb = new Set()
      const invTomb = new Set()
      for (const m of messages) {
        const c = m.value && m.value.content
        if (!c) continue
        if (c.type === "shop-open-invite-tombstone" && typeof c.target === "string") markerTomb.add(c.target)
        if (c.type === "shop-invite-tombstone" && typeof c.target === "string") invTomb.add(c.target)
      }
      let best = null
      for (const m of messages) {
        const c = m.value && m.value.content
        if (!c || c.type !== "shop-open-invite" || c.v !== 1) continue
        if (c.target !== rootId || typeof c.code !== "string") continue
        if (markerTomb.has(m.key)) continue
        if (c.inviteKey && invTomb.has(c.inviteKey)) continue
        const ts = (m.value && m.value.timestamp) || 0
        if (!best || ts > best.ts) best = { code: c.code, by: c.by || m.value.author, markerKey: m.key, inviteKey: c.inviteKey || null, ts }
      }
      return best ? { code: best.code, by: best.by, markerKey: best.markerKey, inviteKey: best.inviteKey } : null
    },

    async generateOpenInvite(shopId) {
      if (!tribeCrypto) throw new Error("Shop crypto unavailable")
      const rootId = await this.resolveRootId(shopId)
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const raw = await new Promise((res, rej) => ssbClient.get(rootId, (e, m) => e ? rej(e) : res(m && m.content)))
      if (!raw) throw new Error("Shop not found")
      if (!isEncrypted(raw)) throw new Error("Only private shops use invitation codes")
      if (raw.author !== userId) throw new Error("Only the author can generate invites")
      if (await this.getOpenInvite(shopId)) throw new Error("An open invitation already exists")
      const keys = keysForRoot(rootId)
      if (!keys.length) throw new Error("Missing shop key")
      const code = require("crypto").randomBytes(16).toString("hex")
      const salt = tribeCrypto.generateInviteSalt()
      const ek = tribeCrypto.encryptForInvite(keys[0], code, salt)
      const invitePub = await new Promise((resolve, reject) =>
        ssbClient.publish({ type: "shop-invite", target: rootId, ek, salt, codeHash: tribeCrypto.hashInviteCode(code, salt), multi: 1 }, (e, r) => e ? reject(e) : resolve(r))
      )
      await new Promise((resolve, reject) =>
        ssbClient.publish({ type: "shop-open-invite", v: 1, target: rootId, code, inviteKey: invitePub.key, by: userId, createdAt: new Date().toISOString() }, (e) => e ? reject(e) : resolve())
      )
      return { code, shopId: rootId }
    },

    async removeOpenInvite(shopId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const rec = await this.getOpenInvite(shopId)
      if (!rec) return
      let author = null
      try {
        const rootId = await this.resolveRootId(shopId)
        const raw = await new Promise((res, rej) => ssbClient.get(rootId, (e, m) => e ? rej(e) : res(m && m.content)))
        author = raw && raw.author
      } catch (_) {}
      if (rec.by !== userId && author !== userId) throw new Error("Not allowed to remove this invitation")
      await new Promise((resolve, reject) => ssbClient.publish({ type: "shop-open-invite-tombstone", target: rec.markerKey, ts: new Date().toISOString() }, (e) => e ? reject(e) : resolve()))
      if (rec.inviteKey) await new Promise((resolve, reject) => ssbClient.publish({ type: "shop-invite-tombstone", target: rec.inviteKey, ts: new Date().toISOString() }, (e) => e ? reject(e) : resolve()))
    },

    async joinByCode(code) {
      if (!tribeCrypto) throw new Error("Shop crypto unavailable")
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const invTomb = new Set()
      for (const m of messages) {
        const c = m.value && m.value.content
        if (c && c.type === "shop-invite-tombstone" && typeof c.target === "string") invTomb.add(c.target)
      }
      let matched = null
      for (const m of messages) {
        const c = m.value && m.value.content
        if (!c || c.type !== "shop-invite") continue
        if (invTomb.has(m.key)) continue
        try {
          if (tribeCrypto.hashInviteCode(code, c.salt) === c.codeHash) { matched = c; break }
        } catch (_) {}
      }
      if (!matched) throw new Error("Invalid or expired invite code")
      const shopKey = tribeCrypto.decryptFromInvite(matched.ek, code, matched.salt)
      if (!shopKey) throw new Error("Could not decrypt invite")
      if (tribeCrypto.addNewKey) tribeCrypto.addNewKey(matched.target, shopKey)
      else tribeCrypto.setKey(matched.target, shopKey, 1)
      return { ok: true, shopId: matched.target }
    },

    async setShopVisibility(id, target) {
      const tgt = String(target || "").toUpperCase() === "CLOSED" ? "CLOSED" : "OPEN"
      const rootId = await this.resolveRootId(id)
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      const shopRaw = await new Promise((res, rej) => ssbClient.get(tipId, (e, m) => e ? rej(e) : res(m && m.content)))
      if (!shopRaw) throw new Error("Shop not found")
      if (shopRaw.author !== userId) throw new Error("Not the author")
      const curShop = isEncrypted(shopRaw) ? decryptShopContent(shopRaw, rootId) : shopRaw
      if (curShop._undecryptable) throw new Error("Cannot decrypt shop")

      const wantEncrypted = tgt === "CLOSED" && !!tribeCrypto

      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      const products = []
      for (const tip of idx.tipByRoot.values()) {
        if (idx.tomb.has(tip)) continue
        const node = idx.nodes.get(tip)
        if (!node || node.c.type !== "shopProduct") continue
        if (productShopId(node.c) !== rootId) continue
        products.push({ tip, raw: node.c })
      }

      if (wantEncrypted) {
        const newKey = tribeCrypto.generateTribeKey()
        if (tribeCrypto.addNewKey) tribeCrypto.addNewKey(rootId, newKey)
        else tribeCrypto.setKey(rootId, newKey, 1)
      }

      const publish = (c) => new Promise((res, rej) => ssbClient.publish(c, (e, m) => e ? rej(e) : res(m)))
      const tombstone = (t) => ({ type: "tombstone", target: t, deletedAt: new Date().toISOString(), author: userId })

      const shopPlain = { ...curShop, visibility: tgt, updatedAt: new Date().toISOString(), replaces: tipId }
      delete shopPlain._decrypted
      delete shopPlain._undecryptable
      delete shopPlain.encryptedPayload
      delete shopPlain.tribeId
      const shopMsg = wantEncrypted ? encryptForShop(shopPlain, rootId) : shopPlain
      await publish(tombstone(tipId))
      await publish(shopMsg)

      for (const p of products) {
        const pPlain0 = isEncrypted(p.raw) ? decryptShopContent(p.raw, rootId) : p.raw
        if (pPlain0._undecryptable) continue
        const pPlain = { ...pPlain0, shopId: rootId, updatedAt: new Date().toISOString(), replaces: p.tip }
        delete pPlain._decrypted
        delete pPlain._undecryptable
        delete pPlain.encryptedPayload
        delete pPlain.tribeId
        let pMsg
        if (wantEncrypted) {
          pPlain.tribeId = rootId
          pMsg = encryptForShop(pPlain, rootId)
        } else {
          pMsg = pPlain
        }
        await publish(tombstone(p.tip))
        await publish(pMsg)
      }

      return { ok: true, shopId: rootId, visibility: tgt, encrypted: wantEncrypted }
    }
  }
}
