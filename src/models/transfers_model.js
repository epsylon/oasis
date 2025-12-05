const pull = require("../server/node_modules/pull-stream")
const moment = require("../server/node_modules/moment")
const { getConfig } = require("../configs/config-manager.js")
const categories = require("../backend/opinion_categories")
const logLimit = getConfig().ssbLogStream?.limit || 1000

const isValidId = (to) => /^@[A-Za-z0-9+/]+={0,2}\.ed25519$/.test(String(to || ""))

const parseNum = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : NaN
}

const normalizeTags = (raw) => {
  if (raw === undefined || raw === null) return []
  if (Array.isArray(raw)) return raw.map(t => String(t || "").trim()).filter(Boolean)
  return String(raw).split(",").map(t => t.trim()).filter(Boolean)
}

module.exports = ({ cooler }) => {
  let ssb
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb }

  const getAllMessages = async (ssbClient) =>
    new Promise((resolve, reject) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
      )
    })

  const getMsg = async (ssbClient, key) =>
    new Promise((resolve, reject) => {
      ssbClient.get(key, (err, msg) => err ? reject(err) : resolve(msg))
    })

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

      if (c.type === "tombstone" && c.target) {
        tomb.add(c.target)
        continue
      }

      if (c.type === "transfer") {
        nodes.set(k, { key: k, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        if (c.replaces) {
          parent.set(k, c.replaces)
          child.set(c.replaces, k)
        }
      }
    }

    const rootOf = (id) => {
      let cur = id
      while (parent.has(cur)) cur = parent.get(cur)
      return cur
    }

    const tipOf = (id) => {
      let cur = id
      while (child.has(cur)) cur = child.get(cur)
      return cur
    }

    const roots = new Set()
    for (const id of nodes.keys()) roots.add(rootOf(id))

    const tipByRoot = new Map()
    for (const r of roots) tipByRoot.set(r, tipOf(r))

    return { tomb, nodes, parent, child, rootOf, tipOf, tipByRoot }
  }

  const deriveStatus = (t) => {
    const status = String(t.status || "").toUpperCase()
    const from = t.from
    const to = t.to
    const required = from === to ? 1 : 2
    const confirmedCount = Array.isArray(t.confirmedBy) ? t.confirmedBy.length : 0

    const dl = t.deadline ? moment(t.deadline) : null
    if (status === "UNCONFIRMED" && dl && dl.isValid() && dl.isBefore(moment())) {
      return confirmedCount >= required ? "CLOSED" : "DISCARDED"
    }
    if (status === "CLOSED" || status === "DISCARDED" || status === "UNCONFIRMED") return status
    return status || "UNCONFIRMED"
  }

  const buildTransfer = (node) => {
    const c = node.c || {}
    return {
      id: node.key,
      from: c.from,
      to: c.to,
      concept: c.concept,
      amount: c.amount,
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      deadline: c.deadline,
      confirmedBy: Array.isArray(c.confirmedBy) ? c.confirmedBy : [],
      status: deriveStatus(c),
      tags: Array.isArray(c.tags) ? c.tags : [],
      opinions: c.opinions || {},
      opinions_inhabitants: Array.isArray(c.opinions_inhabitants) ? c.opinions_inhabitants : []
    }
  }

  return {
    type: "transfer",

    async resolveCurrentId(id) {
      const ssbClient = await openSsb()
      const messages = await getAllMessages(ssbClient)
      const idx = buildIndex(messages)

      let tip = id
      while (idx.child.has(tip)) tip = idx.child.get(tip)
      if (idx.tomb.has(tip)) throw new Error("Not found")
      return tip
    },

    async createTransfer(to, concept, amount, deadline, tagsRaw = []) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      if (!isValidId(to)) throw new Error("Invalid recipient ID")

      const num = parseNum(amount)
      if (!Number.isFinite(num) || num <= 0) throw new Error("Amount must be positive")

      const dl = moment(deadline, moment.ISO_8601, true)
      if (!dl.isValid() || dl.isBefore(moment())) throw new Error("Deadline must be in the future")

      const tags = normalizeTags(tagsRaw)
      const isSelf = to === userId
      const now = new Date().toISOString()

      const content = {
        type: "transfer",
        from: userId,
        to,
        concept: String(concept || ""),
        amount: num.toFixed(6),
        createdAt: now,
        updatedAt: now,
        deadline: dl.toISOString(),
        confirmedBy: [userId],
        status: isSelf ? "CLOSED" : "UNCONFIRMED",
        tags,
        opinions: {},
        opinions_inhabitants: []
      }

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg))
      })
    },

    async updateTransferById(id, to, concept, amount, deadline, tagsRaw = []) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const tipId = await this.resolveCurrentId(id)
      const old = await getMsg(ssbClient, tipId)

      if (!old?.content || old.content.type !== "transfer") throw new Error("Transfer not found")

      const current = old.content
      const currentStatus = deriveStatus(current)

      if (Object.keys(current.opinions || {}).length > 0) throw new Error("Cannot edit transfer after it has received opinions.")
      if (current.from !== userId) throw new Error("Not the author")
      if (currentStatus !== "UNCONFIRMED") throw new Error("Can only edit unconfirmed")

      const dlOld = current.deadline ? moment(current.deadline) : null
      if (dlOld && dlOld.isValid() && dlOld.isBefore(moment())) throw new Error("Cannot edit expired")

      if (!isValidId(to)) throw new Error("Invalid recipient ID")

      const num = parseNum(amount)
      if (!Number.isFinite(num) || num <= 0) throw new Error("Amount must be positive")

      const dl = moment(deadline, moment.ISO_8601, true)
      if (!dl.isValid() || dl.isBefore(moment())) throw new Error("Deadline must be in the future")

      const tags = normalizeTags(tagsRaw)
      const isSelf = to === userId

      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
      await new Promise((res, rej) => ssbClient.publish(tombstone, (err) => err ? rej(err) : res()))

      const updated = {
        type: "transfer",
        from: userId,
        to,
        concept: String(concept || ""),
        amount: num.toFixed(6),
        createdAt: current.createdAt,
        deadline: dl.toISOString(),
        confirmedBy: [userId],
        status: isSelf ? "CLOSED" : "UNCONFIRMED",
        tags,
        opinions: {},
        opinions_inhabitants: [],
        updatedAt: new Date().toISOString(),
        replaces: tipId
      }

      return new Promise((resolve, reject) => {
        ssbClient.publish(updated, (err, msg) => err ? reject(err) : resolve(msg))
      })
    },

    async confirmTransferById(id) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const tipId = await this.resolveCurrentId(id)
      const msg = await getMsg(ssbClient, tipId)

      if (!msg?.content || msg.content.type !== "transfer") throw new Error("Not found")

      const t = msg.content
      const status = deriveStatus(t)
      if (status !== "UNCONFIRMED") throw new Error("Not unconfirmed")
      if (t.to !== userId) throw new Error("Not the recipient")

      const dl = t.deadline ? moment(t.deadline) : null
      if (dl && dl.isValid() && dl.isBefore(moment())) throw new Error("Expired")

      const existing = Array.isArray(t.confirmedBy) ? t.confirmedBy : []
      if (existing.includes(userId)) throw new Error("Already confirmed")

      const required = t.from === t.to ? 1 : 2
      const newConfirmed = existing.concat(userId).filter((v, i, a) => a.indexOf(v) === i)
      const newStatus = newConfirmed.length >= required ? "CLOSED" : "UNCONFIRMED"

      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
      await new Promise((res, rej) => ssbClient.publish(tombstone, (e) => e ? rej(e) : res()))

      const upd = {
        ...t,
        confirmedBy: newConfirmed,
        status: newStatus,
        updatedAt: new Date().toISOString(),
        replaces: tipId
      }

      return new Promise((resolve, reject) => {
        ssbClient.publish(upd, (e2, result) => e2 ? reject(e2) : resolve(result))
      })
    },

    async deleteTransferById(id) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const tipId = await this.resolveCurrentId(id)
      const msg = await getMsg(ssbClient, tipId)

      if (!msg?.content || msg.content.type !== "transfer") throw new Error("Not found")

      const t = msg.content
      const st = deriveStatus(t)
      const confirmedCount = Array.isArray(t.confirmedBy) ? t.confirmedBy.length : 0
      const required = t.from === t.to ? 1 : 2

      if (t.from !== userId) throw new Error("Not the author")
      if (st !== "UNCONFIRMED") throw new Error("Not editable")
      if (confirmedCount >= required) throw new Error("Not editable")

      const dl = t.deadline ? moment(t.deadline) : null
      if (dl && dl.isValid() && dl.isBefore(moment())) throw new Error("Cannot delete expired")

      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
      return new Promise((resolve, reject) => {
        ssbClient.publish(tombstone, (err) => err ? reject(err) : resolve())
      })
    },

    async listAll(filter = "all") {
      const ssbClient = await openSsb()
      const messages = await getAllMessages(ssbClient)
      const idx = buildIndex(messages)

      const out = []
      for (const tipId of idx.tipByRoot.values()) {
        if (idx.tomb.has(tipId)) continue
        const node = idx.nodes.get(tipId)
        if (!node) continue
        out.push(buildTransfer(node))
      }
      return out
    },

    async getTransferById(id) {
      const ssbClient = await openSsb()
      const messages = await getAllMessages(ssbClient)
      const idx = buildIndex(messages)

      let tip = id
      while (idx.child.has(tip)) tip = idx.child.get(tip)
      if (idx.tomb.has(tip)) throw new Error("Not found")

      const node = idx.nodes.get(tip)
      if (node) return buildTransfer(node)

      const msg = await getMsg(ssbClient, tip)
      if (!msg?.content || msg.content.type !== "transfer") throw new Error("Not found")

      const tmpNode = { key: tip, ts: msg.timestamp || 0, c: msg.content, author: msg.author }
      return buildTransfer(tmpNode)
    },

    async createOpinion(id, category) {
      if (!categories.includes(category)) throw new Error("Invalid voting category")
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const tipId = await this.resolveCurrentId(id)
      const msg = await getMsg(ssbClient, tipId)

      if (!msg?.content || msg.content.type !== "transfer") throw new Error("Transfer not found")

      const t = msg.content
      const voters = Array.isArray(t.opinions_inhabitants) ? t.opinions_inhabitants : []
      if (voters.includes(userId)) throw new Error("Already voted")

      const updated = {
        ...t,
        opinions: {
          ...(t.opinions || {}),
          [category]: ((t.opinions || {})[category] || 0) + 1
        },
        opinions_inhabitants: voters.concat(userId),
        updatedAt: new Date().toISOString(),
        replaces: tipId
      }

      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
      await new Promise((res, rej) => ssbClient.publish(tombstone, (e) => e ? rej(e) : res()))

      return new Promise((resolve, reject) => {
        ssbClient.publish(updated, (e2, result) => e2 ? reject(e2) : resolve(result))
      })
    }
  }
}

