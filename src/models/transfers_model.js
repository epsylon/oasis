const fs = require("fs")
const path = require("path")
const pull = require("../server/node_modules/pull-stream")
const moment = require("../server/node_modules/moment")
const { getConfig } = require("../configs/config-manager.js")
const categories = require("../backend/opinion_categories")
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { dedupeByPreferring, norm } = require('../backend/dedupe')
const { readTyped } = require('./typed_log')
const logLimit = getConfig().ssbLogStream?.limit || 1000

const TRANSFER_TYPES = ["transfer", "transferConfirm", "transferOpinion", "ubiClaim", "tombstone"]

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

const defaultPubId = () => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "configs", "snh-invite-code.json"), "utf8"))
    const m = String(raw.code || "").match(/(@[A-Za-z0-9+/]+={0,2}\.ed25519)/)
    return m ? m[1] : ""
  } catch (_) { return "" }
}

const CATEGORIES = ["ECONOMIC", "TIME", "TRUST"]
const normalizeCategory = (raw) => {
  const c = String(raw || "ECONOMIC").trim().toUpperCase()
  return CATEGORIES.includes(c) ? c : "ECONOMIC"
}

module.exports = ({ cooler }) => {
  let ssb
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb }
  const ubiEpochOf = (c) => {
    const tags = Array.isArray(c.tags) ? c.tags.map(t => String(t)) : []
    const fromTag = tags.find(t => /^epoch:\d{4}-\d{2}$/i.test(t))
    if (fromTag) return fromTag.slice(6)
    const m = String(c.concept || "").match(/(\d{4}-\d{2})/)
    return m ? m[1] : ""
  }

  const getAllMessages = async (ssbClient) =>
    readTyped(ssbClient, TRANSFER_TYPES, { limit: logLimit })

  const getMsg = async (ssbClient, key) =>
    new Promise((resolve, reject) => {
      ssbClient.get(key, (err, msg) => err ? reject(err) : resolve(msg))
    })

  const buildIndex = (messages) => {
    const tomb = buildValidatedTombstoneSet(messages)
    const nodes = new Map()
    const parent = new Map()
    const child = new Map()
    const strictChild = new Map()
    const confirms = []
    const opinionMsgs = []
    const ubiByPub = new Map()
    const claimedPubs = new Map()
    const ubiClaimNodes = []

    for (const m of messages) {
      const k = m.key
      const v = m.value || {}
      const c = v.content
      if (!c) continue

      if (c.type === "tombstone") continue
      if (c.type === "transferConfirm") { confirms.push({ target: c.target, tip: typeof c.tip === "string" ? c.tip : null, author: v.author, ts: v.timestamp || 0 }); continue }
      if (c.type === "transferOpinion") { opinionMsgs.push({ target: c.target, author: v.author, category: c.category, ts: v.timestamp || 0 }); continue }

      if (c.type === "transfer") {
        if (c.from !== v.author) continue
        nodes.set(k, { key: k, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        if (c.replaces) {
          parent.set(k, c.replaces)
          child.set(c.replaces, k)
        }
        const tags = Array.isArray(c.tags) ? c.tags.map(t => String(t).toUpperCase()) : []
        if (tags.includes("UBI") && !tags.includes("REBALANCE") && c.to && c.concept) {
          const key = `${c.to}::${ubiEpochOf(c) || c.concept}`
          if (!ubiByPub.has(key)) ubiByPub.set(key, new Set())
          ubiByPub.get(key).add(v.author)
        }
      }

      if (c.type === "ubiClaim") {
        ubiClaimNodes.push({ k, v, c, ts: v.timestamp || m.timestamp || 0 })
        if (c.pubId) {
          if (!claimedPubs.has(v.author)) claimedPubs.set(v.author, new Set())
          claimedPubs.get(v.author).add(c.pubId)
        }
      }
    }

    const defaultPub = defaultPubId()
    for (const { k, v, c, ts } of ubiClaimNodes) {
      if (tomb.has(k)) continue
      const claimantId = v.author
      const epochId = c.epochId || ""
      const concept = `UBI - ${epochId}`.trim()
      const key = `${claimantId}::${epochId || concept}`
      const payers = ubiByPub.get(key)
      if (payers && ((c.pubId && payers.has(c.pubId)) || (defaultPub && payers.has(defaultPub)))) continue
      const synthetic = {
        type: "transfer",
        from: c.pubId || "",
        to: claimantId,
        concept,
        amount: String(c.amount || 0),
        createdAt: c.claimedAt || new Date(ts).toISOString(),
        updatedAt: c.claimedAt || new Date(ts).toISOString(),
        deadline: null,
        confirmedBy: [],
        status: "UNCONFIRMED",
        tags: ["UBI", "PENDING"],
        opinions: {},
        opinions_inhabitants: []
      }
      nodes.set(k, { key: k, ts, c: synthetic, author: claimantId })
    }

    for (const [k, t] of Array.from(parent.entries())) {
      const cn = nodes.get(k)
      const pn = nodes.get(t)
      if (!pn) { parent.delete(k); if (child.get(t) === k) child.delete(t); continue }
      if (!cn || cn.author !== pn.author) { parent.delete(k); if (child.get(t) === k) child.delete(t); nodes.delete(k) }
    }

    for (const [k, node] of nodes) {
      const t = node.c.replaces
      if (t) { const orig = nodes.get(t); if (orig && orig.author === node.author) strictChild.set(t, k) }
    }

    const rootOf = (id) => {
      let cur = id, g = 0
      while (parent.has(cur) && nodes.has(parent.get(cur)) && g++ < 100000) cur = parent.get(cur)
      return cur
    }


    const contentTipOf = (root) => {
      let cur = root, g = 0
      while (strictChild.has(cur) && g++ < 100000) cur = strictChild.get(cur)
      const n = nodes.get(cur), rn = nodes.get(root)
      return (n && rn && n.author === rn.author) ? cur : root
    }

    const roots = new Set()
    for (const id of nodes.keys()) roots.add(rootOf(id))

    const confirmsByRoot = new Map(), opinionsByRoot = new Map()
    for (const cf of confirms) { if (!nodes.has(cf.target)) continue; const r = rootOf(cf.target); if (!confirmsByRoot.has(r)) confirmsByRoot.set(r, []); confirmsByRoot.get(r).push(cf) }
    for (const op of opinionMsgs) { if (!nodes.has(op.target)) continue; const r = rootOf(op.target); if (!opinionsByRoot.has(r)) opinionsByRoot.set(r, []); opinionsByRoot.get(r).push(op) }

    const tipByRoot = new Map()
    for (const r of roots) tipByRoot.set(r, contentTipOf(r))

    const resolveGroup = (root) => {
      const contentTip = contentTipOf(root)
      const latest = nodes.get(contentTip) || nodes.get(root)
      if (!latest) return null
      const rootAuthor = nodes.get(root) ? nodes.get(root).author : null
      const rootConfirms = confirmsByRoot.get(root) || []
      const seal = rootConfirms.filter(cf => { const n = cf.tip ? nodes.get(cf.tip) : null; return n && n.author === rootAuthor && rootOf(cf.tip) === root && cf.author === n.c.to }).sort((a, b) => a.ts - b.ts)[0]
      const best = seal ? nodes.get(seal.tip) : latest
      const confirmedBy = new Set()
      const opinions = {}; const opinionSet = new Set()
      if (best.c.from && best.c.from === best.author) confirmedBy.add(best.c.from)
      for (const cf of rootConfirms) { if (cf.author === best.c.to) confirmedBy.add(cf.author) }
      for (const op of (opinionsByRoot.get(root) || [])) { if (!opinionSet.has(op.author)) { opinionSet.add(op.author); opinions[op.category] = (opinions[op.category] || 0) + 1 } }
      const ubiPayerTrusted = !!best.author && (best.author === defaultPub || !!(claimedPubs.get(best.c.to) && claimedPubs.get(best.c.to).has(best.author)))
      return { contentTip, best, confirmedBy: [...confirmedBy], opinions, opinions_inhabitants: [...opinionSet], tombstoned: tomb.has(contentTip) || tomb.has(best.key), ubiPayerTrusted }
    }

    return { tomb, nodes, parent, child, rootOf, tipByRoot, resolveGroup }
  }

  const isSettledUbi = (t) => {
    const tags = Array.isArray(t.tags) ? t.tags.map(x => String(x).toUpperCase()) : []
    return tags.includes("UBI") && !tags.includes("PENDING") && /^[0-9a-f]{64}$/i.test(String(t.txid || ""))
  }

  const deriveStatus = (t, ubiPayerTrusted = false) => {
    const required = t.from === t.to ? 1 : 2
    const confirmedCount = Array.isArray(t.confirmedBy) ? t.confirmedBy.length : 0

    if (ubiPayerTrusted && isSettledUbi(t)) return "CLOSED"
    if (confirmedCount >= required) return "CLOSED"
    const dl = t.deadline ? moment(t.deadline) : null
    if (dl && dl.isValid() && dl.isBefore(moment())) return "DISCARDED"
    return "UNCONFIRMED"
  }

  const buildTransfer = (node, agg) => {
    const c = node.c || {}
    const confirmedBy = agg ? agg.confirmedBy : (c.from && c.from === node.author ? [c.from] : [])
    const opinions = agg ? agg.opinions : (c.opinions || {})
    const opinions_inhabitants = agg ? agg.opinions_inhabitants : (Array.isArray(c.opinions_inhabitants) ? c.opinions_inhabitants : [])
    return {
      id: node.key,
      author: node.author,
      from: c.from,
      to: c.to,
      concept: c.concept,
      amount: c.amount,
      category: normalizeCategory(c.category),
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      deadline: c.deadline,
      confirmedBy,
      status: deriveStatus({ ...c, confirmedBy }, !!(agg && agg.ubiPayerTrusted)),
      tags: Array.isArray(c.tags) ? c.tags : [],
      txid: typeof c.txid === "string" ? c.txid : null,
      opinions,
      opinions_inhabitants
    }
  }

  return {
    type: "transfer",

    async resolveCurrentId(id) {
      const ssbClient = await openSsb()
      const messages = await getAllMessages(ssbClient)
      const idx = buildIndex(messages)

      const tip = idx.tipByRoot.get(idx.rootOf(id)) || id
      if (idx.tomb.has(tip)) throw new Error("Not found")
      return tip
    },

    async createTransfer(to, concept, amount, deadline, tagsRaw = [], category) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      if (!isValidId(to)) throw new Error("Invalid recipient ID")

      const num = parseNum(amount)
      if (!Number.isFinite(num) || num <= 0) throw new Error("Amount must be positive")

      const dl = moment(deadline, moment.ISO_8601, true)
      if (!dl.isValid() || dl.isBefore(moment())) throw new Error("Deadline must be in the future")

      const tags = normalizeTags(tagsRaw)
      const cat = normalizeCategory(category)
      const isSelf = to === userId
      const now = new Date().toISOString()

      const content = {
        type: "transfer",
        from: userId,
        to,
        concept: String(concept || ""),
        amount: num.toFixed(6),
        category: cat,
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

    async updateTransferById(id, to, concept, amount, deadline, tagsRaw = [], category) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const tipId = await this.resolveCurrentId(id)
      const old = await getMsg(ssbClient, tipId)

      if (!old?.content || old.content.type !== "transfer") throw new Error("Transfer not found")
      if (old.author !== old.content.from) throw new Error("Not the author")

      const current = old.content
      const idxU = buildIndex(await getAllMessages(ssbClient))
      const gU = idxU.resolveGroup(idxU.rootOf(tipId))
      const aggU = gU ? buildTransfer(gU.best, gU) : buildTransfer({ key: tipId, c: current })
      const currentStatus = aggU.status

      if (Object.keys(aggU.opinions || {}).some(k => (aggU.opinions[k] || 0) > 0)) throw new Error("Cannot edit transfer after it has received opinions.")
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
      const cat = normalizeCategory(category !== undefined ? category : current.category)
      const isSelf = to === userId

      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
      await new Promise((res, rej) => ssbClient.publish(tombstone, (err) => err ? rej(err) : res()))

      const updated = {
        type: "transfer",
        from: userId,
        to,
        concept: String(concept || ""),
        amount: num.toFixed(6),
        category: cat,
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
      let tipId
      try { tipId = await this.resolveCurrentId(id) } catch (_) { tipId = id }
      const msg = await getMsg(ssbClient, tipId)

      if (!msg?.content) throw new Error("Not found")

      if (msg.content.type !== "transfer") throw new Error("Not found")
      if (msg.author !== msg.content.from) throw new Error("Not found")

      const idx = buildIndex(await getAllMessages(ssbClient))
      const root = idx.rootOf(tipId)
      const g = idx.resolveGroup(root)
      const t = g ? buildTransfer(g.best, g) : buildTransfer({ key: tipId, c: msg.content })

      if (t.status !== "UNCONFIRMED") throw new Error("Not unconfirmed")
      if (t.to !== userId) throw new Error("Not the recipient")

      const dl = t.deadline ? moment(t.deadline) : null
      if (dl && dl.isValid() && dl.isBefore(moment())) throw new Error("Expired")

      if ((Array.isArray(t.confirmedBy) ? t.confirmedBy : []).includes(userId)) throw new Error("Already confirmed")

      const content = { type: "transferConfirm", target: root, tip: tipId, createdAt: new Date().toISOString() }
      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (e2, result) => e2 ? reject(e2) : resolve(result))
      })
    },

    async deleteTransferById(id) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const tipId = await this.resolveCurrentId(id)
      const msg = await getMsg(ssbClient, tipId)

      if (!msg?.content || msg.content.type !== "transfer") throw new Error("Not found")
      if (msg.author !== msg.content.from) throw new Error("Not the author")

      const idxD = buildIndex(await getAllMessages(ssbClient))
      const gD = idxD.resolveGroup(idxD.rootOf(tipId))
      const t = gD ? buildTransfer(gD.best, gD) : buildTransfer({ key: tipId, c: msg.content })
      const st = t.status
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
      for (const root of idx.tipByRoot.keys()) {
        const g = idx.resolveGroup(root)
        if (!g || g.tombstoned) continue
        out.push(buildTransfer(g.best, g))
      }
      return dedupeByPreferring(out, (t) => (t.author && t.createdAt) ? norm(t.author) + "|" + norm(t.createdAt) : null, (t) => (Array.isArray(t.confirmedBy) ? t.confirmedBy.length : 0))
    },

    async getTransferById(id) {
      const ssbClient = await openSsb()
      const messages = await getAllMessages(ssbClient)
      const idx = buildIndex(messages)

      const root = idx.rootOf(id)
      const g = idx.resolveGroup(root)
      if (g && !g.tombstoned) return buildTransfer(g.best, g)
      if (g && g.tombstoned) throw new Error("Not found")

      const msg = await getMsg(ssbClient, id)
      if (!msg?.content || msg.content.type !== "transfer") throw new Error("Not found")
      if (msg.author !== msg.content.from) throw new Error("Not found")

      const tmpNode = { key: id, ts: msg.timestamp || 0, c: msg.content, author: msg.author }
      return buildTransfer(tmpNode)
    },

    async createOpinion(id, category) {
      if (!categories.includes(category)) throw new Error("Invalid voting category")
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const idx = buildIndex(await getAllMessages(ssbClient))
      const root = idx.rootOf(id)
      const g = idx.resolveGroup(root)
      if (!g || g.tombstoned) throw new Error("Transfer not found")
      if ((g.opinions_inhabitants || []).includes(userId)) throw new Error("Already voted")

      const content = { type: "transferOpinion", target: root, category, createdAt: new Date().toISOString() }
      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (e2, result) => e2 ? reject(e2) : resolve(result))
      })
    }
  }
}

