const pull = require("../server/node_modules/pull-stream")
const moment = require("../server/node_modules/moment")
const { getConfig } = require("../configs/config-manager.js")
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

module.exports = ({ cooler }) => {
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

  const resolveGraph = async () => {
    const ssbClient = await openSsb()
    const messages = await readAll(ssbClient)

    const tomb = new Set()
    const fwd = new Map()
    const parent = new Map()

    for (const m of messages) {
      const c = m.value && m.value.content
      if (!c) continue
      if (c.type === "tombstone" && c.target) {
        tomb.add(c.target)
        continue
      }
      if (c.type !== "market") continue
      if (c.replaces) {
        fwd.set(c.replaces, m.key)
        parent.set(m.key, c.replaces)
      }
    }

    return { tomb, fwd, parent }
  }

  return {
    type: "market",

    async createItem(item_type, title, description, image, price, tagsRaw = [], item_status, deadline, includesShipping = false, stock = 0) {
      const ssbClient = await openSsb()

      const formattedDeadline = deadline ? moment(deadline, moment.ISO_8601, true) : null
      if (!formattedDeadline || !formattedDeadline.isValid()) throw new Error("Invalid deadline")
      if (formattedDeadline.isBefore(moment(), "minute")) throw new Error("Cannot create an item in the past")

      let blobId = null
      if (image) {
        const match = String(image).match(/\(([^)]+)\)/)
        blobId = match ? match[1] : image
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
        auctions_poll: []
      }

      return new Promise((resolve, reject) => {
        ssbClient.publish(itemContent, (err, res) => (err ? reject(err) : resolve(res)))
      })
    },

    async resolveCurrentId(itemId) {
      const { tomb, fwd } = await resolveGraph()
      let cur = itemId
      while (fwd.has(cur)) cur = fwd.get(cur)
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

      const tomb = new Set()
      const nodes = new Map()
      const parent = new Map()
      const child = new Map()

      for (const m of messages) {
        const k = m.key
        const c = m.value && m.value.content
        if (!c) continue
        if (c.type === "tombstone" && c.target) {
          tomb.add(c.target)
          continue
        }
        if (c.type !== "market") continue
        nodes.set(k, { key: k, ts: (m.value && m.value.timestamp) || m.timestamp || 0, c })
        if (c.replaces) {
          parent.set(k, c.replaces)
          child.set(c.replaces, k)
        }
      }

      const rootOf = (id) => {
        let cur = id
        while (parent.has(cur)) cur = parent.get(cur)
        return cur
      }

      const groups = new Map()
      for (const id of nodes.keys()) {
        const r = rootOf(id)
        if (!groups.has(r)) groups.set(r, new Set())
        groups.get(r).add(id)
      }

      const items = []
      const now = moment()

      for (const [rootId, ids] of groups.entries()) {
        const leaf = Array.from(ids).find((id) => !child.has(id)) || Array.from(ids)[0]
        if (!leaf) continue
        if (tomb.has(leaf)) continue

        let best = nodes.get(leaf)
        if (!best) continue

        let bestS = N(best.c.status || "FOR_SALE")
        for (const id of ids) {
          const n = nodes.get(id)
          if (!n) continue
          const s = N(n.c.status || "")
          if (OI(s) > OI(bestS)) {
            best = n
            bestS = s
          }
        }

        const c = best.c
        let status = D(bestS)

        if (c.deadline) {
          const dl = moment(c.deadline)
          if (dl.isValid() && dl.isBefore(now)) {
            if (status !== "SOLD" && status !== "DISCARDED") {
              if (String(c.item_type || "").toLowerCase() === "auction") {
                status = highestBidAmount(c.auctions_poll) > 0 ? "SOLD" : "DISCARDED"
              } else {
                status = "DISCARDED"
              }
            }
          }
        }

        if (status === "FOR SALE" && (Number(c.stock) || 0) === 0) continue

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
          createdAt: c.createdAt || new Date(best.ts).toISOString(),
          updatedAt: c.updatedAt,
          seller: c.seller,
          includesShipping: !!c.includesShipping,
          stock: Number(c.stock) || 0,
          deadline: c.deadline || null,
          auctions_poll: Array.isArray(c.auctions_poll) ? c.auctions_poll : []
        })
      }

      let list = items
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
      const messages = await readAll(ssbClient)

      const tomb = new Set()
      const nodes = new Map()
      const parent = new Map()
      const child = new Map()

      for (const m of messages) {
        const k = m.key
        const c = m.value && m.value.content
        if (!c) continue
        if (c.type === "tombstone" && c.target) {
          tomb.add(c.target)
          continue
        }
        if (c.type !== "market") continue
        nodes.set(k, { key: k, ts: (m.value && m.value.timestamp) || m.timestamp || 0, c })
        if (c.replaces) {
          parent.set(k, c.replaces)
          child.set(c.replaces, k)
        }
      }

      let tip = itemId
      while (child.has(tip)) tip = child.get(tip)
      if (tomb.has(tip)) return null

      let rootId = tip
      while (parent.has(rootId)) rootId = parent.get(rootId)

      const ids = new Set()
      let cur = tip
      ids.add(cur)
      while (parent.has(cur)) {
        cur = parent.get(cur)
        ids.add(cur)
      }

      let best = nodes.get(tip) || null
      if (!best || !best.c) return null

      let bestS = N(best.c.status || "FOR_SALE")
      for (const id of ids) {
        const n = nodes.get(id)
        if (!n) continue
        const s = N(n.c.status || "")
        if (OI(s) > OI(bestS)) {
          best = n
          bestS = s
        }
      }

      const c = best.c
      let status = D(bestS)

      const now = moment()
      if (c.deadline) {
        const dl = moment(c.deadline)
        if (dl.isValid() && dl.isBefore(now)) {
          if (status !== "SOLD" && status !== "DISCARDED") {
            if (String(c.item_type || "").toLowerCase() === "auction") {
              status = highestBidAmount(c.auctions_poll) > 0 ? "SOLD" : "DISCARDED"
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
        createdAt: c.createdAt || new Date(best.ts).toISOString(),
        updatedAt: c.updatedAt,
        seller: c.seller,
        includesShipping: !!c.includesShipping,
        stock: Number(c.stock) || 0,
        deadline: c.deadline,
        auctions_poll: Array.isArray(c.auctions_poll) ? c.auctions_poll : []
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
      const tipId = await this.resolveCurrentId(itemId)
      const ssbClient = await openSsb()
      const me = ssbClient.id

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item || !item.content) return reject(new Error("Item not found"))
          const c = item.content

          if (String(c.item_type || "").toLowerCase() !== "auction") return reject(new Error("Not an auction"))
          if (c.seller === userId) return reject(new Error("Cannot bid on your own item"))

          const curStatus = D(N(c.status || "FOR_SALE"))
          if (curStatus !== "FOR SALE") return reject(new Error("Auction is not active"))

          const dl = c.deadline ? moment(c.deadline) : null
          if (!dl || !dl.isValid()) return reject(new Error("Invalid deadline"))
          if (dl.isBefore(moment())) return reject(new Error("Auction closed"))

          const stock = Number(c.stock) || 0
          if (stock <= 0) return reject(new Error("Out of stock"))

          const basePrice = parseFloat(String(c.price || "0").replace(",", "."))
          const bid = parseFloat(String(bidAmount || "").replace(",", "."))
          if (!Number.isFinite(bid) || bid <= 0) return reject(new Error("Invalid bid"))

          const highest = highestBidAmount(c.auctions_poll)
          const min = Number.isFinite(highest) && highest > 0 ? highest : Number.isFinite(basePrice) ? basePrice : 0
          if (bid <= min) return reject(new Error("Bid not highest"))

          const bidLine = `${userId}|${bid.toFixed(6)}|${new Date().toISOString()}`

          const updated = {
            ...c,
            auctions_poll: [...(Array.isArray(c.auctions_poll) ? c.auctions_poll : []), bidLine],
            updatedAt: new Date().toISOString(),
            replaces: tipId
          }

          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: me }

          ssbClient.publish(tombstone, (err1) => {
            if (err1) return reject(err1)
            ssbClient.publish(updated, (err2, res) => (err2 ? reject(err2) : resolve(res)))
          })
        })
      })
    },

    async decrementStock(itemId) {
      const tipId = await this.resolveCurrentId(itemId)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item || !item.content) return reject(new Error("Item not found"))

          const curStatus = String(item.content.status).toUpperCase().replace(/\s+/g, "_")
          if (["SOLD", "DISCARDED"].includes(curStatus)) return resolve({ ok: true, noop: true })

          const current = Number(item.content.stock) || 0
          if (current <= 0) return resolve({ ok: true, noop: true })

          const newStock = current - 1
          const updated = {
            ...item.content,
            stock: newStock,
            status: newStock === 0 ? "SOLD" : item.content.status,
            updatedAt: new Date().toISOString(),
            replaces: tipId
          }

          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }

          ssbClient.publish(tombstone, (e1) => {
            if (e1) return reject(e1)
            ssbClient.publish(updated, (e2, res) => (e2 ? reject(e2) : resolve(res)))
          })
        })
      })
    }
  }
}

