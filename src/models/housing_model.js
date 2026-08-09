const pull = require("../server/node_modules/pull-stream")
const moment = require("../server/node_modules/moment")
const categories = require("../backend/opinion_categories")
const { getConfig } = require("../configs/config-manager.js")
const { dedupeByPreferring } = require('../backend/dedupe')
const logLimit = getConfig().ssbLogStream?.limit || 1000

const HOUSING_TYPES = ["sale", "rent", "couchsurfing"]
const PROPERTY_TYPES = ["apartment", "house", "room", "land", "other"]

const norm = (s) => String(s || "").trim().toLowerCase()
const safeArr = (v) => (Array.isArray(v) ? v : [])

const toNum = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : NaN
}

const toInt = (v, fallback = 0) => {
  const n = parseInt(String(v ?? ""), 10)
  return Number.isFinite(n) ? n : fallback
}

const nonNeg = (v) => {
  const n = toNum(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

const safeDate = (v) => {
  const s = String(v || "").trim()
  if (!s) return ""
  const d = new Date(s)
  return Number.isFinite(d.getTime()) ? s : ""
}

const normalizeTags = (raw) => {
  if (raw === undefined || raw === null) return []
  if (Array.isArray(raw)) return raw.map(t => String(t || "").trim()).filter(Boolean)
  return String(raw).split(",").map(t => t.trim()).filter(Boolean)
}

const safeType = (v) => {
  const t = norm(v)
  return HOUSING_TYPES.includes(t) ? t : ""
}

const safeProperty = (v) => {
  const t = norm(v)
  return PROPERTY_TYPES.includes(t) ? t : "other"
}

const { MAX_IMAGES, normalizeImages, normalizeVideo } = require('./media_gallery')

const matchSearch = (item, q) => {
  const qq = norm(q)
  if (!qq) return true
  const hay = [
    item.title,
    item.description,
    item.place,
    item.rules,
    item.housing_type,
    item.property_type,
    safeArr(item.tags).join(" ")
  ].map(x => norm(x)).join(" ")
  return hay.includes(qq)
}

module.exports = ({ cooler, tribeCrypto }) => {
  let ssb
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb }

  const isEncrypted = (c) => !!(c && c.encryptedPayload)

  const keysForRoot = (rootId) => {
    if (!tribeCrypto || !rootId) return []
    const ks = (tribeCrypto.getKeys && tribeCrypto.getKeys(rootId)) || []
    if (ks.length) return ks
    const k = tribeCrypto.getKey ? tribeCrypto.getKey(rootId) : null
    return k ? [k] : []
  }

  const decryptHousing = (c, rootId) => {
    if (!isEncrypted(c)) return c
    if (!tribeCrypto) return { ...c, _undecryptable: true }
    const keys = keysForRoot(rootId)
    if (!keys.length) return { ...c, _undecryptable: true }
    return tribeCrypto.decryptContent(c, keys.map(k => [k]))
  }

  const publishHousing = (ssbClient, content, rootId) => new Promise((resolve, reject) => {
    const hidden = String(content.visibility || "PUBLIC").toUpperCase() === "HIDDEN"
    if (!hidden || !tribeCrypto) {
      ssbClient.publish(content, (err, msg) => {
        if (err) return reject(err)
        if (msg && msg.key && tribeCrypto && !rootId) {
          try { tribeCrypto.setKey(msg.key, tribeCrypto.generateTribeKey(), 1) } catch (_) {}
        }
        resolve(msg)
      })
      return
    }
    let key = rootId ? (keysForRoot(rootId)[0] || null) : null
    if (!key) key = tribeCrypto.generateTribeKey()
    let envelope
    try { envelope = tribeCrypto.encryptContent(content, [key], true) } catch (err) { return reject(err) }
    ssbClient.publish(envelope, (err, msg) => {
      if (err) return reject(err)
      try { tribeCrypto.setKey(rootId || (msg && msg.key), key, 1) } catch (_) {}
      resolve(msg)
    })
  })

  const readAll = async (ssbClient) =>
    new Promise((resolve, reject) =>
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
      )
    )

  const buildIndex = (messages, ssbClient) => {
    const tomb = new Set()
    const nodes = new Map()
    const parent = new Map()
    const child = new Map()
    const naiveReplaces = new Map()
    const requestLatest = new Map()
    const opinionMsgs = []

    for (const m of messages) {
      const key = m.key
      const v = m.value || {}
      const c = v.content
      if (!c || typeof c !== "object") continue

      if (c.type === "tombstone" && c.target) { tomb.add(c.target); continue }

      if (c.type === "housing") {
        nodes.set(key, { key, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        if (c.replaces) naiveReplaces.set(key, c.replaces)
        continue
      }

      if (c.type === "housingOpinion" && c.target) {
        opinionMsgs.push({ target: c.target, author: v.author, category: c.category })
        continue
      }

      if (c.type === "housingRequest" && c.housingId) {
        const author = v.author
        if (!author) continue
        const ts = v.timestamp || m.timestamp || 0
        const k = `${c.housingId}::${author}`
        const prev = requestLatest.get(k)
        if (!prev || ts >= prev.ts) requestLatest.set(k, { ts, value: !!c.value, author, housingId: c.housingId })
        continue
      }
    }

    for (const [key, replacesId] of naiveReplaces.entries()) {
      const node = nodes.get(key)
      if (!node) continue
      const orig = nodes.get(replacesId)
      if (!orig) continue
      if (String(orig.author) !== String(node.author)) { nodes.delete(key); continue }
      parent.set(key, replacesId)
      child.set(replacesId, key)
    }

    const rootOf = (id) => {
      let cur = id, guard = 0
      while (parent.has(cur) && guard++ < 100000) cur = parent.get(cur)
      return cur
    }

    const tipOf = (id) => {
      let cur = id, guard = 0
      while (child.has(cur) && guard++ < 100000) cur = child.get(cur)
      return cur
    }

    const roots = new Set()
    for (const id of nodes.keys()) roots.add(rootOf(id))

    const tipByRoot = new Map()
    for (const r of roots) tipByRoot.set(r, tipOf(r))

    if (ssbClient) {
      for (const m of messages) {
        if (typeof m.value?.content !== 'string') continue
        try {
          const dec = ssbClient.private.unbox({ key: m.key, value: m.value, timestamp: m.value?.timestamp || m.timestamp || 0 })
          const c = dec?.value?.content
          if (!c || c.type !== 'housingRequest' || !c.housingId) continue
          const author = dec.value.author
          if (!author) continue
          const ts = dec.value.timestamp || m.timestamp || 0
          const k = `${c.housingId}::${author}`
          const prev = requestLatest.get(k)
          if (!prev || ts >= prev.ts) requestLatest.set(k, { ts, value: !!c.value, author, housingId: c.housingId })
        } catch {}
      }
    }

    const requestsByRoot = new Map()
    const everRequestedByRoot = new Map()
    for (const { housingId, author, value } of requestLatest.values()) {
      if (!requestsByRoot.has(housingId)) requestsByRoot.set(housingId, new Set())
      if (!everRequestedByRoot.has(housingId)) everRequestedByRoot.set(housingId, new Set())
      everRequestedByRoot.get(housingId).add(author)
      const set = requestsByRoot.get(housingId)
      if (value) set.add(author)
      else set.delete(author)
    }

    const opinionsByRoot = new Map()
    for (const op of opinionMsgs) {
      if (!nodes.has(op.target)) continue
      const r = rootOf(op.target)
      if (!opinionsByRoot.has(r)) opinionsByRoot.set(r, [])
      opinionsByRoot.get(r).push(op)
    }

    const aggregateFor = (rootId, content, ownerId) => {
      const opinions = { ...((content && content.opinions) || {}) }
      const voters = safeArr(content && content.opinions_inhabitants).slice()
      const voterSet = new Set(voters)
      for (const op of (opinionsByRoot.get(rootId) || [])) {
        if (!op.author || op.author === ownerId) continue
        if (voterSet.has(op.author)) continue
        if (!categories.includes(op.category)) continue
        voterSet.add(op.author); voters.push(op.author)
        opinions[op.category] = (opinions[op.category] || 0) + 1
      }
      return { opinions, opinions_inhabitants: voters }
    }

    return { tomb, nodes, parent, child, rootOf, tipOf, tipByRoot, requestsByRoot, everRequestedByRoot, aggregateFor }
  }

  const buildObject = (node, rootId, idx, viewer) => {
    const raw = node.c || {}
    const c = decryptHousing(raw, rootId)
    if (c._undecryptable) return null
    const author = node.author || c.author
    const requests = Array.from(idx.requestsByRoot.get(rootId) || [])
    const visibleRequests = (author === viewer) ? requests : (requests.includes(viewer) ? [viewer] : [])
    const agg = idx.aggregateFor(rootId, c, author)
    return {
      id: node.key,
      rootId,
      housing_type: safeType(c.housing_type),
      property_type: safeProperty(c.property_type),
      title: String(c.title || ""),
      description: String(c.description || ""),
      rules: String(c.rules || ""),
      place: String(c.place || ""),
      mapUrl: String(c.mapUrl || ""),
      price: Number.isFinite(toNum(c.price)) ? toNum(c.price).toFixed(6) : "0.000000",
      rooms: toInt(c.rooms, 0),
      size: nonNeg(c.size),
      capacity: toInt(c.capacity, 0),
      availableFrom: safeDate(c.availableFrom),
      availableTo: safeDate(c.availableTo),
      images: normalizeImages(c.images && c.images.length ? c.images : c.image),
      image: normalizeImages(c.images && c.images.length ? c.images : c.image)[0] || null,
      video: normalizeVideo(c.video),
      author,
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      status: String(c.status || "OPEN").toUpperCase() === "CLOSED" ? "CLOSED" : "OPEN",
      tags: Array.isArray(c.tags) ? c.tags : normalizeTags(c.tags),
      requests: visibleRequests,
      requestCount: requests.length,
      opinions: agg.opinions,
      opinions_inhabitants: agg.opinions_inhabitants,
      requestedByViewer: requests.includes(viewer),
      everRequestedByViewer: (idx.everRequestedByRoot.get(rootId) || new Set()).has(viewer),
      ratedByViewer: agg.opinions_inhabitants.includes(viewer),
      visibility: String(c.visibility || "PUBLIC").toUpperCase() === "HIDDEN" ? "HIDDEN" : "PUBLIC"
    }
  }

  const buildContent = (data, opts = {}) => {
    const housing_type = safeType(data.housing_type)
    if (!housing_type) throw new Error("Invalid housing type")

    const title = String(data.title || "").trim()
    if (!title) throw new Error("Invalid title")
    const description = String(data.description || "").trim()
    if (!description) throw new Error("Invalid description")

    const availableFrom = safeDate(data.availableFrom)
    const availableTo = safeDate(data.availableTo)
    if (!availableFrom) throw new Error("The start date is required")
    if (opts.enforceFutureStart) {
      const [y, m, d] = String(availableFrom).split("-").map(Number)
      const startsAt = new Date(y, (m || 1) - 1, d || 1)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (startsAt < today) throw new Error("The start date cannot be earlier than today")
    }
    if (availableTo && new Date(availableTo) < new Date(availableFrom)) {
      throw new Error("The end date cannot be earlier than the start date")
    }

    const images = normalizeImages(data.images !== undefined ? data.images : data.image)
    const video = normalizeVideo(data.video)

    return {
      type: "housing",
      housing_type,
      property_type: safeProperty(data.property_type),
      title,
      description,
      rules: String(data.rules || "").trim(),
      place: String(data.place || "").trim(),
      mapUrl: String(data.mapUrl || "").trim(),
      price: housing_type === "couchsurfing" ? "0.000000" : nonNeg(data.price).toFixed(6),
      rooms: Math.max(0, toInt(data.rooms, 0)),
      size: nonNeg(data.size),
      capacity: Math.max(0, toInt(data.capacity, 0)),
      availableFrom,
      availableTo,
      images,
      image: images[0] || null,
      video,
      tags: normalizeTags(data.tags),
      visibility: String(data.visibility || "PUBLIC").toUpperCase() === "HIDDEN" ? "HIDDEN" : "PUBLIC"
    }
  }

  return {
    type: "housing",
    HOUSING_TYPES,
    PROPERTY_TYPES,
    MAX_IMAGES,

    async createHousing(data) {
      const ssbClient = await openSsb()
      const content = {
        ...buildContent(data, { enforceFutureStart: true }),
        author: ssbClient.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "OPEN",
        opinions: {},
        opinions_inhabitants: []
      }
      return publishHousing(ssbClient, content, null)
    },

    async resolveCurrentId(id) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await readAll(ssbClient), ssbClient)
      const tip = idx.tipOf(id)
      if (idx.tomb.has(tip)) throw new Error("Housing not found")
      return tip
    },

    async resolveRootId(id) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await readAll(ssbClient), ssbClient)
      const tip = idx.tipOf(id)
      if (idx.tomb.has(tip)) throw new Error("Housing not found")
      return idx.rootOf(tip)
    },

    async updateHousing(id, data) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await readAll(ssbClient), ssbClient)
      const tipId = idx.tipOf(id)
      if (idx.tomb.has(tipId)) throw new Error("Housing not found")
      const node = idx.nodes.get(tipId)
      if (!node || !node.c) throw new Error("Housing not found")
      if ((node.author || node.c.author) !== ssbClient.id) throw new Error("Unauthorized")

      const rootId = idx.rootOf(tipId)
      const current = decryptHousing(node.c, rootId)
      if (current._undecryptable) throw new Error("Cannot decrypt this listing")
      const startChanged = data.availableFrom !== undefined && safeDate(data.availableFrom) !== safeDate(current.availableFrom)
      const merged = buildContent({
        housing_type: data.housing_type === undefined ? current.housing_type : data.housing_type,
        property_type: data.property_type === undefined ? current.property_type : data.property_type,
        title: data.title === undefined ? current.title : data.title,
        description: data.description === undefined ? current.description : data.description,
        rules: data.rules === undefined ? current.rules : data.rules,
        place: data.place === undefined ? current.place : data.place,
        mapUrl: data.mapUrl === undefined ? current.mapUrl : data.mapUrl,
        price: data.price === undefined ? current.price : data.price,
        rooms: data.rooms === undefined ? current.rooms : data.rooms,
        size: data.size === undefined ? current.size : data.size,
        capacity: data.capacity === undefined ? current.capacity : data.capacity,
        availableFrom: data.availableFrom === undefined ? current.availableFrom : data.availableFrom,
        availableTo: data.availableTo === undefined ? current.availableTo : data.availableTo,
        images: data.images === undefined
          ? (current.images && current.images.length ? current.images : current.image)
          : data.images,
        video: data.video === undefined ? current.video : data.video,
        tags: data.tags === undefined ? current.tags : data.tags,
        visibility: data.visibility === undefined ? current.visibility : data.visibility
      }, { enforceFutureStart: startChanged })

      let status = String(current.status || "OPEN").toUpperCase()
      if (data.status !== undefined) {
        const s = String(data.status || "").toUpperCase()
        if (!["OPEN", "CLOSED"].includes(s)) throw new Error("Invalid status")
        status = s
      }

      const next = {
        ...merged,
        status,
        author: current.author,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
        opinions: current.opinions || {},
        opinions_inhabitants: safeArr(current.opinions_inhabitants),
        replaces: tipId
      }

      const tomb = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: ssbClient.id }
      await new Promise((res, rej) => ssbClient.publish(tomb, (e) => e ? rej(e) : res()))
      return publishHousing(ssbClient, next, rootId)
    },

    async updateHousingStatus(id, status) {
      return this.updateHousing(id, { status: String(status || "").toUpperCase() })
    },

    async deleteHousing(id) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await readAll(ssbClient), ssbClient)
      const tipId = idx.tipOf(id)
      if (idx.tomb.has(tipId)) throw new Error("Housing not found")
      const node = idx.nodes.get(tipId)
      if (!node) throw new Error("Housing not found")
      if ((node.author || node.c.author) !== ssbClient.id) throw new Error("Unauthorized")
      const tomb = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: ssbClient.id }
      return new Promise((res, rej) => ssbClient.publish(tomb, (e, r) => e ? rej(e) : res(r)))
    },

    async requestHousing(id) {
      const ssbClient = await openSsb()
      const me = ssbClient.id
      const item = await this.getHousingById(id)
      if (item.author === me) throw new Error("Cannot request your own listing")
      if (item.status !== "OPEN") throw new Error("This listing is closed")
      if (safeArr(item.requests).includes(me)) return { alreadyRequested: true }
      const msg = { type: "housingRequest", housingId: item.rootId, value: true, createdAt: new Date().toISOString() }
      return new Promise((res, rej) => ssbClient.private.publish(msg, [me, item.author], (e, m) => e ? rej(e) : res(m)))
    },

    async cancelRequest(id) {
      const ssbClient = await openSsb()
      const me = ssbClient.id
      const item = await this.getHousingById(id)
      if (item.author === me) throw new Error("Cannot cancel a request on your own listing")
      if (!safeArr(item.requests).includes(me)) return { notRequested: true }
      const msg = { type: "housingRequest", housingId: item.rootId, value: false, createdAt: new Date().toISOString() }
      return new Promise((res, rej) => ssbClient.private.publish(msg, [me, item.author], (e, m) => e ? rej(e) : res(m)))
    },

    async createOpinion(id, category) {
      if (!categories.includes(category)) throw new Error("Invalid category")
      const ssbClient = await openSsb()
      const me = ssbClient.id
      const idx = buildIndex(await readAll(ssbClient), ssbClient)
      const tipId = idx.tipOf(id)
      if (idx.tomb.has(tipId)) throw new Error("Housing not found")
      const node = idx.nodes.get(tipId)
      if (!node) throw new Error("Housing not found")
      const rootId = idx.rootOf(tipId)
      const owner = node.author || node.c.author
      if (owner === me) throw new Error("You cannot rate your own listing")

      const agg = idx.aggregateFor(rootId, decryptHousing(node.c, rootId), owner)
      if (agg.opinions_inhabitants.includes(me)) throw new Error("Already voted")

      const everRequested = idx.everRequestedByRoot.get(rootId) || new Set()
      if (!everRequested.has(me)) throw new Error("You can rate only a place you have requested")

      const content = { type: "housingOpinion", target: rootId, category, createdAt: new Date().toISOString() }
      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => e ? rej(e) : res(m)))
    },

    async listHousing(filter = "ALL", viewerId = null, query = {}) {
      const ssbClient = await openSsb()
      const viewer = viewerId || ssbClient.id
      const idx = buildIndex(await readAll(ssbClient), ssbClient)

      const items = []
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue
        const node = idx.nodes.get(tipId)
        if (!node) continue
        const item = buildObject(node, rootId, idx, viewer)
        if (!item) continue
        if (item.visibility === "HIDDEN" && item.author !== viewer) continue
        items.push(item)
      }

      const F = String(filter || "ALL").toUpperCase()
      let list = dedupeByPreferring(
        items,
        (h) => (h.author && h.createdAt) ? [norm(h.author), norm(h.createdAt), norm(h.title)].join("|") : null,
        (h) => h.requestCount
      )

      if (F === "MINE") list = list.filter(h => h.author === viewer)
      else if (F === "REQUESTED") list = list.filter(h => safeArr(h.requests).includes(viewer))
      else if (HOUSING_TYPES.includes(norm(F))) list = list.filter(h => h.housing_type === norm(F))
      else if (F === "OPEN") list = list.filter(h => h.status === "OPEN")
      else if (F === "CLOSED") list = list.filter(h => h.status === "CLOSED")
      else if (F === "RECENT") list = list.filter(h => moment(h.createdAt).isAfter(moment().subtract(24, "hours")))

      const search = String(query.search || query.q || "").trim()
      if (search) list = list.filter(h => matchSearch(h, search))

      const minP = toNum(query.minPrice)
      const maxP = toNum(query.maxPrice)
      if (Number.isFinite(minP)) list = list.filter(h => toNum(h.price) >= minP)
      if (Number.isFinite(maxP)) list = list.filter(h => toNum(h.price) <= maxP)

      const place = String(query.place || "").trim()
      if (place) list = list.filter(h => norm(h.place).includes(norm(place)))

      const ratingOf = (h) => safeArr(h.opinions_inhabitants).length
      const sort = String(query.sort || "").trim()
      if (F === "TOP" || sort === "rating") list.sort((a, b) => ratingOf(b) - ratingOf(a))
      else if (sort === "price") list.sort((a, b) => toNum(a.price) - toNum(b.price))
      else if (sort === "requests") list.sort((a, b) => b.requestCount - a.requestCount)
      else list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      return list
    },

    async getHousingById(id, viewerId = null) {
      const ssbClient = await openSsb()
      const viewer = viewerId || ssbClient.id
      const idx = buildIndex(await readAll(ssbClient), ssbClient)
      const tipId = idx.tipOf(id)
      if (idx.tomb.has(tipId)) throw new Error("Housing not found")
      const node = idx.nodes.get(tipId)
      if (!node) throw new Error("Housing not found")
      const rootId = idx.rootOf(tipId)
      const item = buildObject(node, rootId, idx, viewer)
      if (!item) throw new Error("Housing not found")
      if (item.visibility === "HIDDEN" && item.author !== viewer) throw new Error("Housing not found")
      return item
    }
  }
}
