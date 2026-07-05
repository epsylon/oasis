const pull = require("../server/node_modules/pull-stream")
const moment = require("../server/node_modules/moment")
const { getConfig } = require("../configs/config-manager.js")
const { buildValidatedTombstoneSet } = require('./tombstone_validator')
const { dedupeByPreferring, norm } = require('../backend/dedupe')
const logLimit = getConfig().ssbLogStream?.limit || 1000

const N = (s) => String(s || "").toUpperCase().replace(/\s+/g, "_")
const D = (s) => ({ FOR_SALE: "FOR SALE", OPEN: "OPEN", RESERVED: "RESERVED", CLOSED: "CLOSED", SOLD: "SOLD", DISCARDED: "DISCARDED" })[s] || (s ? s.replace(/_/g, " ") : s)
const ORDER = ["FOR_SALE", "OPEN", "RESERVED", "CLOSED", "SOLD", "DISCARDED"]
const OI = (s) => ORDER.indexOf(N(s))

const parseBidEntry = (raw) => {
  const s = String(raw || "").trim()
  if (!s) return null

  if (s.includes("|")) {
    const parts = s.split("|")
    if (parts.length < 3) return null
    const bidder = parts[0] || ""
    const amount = parseFloat(String(parts[1] || "").replace(",", "."))
    const time = parts.slice(2).join("|")
    if (!bidder || !Number.isFinite(amount) || !time) return null
    return { bidder, amount, time }
  }

  const first = s.indexOf(":")
  const second = s.indexOf(":", first + 1)
  if (first === -1 || second === -1) return null

  const bidder = s.slice(0, first)
  const amountStr = s.slice(first + 1, second)
  const time = s.slice(second + 1)
  const amount = parseFloat(String(amountStr || "").replace(",", "."))
  if (!bidder || !Number.isFinite(amount) || !time) return null
  return { bidder, amount, time }
}

const highestBidAmount = (poll) => {
  const arr = Array.isArray(poll) ? poll : []
  let best = 0
  for (const x of arr) {
    const b = parseBidEntry(x)
    if (b && Number.isFinite(b.amount) && b.amount > best) best = b.amount
  }
  return best
}

const hasBidder = (poll, userId) => {
  const arr = Array.isArray(poll) ? poll : []
  for (const x of arr) {
    const b = parseBidEntry(x)
    if (b && b.bidder === userId) return true
  }
  return false
}

module.exports = ({ cooler, tribeCrypto }) => {
  let ssb
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open()
    return ssb
  }

  const readAll = async (ssbClient) => {
    return new Promise((resolve, reject) =>
      pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((err, msgs) => (err ? reject(err) : resolve(msgs))))
    )
  }

  const buildMarketIndex = (messages) => {
    const tomb = buildValidatedTombstoneSet(messages)
    const nodes = new Map()
    const bids = []
    const purchases = []
    for (const m of messages) {
      const c = m.value && m.value.content
      if (!c) continue
      if (c.type === "tombstone") continue
      if (c.type === "marketBid") { bids.push({ target: c.target, author: m.value.author, amount: c.amount, time: c.time, ts: (m.value && m.value.timestamp) || 0 }); continue }
      if (c.type === "marketPurchase") { purchases.push({ target: c.target, author: m.value.author, ts: (m.value && m.value.timestamp) || 0 }); continue }
      if (c.type !== "market") continue
      nodes.set(m.key, { key: m.key, ts: (m.value && m.value.timestamp) || m.timestamp || 0, c, author: m.value.author })
    }
    const naivePrev = new Map(), strictNext = new Map()
    for (const [key, n] of nodes) {
      const t = n.c.replaces
      if (!t) continue
      naivePrev.set(key, t)
    }
    for (const [child, parent] of Array.from(naivePrev.entries())) {
      const cn = nodes.get(child)
      const pn = nodes.get(parent)
      if (!pn) { naivePrev.delete(child); continue }
      if (!cn || cn.author !== pn.author) { naivePrev.delete(child); nodes.delete(child); continue }
      strictNext.set(parent, child)
    }
    return { tomb, nodes, bids, purchases, naivePrev, strictNext }
  }

  const resolveGroups = (idx) => {
    const { tomb, nodes, bids, purchases, naivePrev, strictNext } = idx
    const rootOf = (key) => { let x = key, g = 0; while (naivePrev.has(x) && nodes.has(naivePrev.get(x)) && g++ < 100000) x = naivePrev.get(x); return x }
    const followStrict = (key) => { let x = key, g = 0; while (strictNext.has(x) && g++ < 100000) x = strictNext.get(x); return x }

    const groups = new Map()
    for (const key of nodes.keys()) { const r = rootOf(key); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(key) }
    const bidsByRoot = new Map()
    for (const bd of bids) { if (!nodes.has(bd.target)) continue; const r = rootOf(bd.target); if (!bidsByRoot.has(r)) bidsByRoot.set(r, []); bidsByRoot.get(r).push(bd) }
    const soldByRoot = new Map()
    for (const pu of purchases) { if (!nodes.has(pu.target)) continue; const r = rootOf(pu.target); soldByRoot.set(r, (soldByRoot.get(r) || 0) + 1) }

    const out = new Map()
    for (const [root, keys] of groups) {
      const rootNode = nodes.get(root)
      const sellerId = rootNode ? rootNode.author : null
      const sellerKeys = keys.filter(k => { const n = nodes.get(k); return n && n.author === sellerId })
      let tip = followStrict(root)
      const tipNode0 = nodes.get(tip)
      if (!tipNode0 || tipNode0.author !== sellerId) tip = root
      if (tomb.has(tip)) continue
      let best = nodes.get(tip)
      if (!best) continue
      let bestS = N(best.c.status || "FOR_SALE")
      for (const k of (sellerKeys.length ? sellerKeys : keys)) {
        const n = nodes.get(k); if (!n) continue
        const s = N(n.c.status || "")
        if (OI(s) > OI(bestS)) { best = n; bestS = s }
      }
      const pollSet = new Set(); const poll = []
      const addLine = (line) => { const b = parseBidEntry(line); if (!b) return; const kk = `${b.bidder}|${b.amount}|${b.time}`; if (pollSet.has(kk)) return; pollSet.add(kk); poll.push(line) }
      for (const k of (sellerKeys.length ? sellerKeys : keys)) { const n = nodes.get(k); if (n && Array.isArray(n.c.auctions_poll)) for (const line of n.c.auctions_poll) addLine(line) }
      for (const bd of (bidsByRoot.get(root) || [])) { const amt = Number(bd.amount); addLine(`${bd.author}|${Number.isFinite(amt) ? amt.toFixed(6) : bd.amount}|${bd.time}`) }
      out.set(root, { tip, rootId: root, best, statusN: bestS, poll, soldCount: soldByRoot.get(root) || 0 })
    }
    return out
  }

  return {
    type: "market",

    async createItem(item_type, title, description, image, price, tagsRaw = [], item_status, deadline, includesShipping = false, stock = 0, mapUrl = "", shopOpts = {}, visibility = "PUBLIC") {
      const ssbClient = await openSsb()

      const formattedDeadline = deadline ? moment(deadline, moment.ISO_8601, true) : null
      if (!formattedDeadline || !formattedDeadline.isValid()) throw new Error("Invalid deadline")
      if (formattedDeadline.isBefore(moment(), "minute")) throw new Error("Cannot create an item in the past")

      let blobId = null
      if (image) {
        blobId = String(image).trim() || null
      }

      const tags = Array.isArray(tagsRaw) ? tagsRaw.filter(Boolean) : String(tagsRaw).split(",").map((t) => t.trim()).filter(Boolean)

      const p = typeof price === "string" ? parseFloat(String(price).replace(",", ".")) : parseFloat(price)
      if (!Number.isFinite(p) || p <= 0) throw new Error("Invalid price")

      const s = parseInt(String(stock || "0"), 10)
      if (!Number.isFinite(s) || s <= 0) throw new Error("Invalid stock")

      const itemContent = {
        type: "market",
        item_type,
        title,
        description,
        image: blobId,
        price: p.toFixed(6),
        tags,
        item_status,
        status: "FOR SALE",
        deadline: formattedDeadline.toISOString(),
        includesShipping: !!includesShipping,
        stock: s,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        seller: ssbClient.id,
        auctions_poll: [],
        mapUrl: String(mapUrl || "").trim(),
        shopProductId: shopOpts.shopProductId || "",
        shopId: shopOpts.shopId || "",
        shopTitle: shopOpts.shopTitle || "",
        visibility: String(visibility || "PUBLIC").toUpperCase() === "HIDDEN" ? "HIDDEN" : "PUBLIC"
      }

      return new Promise((resolve, reject) => {
        ssbClient.publish(itemContent, (err, res) => {
          if (err) return reject(err)
          if (res && res.key && tribeCrypto) {
            const key = tribeCrypto.generateTribeKey()
            tribeCrypto.setKey(res.key, key, 1)
          }
          resolve(res)
        })
      })
    },

    async resolveCurrentId(itemId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const { tomb, strictNext } = buildMarketIndex(messages)
      let cur = itemId, g = 0
      while (strictNext.has(cur) && g++ < 100000) cur = strictNext.get(cur)
      if (tomb.has(cur)) throw new Error("Item not found")
      return cur
    },

    async updateItemById(itemId, updatedData) {
      const tipId = await this.resolveCurrentId(itemId)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      const normalizeTags = (v) => {
        if (v === undefined) return undefined
        if (Array.isArray(v)) return v.filter(Boolean)
        if (typeof v === "string") return v.split(",").map((t) => t.trim()).filter(Boolean)
        return []
      }

      const normalized = { ...(updatedData || {}) }
      const tagsCandidate = normalizeTags(updatedData && updatedData.tags)
      if (tagsCandidate !== undefined) normalized.tags = tagsCandidate

      if (normalized.price !== undefined && normalized.price !== null && normalized.price !== "") {
        const p = typeof normalized.price === "string" ? parseFloat(String(normalized.price).replace(",", ".")) : parseFloat(normalized.price)
        if (!Number.isFinite(p) || p <= 0) throw new Error("Invalid price")
        normalized.price = p.toFixed(6)
      }

      if (normalized.deadline !== undefined && normalized.deadline !== null && normalized.deadline !== "") {
        const dl = moment(normalized.deadline, moment.ISO_8601, true)
        if (!dl.isValid()) throw new Error("Invalid deadline")
        normalized.deadline = dl.toISOString()
      }

      if (normalized.stock !== undefined) {
        const s = parseInt(String(normalized.stock), 10)
        if (!Number.isFinite(s) || s < 0) throw new Error("Invalid stock")
        normalized.stock = s
      }

      if (normalized.includesShipping !== undefined) {
        normalized.includesShipping = !!normalized.includesShipping
      }

      if (normalized.visibility !== undefined) {
        normalized.visibility = String(normalized.visibility || "PUBLIC").toUpperCase() === "HIDDEN" ? "HIDDEN" : "PUBLIC"
      }

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item || !item.content) return reject(new Error("Item not found"))
          if (item.content.seller !== userId) return reject(new Error("Not the seller"))

          const curStatusNorm = N(item.content.status || "FOR SALE")
          const curStatus = D(curStatusNorm)
          if (["SOLD", "DISCARDED"].includes(curStatus)) return reject(new Error("Cannot update this item"))

          const updated = {
            ...item.content,
            ...normalized,
            tags: updatedData && updatedData.tags !== undefined ? normalized.tags : item.content.tags,
            updatedAt: new Date().toISOString(),
            replaces: tipId
          }

          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }

          ssbClient.publish(tombstone, (err1) => {
            if (err1) return reject(err1)
            ssbClient.publish(updated, (err2, res) => (err2 ? reject(err2) : resolve(res)))
          })
        })
      })
    },

    async deleteItemById(itemId) {
      const tipId = await this.resolveCurrentId(itemId)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item || !item.content) return reject(new Error("Item not found"))
          if (item.content.seller !== userId) return reject(new Error("Not the seller"))
          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
          ssbClient.publish(tombstone, (err2) => (err2 ? reject(err2) : resolve({ message: "Item deleted successfully" })))
        })
      })
    },

    async listAllItems(filter = "all") {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const messages = await readAll(ssbClient)

      const items = []
      const now = moment()

      for (const { tip, rootId, best, statusN, poll, soldCount } of resolveGroups(buildMarketIndex(messages)).values()) {
        const leaf = tip
        const c = best.c
        let status = D(statusN)
        const stock = Math.max(0, (Number(c.stock) || 0) - (soldCount || 0))
        if (status === "FOR SALE" && soldCount > 0 && stock === 0) status = "SOLD"

        if (c.deadline) {
          const dl = moment(c.deadline)
          if (dl.isValid() && dl.isBefore(now)) {
            if (status !== "SOLD" && status !== "DISCARDED") {
              if (String(c.item_type || "").toLowerCase() === "auction") {
                status = highestBidAmount(poll) > 0 ? "SOLD" : "DISCARDED"
              } else {
                status = "DISCARDED"
              }
            }
          }
        }

        if (status === "FOR SALE" && stock === 0) continue

        const visibility = String(c.visibility || "PUBLIC").toUpperCase() === "HIDDEN" ? "HIDDEN" : "PUBLIC"
        if (visibility === "HIDDEN" && best.author !== userId) continue

        items.push({
          id: leaf,
          rootId,
          title: c.title,
          description: c.description,
          image: c.image,
          price: c.price,
          tags: c.tags || [],
          item_type: c.item_type,
          item_status: c.item_status || "NEW",
          status,
          visibility,
          createdAt: c.createdAt || new Date(best.ts).toISOString(),
          updatedAt: c.updatedAt,
          seller: best.author,
          includesShipping: !!c.includesShipping,
          stock,
          deadline: c.deadline || null,
          auctions_poll: (tribeCrypto && tribeCrypto.getKey(rootId)) ? poll : [],
          mapUrl: c.mapUrl || "",
          shopProductId: c.shopProductId || "",
          shopId: c.shopId || "",
          shopTitle: c.shopTitle || ""
        })
      }

      let list = dedupeByPreferring(items, (i) => (i.seller && i.createdAt) ? norm(i.seller) + "|" + norm(i.createdAt) : null, (i) => (Array.isArray(i.auctions_poll) ? i.auctions_poll.length : 0))
      switch (filter) {
        case "mine":
          list = list.filter((i) => i.seller === userId)
          break
        case "exchange":
          list = list.filter((i) => i.item_type === "exchange" && i.status === "FOR SALE")
          break
        case "auctions":
          list = list.filter((i) => i.item_type === "auction" && i.status === "FOR SALE")
          break
        case "mybids":
          list = list.filter((i) => i.item_type === "auction").filter((i) => hasBidder(i.auctions_poll, userId))
          break
        case "new":
          list = list.filter((i) => i.item_status === "NEW" && i.status === "FOR SALE")
          break
        case "used":
          list = list.filter((i) => i.item_status === "USED" && i.status === "FOR SALE")
          break
        case "broken":
          list = list.filter((i) => i.item_status === "BROKEN" && i.status === "FOR SALE")
          break
        case "for sale":
          list = list.filter((i) => i.status === "FOR SALE")
          break
        case "sold":
          list = list.filter((i) => i.status === "SOLD")
          break
        case "discarded":
          list = list.filter((i) => i.status === "DISCARDED")
          break
        case "recent": {
          const oneDayAgo = moment().subtract(1, "days")
          list = list.filter((i) => i.status === "FOR SALE" && moment(i.createdAt).isAfter(oneDayAgo))
          break
        }
      }

      return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    },

    async getItemById(itemId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const messages = await readAll(ssbClient)

      const idx = buildMarketIndex(messages)
      const rootOf = (key) => { let x = key, g = 0; while (idx.naivePrev.has(x) && idx.nodes.has(idx.naivePrev.get(x)) && g++ < 100000) x = idx.naivePrev.get(x); return x }
      const grp = resolveGroups(idx).get(rootOf(itemId))
      if (!grp) return null
      const { tip, rootId, best, statusN, poll, soldCount } = grp

      const c = best.c
      let status = D(statusN)
      const stock = Math.max(0, (Number(c.stock) || 0) - (soldCount || 0))
      if (status === "FOR SALE" && soldCount > 0 && stock === 0) status = "SOLD"

      const visibility = String(c.visibility || "PUBLIC").toUpperCase() === "HIDDEN" ? "HIDDEN" : "PUBLIC"
      if (visibility === "HIDDEN" && best.author !== userId) return null

      const now = moment()
      if (c.deadline) {
        const dl = moment(c.deadline)
        if (dl.isValid() && dl.isBefore(now)) {
          if (status !== "SOLD" && status !== "DISCARDED") {
            if (String(c.item_type || "").toLowerCase() === "auction") {
              status = highestBidAmount(poll) > 0 ? "SOLD" : "DISCARDED"
            } else {
              status = "DISCARDED"
            }
          }
        }
      }

      return {
        id: tip,
        rootId,
        title: c.title,
        description: c.description,
        image: c.image,
        price: c.price,
        tags: c.tags || [],
        item_type: c.item_type,
        item_status: c.item_status,
        status,
        visibility,
        createdAt: c.createdAt || new Date(best.ts).toISOString(),
        updatedAt: c.updatedAt,
        seller: best.author,
        includesShipping: !!c.includesShipping,
        stock,
        deadline: c.deadline,
        auctions_poll: (tribeCrypto && tribeCrypto.getKey(rootId)) ? poll : [],
        mapUrl: c.mapUrl || "",
        shopProductId: c.shopProductId || "",
        shopId: c.shopId || "",
        shopTitle: c.shopTitle || ""
      }
    },

    async checkAuctionItemsStatus(items) {
      const ssbClient = await openSsb()
      const myId = ssbClient.id
      const now = moment()
      const list = Array.isArray(items) ? items : []

      for (const item of list) {
        if (!item || !item.deadline) continue
        if (item.seller !== myId) continue
        const dl = moment(item.deadline)
        if (!dl.isValid()) continue
        if (!dl.isBefore(now)) continue

        const curStatus = D(N(item.status))
        if (curStatus === "SOLD" || curStatus === "DISCARDED") continue

        let status = curStatus
        const kind = String(item.item_type || "").toLowerCase()

        if (kind === "auction") {
          status = highestBidAmount(item.auctions_poll) > 0 ? "SOLD" : "DISCARDED"
        } else {
          status = "DISCARDED"
        }

        try {
          await this.updateItemById(item.id, { status })
        } catch (_) {}
      }
    },

    async getItemByShopProductId(shopProductId) {
      if (!shopProductId) return null
      const items = await this.listAllItems("all")
      return items.find((i) => i.shopProductId === shopProductId) || null
    },

    async setItemAsSold(itemId) {
      const tipId = await this.resolveCurrentId(itemId)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item || !item.content) return reject(new Error("Item not found"))
          if (item.content.seller !== userId) return reject(new Error("Not the seller"))

          const curStatus = String(item.content.status).toUpperCase().replace(/\s+/g, "_")
          if (["SOLD", "DISCARDED"].includes(curStatus)) return reject(new Error("Already sold/discarded"))

          const soldMsg = {
            ...item.content,
            stock: 0,
            status: "SOLD",
            updatedAt: new Date().toISOString(),
            replaces: tipId
          }

          const tomb1 = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }

          ssbClient.publish(tomb1, (err1) => {
            if (err1) return reject(err1)
            ssbClient.publish(soldMsg, (err2, soldRes) => {
              if (err2) return reject(err2)

              const touchMsg = {
                ...soldMsg,
                updatedAt: new Date().toISOString(),
                replaces: soldRes.key
              }

              const tomb2 = { type: "tombstone", target: soldRes.key, deletedAt: new Date().toISOString(), author: userId }

              ssbClient.publish(tomb2, (err3) => {
                if (err3) return reject(err3)
                ssbClient.publish(touchMsg, (err4, finalRes) => (err4 ? reject(err4) : resolve(finalRes)))
              })
            })
          })
        })
      })
    },

    async addBidToAuction(itemId, userId, bidAmount) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildMarketIndex(messages)
      const rootOf = (key) => { let x = key, g = 0; while (idx.naivePrev.has(x) && idx.nodes.has(idx.naivePrev.get(x)) && g++ < 100000) x = idx.naivePrev.get(x); return x }
      const grp = resolveGroups(idx).get(rootOf(itemId))
      if (!grp) throw new Error("Item not found")
      const c = grp.best.c

      if (String(c.item_type || "").toLowerCase() !== "auction") throw new Error("Not an auction")
      if (grp.best.author === userId) throw new Error("Cannot bid on your own item")
      if (D(N(c.status || "FOR_SALE")) !== "FOR SALE") throw new Error("Auction is not active")

      const dl = c.deadline ? moment(c.deadline) : null
      if (!dl || !dl.isValid()) throw new Error("Invalid deadline")
      if (dl.isBefore(moment())) throw new Error("Auction closed")

      if ((Number(c.stock) || 0) <= 0) throw new Error("Out of stock")

      const basePrice = parseFloat(String(c.price || "0").replace(",", "."))
      const bid = parseFloat(String(bidAmount || "").replace(",", "."))
      if (!Number.isFinite(bid) || bid <= 0) throw new Error("Invalid bid")

      const highest = highestBidAmount(grp.poll)
      const min = Number.isFinite(highest) && highest > 0 ? highest : Number.isFinite(basePrice) ? basePrice : 0
      if (bid <= min) throw new Error("Bid not highest")

      const content = { type: "marketBid", target: grp.rootId, amount: bid.toFixed(6), time: new Date().toISOString(), createdAt: new Date().toISOString() }
      return new Promise((resolve, reject) =>
        ssbClient.publish(content, (err, res) => (err ? reject(err) : resolve(res)))
      )
    },

    async decrementStock(itemId) {
      const ssbClient = await openSsb()
      const item = await this.getItemById(itemId)
      if (!item) throw new Error("Item not found")
      const curStatus = String(item.status).toUpperCase().replace(/\s+/g, "_")
      if (["SOLD", "DISCARDED"].includes(curStatus)) return { ok: true, noop: true }
      if ((Number(item.stock) || 0) <= 0) return { ok: true, noop: true }

      const content = { type: "marketPurchase", target: item.rootId, createdAt: new Date().toISOString() }
      return new Promise((resolve, reject) =>
        ssbClient.publish(content, (err, res) => (err ? reject(err) : resolve(res)))
      )
    }
  }
}

