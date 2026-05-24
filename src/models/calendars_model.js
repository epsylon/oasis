const pull = require("../server/node_modules/pull-stream")
const crypto = require("crypto")
const { getConfig } = require("../configs/config-manager.js")
const { buildValidatedTombstoneSet } = require('./tombstone_validator')
const logLimit = getConfig().ssbLogStream?.limit || 1000
const INVITE_CODE_BYTES = 16

const safeText = (v) => String(v || "").trim()
const normalizeTags = (raw) => {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(t => String(t || "").trim()).filter(Boolean)
  return String(raw).split(",").map(t => t.trim()).filter(Boolean)
}
const hasAnyInterval = (w, m, y) => !!(w || m || y)
const expandRecurrence = (firstDate, deadline, weekly, monthly, yearly) => {
  const start = new Date(firstDate)
  const out = [start]
  if (!deadline || !hasAnyInterval(weekly, monthly, yearly)) return out
  const end = new Date(deadline).getTime()
  const seen = new Set([start.getTime()])
  const walk = (mutate) => {
    const n = new Date(start)
    mutate(n)
    while (n.getTime() <= end) {
      const t = n.getTime()
      if (!seen.has(t)) { seen.add(t); out.push(new Date(n)) }
      mutate(n)
    }
  }
  if (weekly)  walk((d) => d.setDate(d.getDate() + 7))
  if (monthly) walk((d) => d.setMonth(d.getMonth() + 1))
  if (yearly)  walk((d) => d.setFullYear(d.getFullYear() + 1))
  return out.sort((a, b) => a.getTime() - b.getTime())
}

module.exports = ({ cooler, pmModel, tribeCrypto, calendarCrypto, tribesModel }) => {
  let ssb
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb }

  const ownCrypto = calendarCrypto || tribeCrypto
  const lookupKey = (rid) => (ownCrypto && ownCrypto.getKey(rid)) || (tribeCrypto && tribeCrypto.getKey(rid)) || null
  const lookupKeys = (rid) => {
    const a = (ownCrypto && ownCrypto.getKeys(rid)) || []
    if (a.length) return a
    return (tribeCrypto && tribeCrypto.getKeys(rid)) || []
  }
  const lookupGen = (rid) => ((ownCrypto && ownCrypto.getGen(rid)) || (tribeCrypto && tribeCrypto.getGen(rid)) || 0)

  const rotateCalendarKey = async (rootId, remainingMembers) => {
    if (!ownCrypto || !tribeCrypto || !rootId) return
    const existing = lookupKey(rootId)
    if (!existing) return
    const newKey = ownCrypto.generateTribeKey()
    const newGen = ownCrypto.addNewKey(rootId, newKey)
    if (!Array.isArray(remainingMembers) || !remainingMembers.length) return
    const ssbClient = await openSsb()
    const ssbKeys = require("../server/node_modules/ssb-keys")
    const memberKeys = {}
    for (const m of remainingMembers) {
      try { memberKeys[m] = tribeCrypto.boxKeyForMember(newKey, m, ssbKeys) } catch (_) {}
    }
    if (Object.keys(memberKeys).length) {
      await new Promise((resolve) => {
        ssbClient.publish({ type: "tribe-keys", tribeId: rootId, generation: newGen, memberKeys }, () => resolve())
      })
    }
  }

  const ingestOwnTribeKeys = async () => {
    if (!ownCrypto) return
    try {
      const ssbClient = await openSsb()
      const ssbKeys = require("../server/node_modules/ssb-keys")
      const config = require("../server/ssb_config")
      const msgs = await readAll(ssbClient)
      for (const m of msgs) {
        const c = m.value && m.value.content
        if (!c || c.type !== "tribe-keys") continue
        const memberKeys = c.memberKeys
        if (!memberKeys || typeof memberKeys !== "object") continue
        const boxed = memberKeys[ssbClient.id]
        if (!boxed) continue
        try {
          const unboxed = ssbKeys.unbox(boxed, config.keys)
          const key = typeof unboxed === "string" ? unboxed : (unboxed && unboxed.toString ? unboxed.toString() : null)
          if (key && c.tribeId) ownCrypto.addNewKey(c.tribeId, key)
        } catch (_) {}
      }
    } catch (_) {}
  }

  const readAll = async (ssbClient) =>
    new Promise((resolve, reject) =>
      pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((err, msgs) => err ? reject(err) : resolve(msgs)))
    )

  const tribeHelpers = tribeCrypto ? tribeCrypto.createHelpers(tribesModel) : null
  const encryptIfTribe = tribeHelpers ? tribeHelpers.encryptIfTribe : async (c) => c
  const decryptIfTribe = tribeHelpers ? tribeHelpers.decryptIfTribe : async (c) => c
  const assertReadable = tribeHelpers ? tribeHelpers.assertReadable : () => {}

  const encryptStandalone = (content, rootId) => {
    if (!tribeCrypto || !rootId) return content
    const key = lookupKey(rootId)
    if (!key) return content
    return tribeCrypto.encryptContent(content, [key], true)
  }

  const decryptCalendarRoot = (content, rootId) => {
    if (!content || !content.encryptedPayload) return content
    if (!tribeCrypto) return content
    const keys = lookupKeys(rootId)
    if (!keys || !keys.length) return { ...content, _undecryptable: true }
    return tribeCrypto.decryptContent(content, keys.map(k => [k]))
  }

  const decryptIndexNodes = async (idx) => {
    if (!tribeCrypto) return
    for (const [k, n] of idx.nodes.entries()) {
      if (!n.c || !n.c.encryptedPayload) continue
      let root = k
      while (idx.parent.has(root)) root = idx.parent.get(root)
      let dec = null
      if (n.c.tribeId && tribesModel) {
        try {
          const r = await tribeCrypto.decryptFromTribe(n.c, tribesModel)
          if (r && !r._undecryptable) dec = r
        } catch (_) {}
      }
      if (!dec) {
        const r = decryptCalendarRoot(n.c, root)
        if (r && !r._undecryptable) dec = r
      }
      if (dec) {
        idx.nodes.set(k, { ...n, c: { ...dec, _decrypted: true } })
      } else {
        idx.nodes.set(k, { ...n, c: { ...n.c, _decrypted: false } })
      }
    }
  }

  const buildIndex = (messages) => {
    const tomb = new Set()
    const nodes = new Map()
    const parent = new Map()
    const child = new Map()
    const authorByKey = new Map()
    const tombRequests = []

    for (const m of messages) {
      const k = m.key
      const v = m.value || {}
      const c = v.content
      if (!c) continue
      if (c.type === "tombstone" && c.target) { tombRequests.push({ target: c.target, author: v.author }); continue }
      if (c.type === "calendar") {
        nodes.set(k, { key: k, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        authorByKey.set(k, v.author)
        if (c.replaces) { parent.set(k, c.replaces); child.set(c.replaces, k) }
      }
    }

    for (const t of tombRequests) {
      const targetAuthor = authorByKey.get(t.target)
      if (targetAuthor && t.author === targetAuthor) tomb.add(t.target)
    }

    const rootOf = (id) => { let cur = id; while (parent.has(cur)) cur = parent.get(cur); return cur }
    const tipOf = (id) => { let cur = id; while (child.has(cur)) cur = child.get(cur); return cur }

    const roots = new Set()
    for (const id of nodes.keys()) roots.add(rootOf(id))
    const tipByRoot = new Map()
    for (const r of roots) tipByRoot.set(r, tipOf(r))

    return { tomb, nodes, parent, child, rootOf, tipOf, tipByRoot }
  }

  const buildCalendar = (node, rootId) => {
    const c = node.c || {}
    if (c.type !== "calendar") return null
    const undec = c.encryptedPayload && c._decrypted === false
    return {
      key: node.key,
      rootId,
      title: undec ? "" : safeText(c.title),
      status: c.status || "OPEN",
      deadline: undec ? "" : (c.deadline || ""),
      tags: Array.isArray(c.tags) ? c.tags : [],
      author: c.author || node.author,
      participants: Array.isArray(c.participants) ? c.participants : [],
      invites: Array.isArray(c.invites) ? c.invites : [],
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      tribeId: c.tribeId || null,
      encrypted: !!undec
    }
  }


  const isClosed = (calendar) => {
    if (calendar.status === "CLOSED") return true
    if (!calendar.deadline) return false
    return new Date(calendar.deadline).getTime() <= Date.now()
  }

  return {
    type: "calendar",

    async ingestKeys() { await ingestOwnTribeKeys() },

    async pruneOrphanKeys() {
      if (!ownCrypto || typeof ownCrypto.getAllRootIds !== "function") return 0
      try {
        const ssbClient = await openSsb()
        const messages = await readAll(ssbClient)
        const live = new Set()
        const tomb = buildValidatedTombstoneSet(messages)
        for (const m of messages) {
          const c = m.value && m.value.content
          if (!c) continue
          if (c.type === "calendar") live.add(m.key)
        }
        const all = ownCrypto.getAllRootIds()
        let removed = 0
        for (const rid of all) {
          if (!live.has(rid) || tomb.has(rid)) {
            try { ownCrypto.dropKey(rid); removed += 1 } catch (_) {}
          }
        }
        return removed
      } catch (_) { return 0 }
    },

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

    async createCalendar({ title, status, deadline, tags, firstDate, firstDateLabel, firstNote, intervalWeekly, intervalMonthly, intervalYearly, tribeId }) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const now = new Date().toISOString()
      const validStatus = ["OPEN", "CLOSED"].includes(String(status).toUpperCase()) ? String(status).toUpperCase() : "OPEN"

      if (deadline && new Date(deadline).getTime() <= Date.now()) throw new Error("Deadline must be in the future")
      if (!firstDate || new Date(firstDate).getTime() <= Date.now()) throw new Error("First date must be in the future")

      let plainContent = {
        type: "calendar",
        title: safeText(title),
        status: validStatus,
        deadline: deadline || "",
        tags: normalizeTags(tags),
        author: userId,
        participants: [userId],
        invites: [],
        createdAt: now,
        updatedAt: now,
        ...(tribeId ? { tribeId } : {})
      }

      let calKey = null
      let content = plainContent
      if (tribeId) {
        content = await encryptIfTribe(plainContent)
      } else if (tribeCrypto) {
        calKey = ownCrypto.generateTribeKey()
        content = tribeCrypto.encryptContent(plainContent, [calKey], true)
      }

      const calMsg = await new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg))
      })

      const calendarId = calMsg.key

      if (calKey && tribeCrypto) {
        ownCrypto.setKey(calendarId, calKey, 1)
        try {
          const ssbKeys = require("../server/node_modules/ssb-keys")
          const boxedKey = tribeCrypto.boxKeyForMember(calKey, userId, ssbKeys)
          await new Promise((resolve) => {
            ssbClient.publish({ type: "tribe-keys", tribeId: calendarId, generation: 1, memberKeys: { [userId]: boxedKey } }, () => resolve())
          })
        } catch (_) {}
        if (validStatus === "OPEN") {
          try {
            const pubCode = crypto.randomBytes(INVITE_CODE_BYTES).toString("hex")
            const inviteSalt = tribeCrypto.generateInviteSalt()
            const ek = tribeCrypto.encryptForInvite(calKey, pubCode, inviteSalt)
            const tipId = await this.resolveCurrentId(calendarId)
            const item = await new Promise((resolve, reject) => ssbClient.get(tipId, (e, it) => e ? reject(e) : resolve(it)))
            const dec = decryptCalendarRoot(item.content, calendarId)
            let updated = {
              type: "calendar",
              title: dec.title || "",
              status: validStatus,
              deadline: dec.deadline || "",
              tags: Array.isArray(dec.tags) ? dec.tags : [],
              author: userId,
              participants: [userId],
              invites: [{ code: pubCode, ek, salt: inviteSalt, gen: 1, public: true }],
              createdAt: dec.createdAt,
              updatedAt: new Date().toISOString(),
              replaces: tipId
            }
            updated = encryptStandalone(updated, calendarId)
            await new Promise((resolve, reject) => ssbClient.publish(updated, (e, res) => e ? reject(e) : resolve(res)))
            await new Promise((resolve, reject) => ssbClient.publish({ type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }, e => e ? reject(e) : resolve()))
          } catch (_) {}
        }
      }

      let dateContent = {
        type: "calendarDate",
        calendarId,
        date: new Date(firstDate).toISOString(),
        label: safeText(firstDateLabel),
        author: userId,
        createdAt: new Date().toISOString(),
        ...(intervalWeekly ? { intervalWeekly: true } : {}),
        ...(intervalMonthly ? { intervalMonthly: true } : {}),
        ...(intervalYearly ? { intervalYearly: true } : {}),
        ...(deadline && hasAnyInterval(intervalWeekly, intervalMonthly, intervalYearly) ? { intervalDeadline: deadline } : {}),
        ...(tribeId ? { tribeId } : {})
      }
      if (tribeId) dateContent = await encryptIfTribe(dateContent)
      else if (calKey) dateContent = tribeCrypto.encryptContent(dateContent, [calKey], true)
      const dateMsg = await new Promise((resolve, reject) => {
        ssbClient.publish(dateContent, (err, msg) => err ? reject(err) : resolve(msg))
      })

      if (firstNote && safeText(firstNote)) {
        let noteContent = {
          type: "calendarNote",
          calendarId,
          dateId: dateMsg.key,
          text: safeText(firstNote),
          author: userId,
          createdAt: new Date().toISOString(),
          ...(tribeId ? { tribeId } : {})
        }
        if (tribeId) noteContent = await encryptIfTribe(noteContent)
        else if (calKey) noteContent = tribeCrypto.encryptContent(noteContent, [calKey], true)
        await new Promise((resolve, reject) => {
          ssbClient.publish(noteContent, (err, msg) => err ? reject(err) : resolve(msg))
        })
      }

      return calMsg
    },

    async updateCalendarById(id, data) {
      const tipId = await this.resolveCurrentId(id)
      const rootId = await this.resolveRootId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const item = await new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, it) => err ? reject(err) : resolve(it))
      })
      if (!item || !item.content) throw new Error("Calendar not found")
      const oldDec = item.content.tribeId
        ? await decryptIfTribe(item.content)
        : decryptCalendarRoot(item.content, rootId)
      assertReadable(oldDec, "Calendar")
      if ((oldDec.author || item.content.author) !== userId) throw new Error("Not the author")
      let updated = {
        type: "calendar",
        title: data.title !== undefined ? safeText(data.title) : (oldDec.title || ""),
        status: data.status !== undefined ? (["OPEN","CLOSED"].includes(String(data.status).toUpperCase()) ? String(data.status).toUpperCase() : oldDec.status) : (oldDec.status || "OPEN"),
        deadline: data.deadline !== undefined ? data.deadline : (oldDec.deadline || ""),
        tags: data.tags !== undefined ? normalizeTags(data.tags) : (Array.isArray(oldDec.tags) ? oldDec.tags : []),
        author: oldDec.author || userId,
        participants: oldDec.participants || [userId],
        invites: Array.isArray(oldDec.invites) ? oldDec.invites : [],
        ...(item.content.tribeId ? { tribeId: item.content.tribeId } : {}),
        createdAt: oldDec.createdAt,
        updatedAt: new Date().toISOString(),
        replaces: tipId
      }
      if (item.content.tribeId) updated = await encryptIfTribe(updated)
      else updated = encryptStandalone(updated, rootId)
      const result = await new Promise((resolve, reject) => ssbClient.publish(updated, (e, res) => e ? reject(e) : resolve(res)))
      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
      await new Promise((resolve, reject) => ssbClient.publish(tombstone, e => e ? reject(e) : resolve()))
      return result
    },

    async deleteCalendarById(id) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const item = await new Promise((resolve, reject) => ssbClient.get(tipId, (e, it) => e ? reject(e) : resolve(it)))
      if (!item || !item.content) throw new Error("Calendar not found")
      const dec = await decryptIfTribe(item.content)
      assertReadable(dec, "Calendar")
      const contentAuthor = (dec && dec.author) || (typeof item.content === 'object' && item.content.author)
      if (contentAuthor !== userId) throw new Error("Not the author")
      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
      return new Promise((resolve, reject) => ssbClient.publish(tombstone, e => e ? reject(e) : resolve()))
    },

    async joinCalendar(calendarId) {
      const tipId = await this.resolveCurrentId(calendarId)
      const rootId = await this.resolveRootId(calendarId)
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const item = await new Promise((resolve, reject) => ssbClient.get(tipId, (e, it) => e ? reject(e) : resolve(it)))
      if (!item || !item.content) throw new Error("Calendar not found")
      const dec = item.content.tribeId
        ? await decryptIfTribe(item.content)
        : decryptCalendarRoot(item.content, rootId)
      assertReadable(dec, "Calendar")
      const participants = Array.isArray(dec.participants) ? dec.participants : []
      if (participants.includes(userId)) return
      if (tribeCrypto && Array.isArray(dec.invites)) {
        const pub = dec.invites.find(inv => typeof inv === "object" && inv.public === true && inv.code && (inv.ek || inv.ekChain))
        if (pub) return await this.joinByInvite(pub.code)
      }
      let updated = {
        type: "calendar",
        title: dec.title || "",
        status: dec.status || "OPEN",
        deadline: dec.deadline || "",
        tags: Array.isArray(dec.tags) ? dec.tags : [],
        author: dec.author,
        participants: [...participants, userId],
        invites: Array.isArray(dec.invites) ? dec.invites : [],
        ...(item.content.tribeId ? { tribeId: item.content.tribeId } : {}),
        createdAt: dec.createdAt,
        updatedAt: new Date().toISOString(),
        replaces: tipId
      }
      if (item.content.tribeId) updated = await encryptIfTribe(updated)
      else updated = encryptStandalone(updated, rootId)
      const result = await new Promise((resolve, reject) => ssbClient.publish(updated, (e, res) => e ? reject(e) : resolve(res)))
      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
      await new Promise((resolve, reject) => ssbClient.publish(tombstone, e => e ? reject(e) : resolve()))
      return result
    },

    async leaveCalendar(calendarId) {
      const tipId = await this.resolveCurrentId(calendarId)
      const rootId = await this.resolveRootId(calendarId)
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const item = await new Promise((resolve, reject) => ssbClient.get(tipId, (e, it) => e ? reject(e) : resolve(it)))
      if (!item || !item.content) throw new Error("Calendar not found")
      const dec = item.content.tribeId
        ? await decryptIfTribe(item.content)
        : decryptCalendarRoot(item.content, rootId)
      assertReadable(dec, "Calendar")
      if ((dec.author || item.content.author) === userId) throw new Error("Author cannot leave")
      const participants = Array.isArray(dec.participants) ? dec.participants : []
      if (!participants.includes(userId)) return
      let updated = {
        type: "calendar",
        title: dec.title || "",
        status: dec.status || "OPEN",
        deadline: dec.deadline || "",
        tags: Array.isArray(dec.tags) ? dec.tags : [],
        author: dec.author,
        participants: participants.filter(p => p !== userId),
        invites: Array.isArray(dec.invites) ? dec.invites : [],
        ...(item.content.tribeId ? { tribeId: item.content.tribeId } : {}),
        createdAt: dec.createdAt,
        updatedAt: new Date().toISOString(),
        replaces: tipId
      }
      if (item.content.tribeId) updated = await encryptIfTribe(updated)
      else updated = encryptStandalone(updated, rootId)
      const result = await new Promise((resolve, reject) => ssbClient.publish(updated, (e, res) => e ? reject(e) : resolve(res)))
      try { await rotateCalendarKey(rootId, updated.participants) } catch (_) {}
      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
      await new Promise((resolve, reject) => ssbClient.publish(tombstone, e => e ? reject(e) : resolve()))
      return result
    },

    async findCalendarByLinkText(linkSubstring) {
      if (!linkSubstring) return null
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      await decryptIndexNodes(idx)
      for (const node of idx.nodes.values()) {
        const c = node && node.c
        if (!c || c.type !== "calendarNote") continue
        if (typeof c.text === "string" && c.text.includes(linkSubstring)) {
          return c.calendarId || null
        }
      }
      return null
    },

    async getCalendarById(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      await decryptIndexNodes(idx)
      let tip = id
      while (idx.child.has(tip)) tip = idx.child.get(tip)
      if (idx.tomb.has(tip)) return null
      const node = idx.nodes.get(tip)
      if (!node || node.c.type !== "calendar") return null
      let root = tip
      while (idx.parent.has(root)) root = idx.parent.get(root)
      const cal = buildCalendar(node, root)
      if (!cal) return null
      cal.isClosed = isClosed(cal)
      return cal
    },

    async listAll({ filter = "all", viewerId } = {}) {
      const ssbClient = await openSsb()
      const uid = viewerId || ssbClient.id
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      await decryptIndexNodes(idx)
      const items = []
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue
        const node = idx.nodes.get(tipId)
        if (!node || node.c.type !== "calendar") continue
        const cal = buildCalendar(node, rootId)
        if (!cal) continue
        cal.isClosed = isClosed(cal)
        items.push(cal)
      }
      let list = items
      if (filter === "mine") list = list.filter(c => c.author === uid)
      else if (filter === "recent") {
        const now = Date.now()
        list = list.filter(c => new Date(c.createdAt).getTime() >= now - 86400000)
      }
      else if (filter === "open") list = list.filter(c => !c.isClosed)
      else if (filter === "closed") list = list.filter(c => c.isClosed)
      return list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    },

    async addDate(calendarId, date, label, intervalWeekly, intervalMonthly, intervalYearly, intervalDeadline) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const rootId = await this.resolveRootId(calendarId)
      const cal = await this.getCalendarById(rootId)
      if (!cal) throw new Error("Calendar not found")
      if (cal.status === "CLOSED" && userId !== cal.author) throw new Error("Only the author can add dates to a CLOSED calendar")
      if (!date || new Date(date).getTime() <= Date.now()) throw new Error("Date must be in the future")

      const hasInterval = hasAnyInterval(intervalWeekly, intervalMonthly, intervalYearly)
      const ruleDeadline = hasInterval ? (intervalDeadline || cal.deadline || "") : ""
      let dateContent = {
        type: "calendarDate",
        calendarId: rootId,
        date: new Date(date).toISOString(),
        label: safeText(label),
        author: userId,
        createdAt: new Date().toISOString(),
        ...(intervalWeekly ? { intervalWeekly: true } : {}),
        ...(intervalMonthly ? { intervalMonthly: true } : {}),
        ...(intervalYearly ? { intervalYearly: true } : {}),
        ...(ruleDeadline ? { intervalDeadline: ruleDeadline } : {}),
        ...(cal.tribeId ? { tribeId: cal.tribeId } : {})
      }
      if (cal.tribeId) dateContent = await encryptIfTribe(dateContent)
      else dateContent = encryptStandalone(dateContent, rootId)
      const msg = await new Promise((resolve, reject) => {
        ssbClient.publish(dateContent, (err, m) => err ? reject(err) : resolve(m))
      })
      return [msg]
    },

    async getDatesForCalendar(calendarId) {
      const rootId = await this.resolveRootId(calendarId)
      const cal = await this.getCalendarById(rootId)
      const calDeadline = cal && cal.deadline ? cal.deadline : ""
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const authorByKey = new Map()
      for (const m of messages) authorByKey.set(m.key, (m.value || {}).author)
      const tombstoned = new Set()
      for (const m of messages) {
        const c = (m.value || {}).content
        if (c && c.type === "tombstone" && c.target) {
          const targetAuthor = authorByKey.get(c.target)
          if (targetAuthor && (m.value || {}).author === targetAuthor) tombstoned.add(c.target)
        }
      }
      const dates = []
      for (const m of messages) {
        if (tombstoned.has(m.key)) continue
        const v = m.value || {}
        const c = v.content
        if (!c || c.type !== "calendarDate") continue
        if (c.calendarId !== rootId) continue
        let dec = c
        if (c.encryptedPayload && tribeCrypto) {
          if (c.tribeId && tribesModel) {
            const r = await tribeCrypto.decryptFromTribe(c, tribesModel)
            dec = r && !r._undecryptable ? r : c
            if (r && r._undecryptable) continue
          } else {
            const keys = lookupKeys(c.calendarId)
            if (keys && keys.length) {
              const r = tribeCrypto.decryptContent(c, keys.map(k => [k]))
              dec = r && !r._undecryptable ? r : c
              if (r && r._undecryptable) continue
            }
          }
        }
        const baseEntry = {
          key: m.key,
          calendarId: dec.calendarId || c.calendarId,
          label: dec.label || "",
          author: dec.author || v.author,
          createdAt: dec.createdAt || new Date(v.timestamp || 0).toISOString()
        }
        const hasInterval = !!(dec.intervalWeekly || dec.intervalMonthly || dec.intervalYearly)
        const ruleDeadline = dec.intervalDeadline || calDeadline
        if (hasInterval && ruleDeadline) {
          const occurrences = expandRecurrence(dec.date, ruleDeadline, dec.intervalWeekly, dec.intervalMonthly, dec.intervalYearly)
          for (const occ of occurrences) {
            dates.push({ ...baseEntry, date: occ.toISOString() })
          }
        } else {
          dates.push({ ...baseEntry, date: dec.date })
        }
      }
      dates.sort((a, b) => new Date(a.date) - new Date(b.date))
      return dates
    },

    async deleteDate(dateId, calendarId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const rootId = await this.resolveRootId(calendarId)
      const cal = await this.getCalendarById(rootId)
      if (!cal) throw new Error("Calendar not found")
      const messages = await readAll(ssbClient)
      const authorByKey = new Map()
      for (const m of messages) authorByKey.set(m.key, (m.value || {}).author)
      const tombstoned = new Set()
      for (const m of messages) {
        const c = (m.value || {}).content
        if (c && c.type === "tombstone" && c.target) {
          const targetAuthor = authorByKey.get(c.target)
          if (targetAuthor && (m.value || {}).author === targetAuthor) tombstoned.add(c.target)
        }
      }
      let dateAuthor = null
      for (const m of messages) {
        if (m.key !== dateId) continue
        const c = (m.value || {}).content
        if (!c || c.type !== "calendarDate") continue
        if (tombstoned.has(m.key)) break
        let dec = c
        if (c.encryptedPayload && tribeCrypto && tribesModel) {
          const r = await tribeCrypto.decryptFromTribe(c, tribesModel)
          if (r && !r._undecryptable) dec = r
        }
        dateAuthor = dec.author || (m.value || {}).author
        break
      }
      if (!dateAuthor) throw new Error("Date not found")
      if (dateAuthor !== userId && cal.author !== userId) throw new Error("Not authorized")
      for (const m of messages) {
        const c = (m.value || {}).content
        if (!c || c.type !== "calendarNote") continue
        if (tombstoned.has(m.key)) continue
        if (c.dateId !== dateId) continue
        await new Promise((resolve, reject) => {
          ssbClient.publish({ type: "tombstone", target: m.key, deletedAt: new Date().toISOString(), author: userId }, (e) => e ? reject(e) : resolve())
        })
      }
      return new Promise((resolve, reject) => {
        ssbClient.publish({ type: "tombstone", target: dateId, deletedAt: new Date().toISOString(), author: userId }, (e) => e ? reject(e) : resolve())
      })
    },

    async addNote(calendarId, dateId, text) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const rootId = await this.resolveRootId(calendarId)
      const cal = await this.getCalendarById(rootId)
      if (!cal) throw new Error("Calendar not found")
      if (!cal.participants.includes(userId)) throw new Error("Only participants can add notes")
      let noteContent = {
        type: "calendarNote",
        calendarId: rootId,
        dateId,
        text: safeText(text),
        author: userId,
        createdAt: new Date().toISOString(),
        ...(cal.tribeId ? { tribeId: cal.tribeId } : {})
      }
      if (cal.tribeId) noteContent = await encryptIfTribe(noteContent)
      else noteContent = encryptStandalone(noteContent, rootId)
      return new Promise((resolve, reject) => {
        ssbClient.publish(noteContent, (err, msg) => err ? reject(err) : resolve(msg))
      })
    },

    async deleteNote(noteId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const item = await new Promise((resolve, reject) => ssbClient.get(noteId, (e, it) => e ? reject(e) : resolve(it)))
      if (!item || !item.content) throw new Error("Note not found")
      const dec = await decryptIfTribe(item.content)
      if ((dec.author || item.content.author) !== userId) throw new Error("Not the author")
      return new Promise((resolve, reject) => {
        ssbClient.publish({ type: "tombstone", target: noteId, deletedAt: new Date().toISOString(), author: userId }, (e, msg) => e ? reject(e) : resolve(msg))
      })
    },

    async getNotesForDate(calendarId, dateId) {
      const rootId = await this.resolveRootId(calendarId)
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const authorByKey = new Map()
      for (const m of messages) authorByKey.set(m.key, (m.value || {}).author)
      const tombstoned = new Set()
      for (const m of messages) {
        const c = (m.value || {}).content
        if (c && c.type === "tombstone" && c.target) {
          const targetAuthor = authorByKey.get(c.target)
          if (targetAuthor && (m.value || {}).author === targetAuthor) tombstoned.add(c.target)
        }
      }
      const notes = []
      for (const m of messages) {
        const v = m.value || {}
        const c = v.content
        if (!c || c.type !== "calendarNote") continue
        if (tombstoned.has(m.key)) continue
        if (c.calendarId !== rootId || c.dateId !== dateId) continue
        let dec = c
        if (c.encryptedPayload && tribeCrypto && tribesModel) {
          const r = await tribeCrypto.decryptFromTribe(c, tribesModel)
          if (r && !r._undecryptable) dec = r
          else continue
        }
        notes.push({
          key: m.key,
          calendarId: dec.calendarId || c.calendarId,
          dateId: dec.dateId || c.dateId,
          text: dec.text || "",
          author: dec.author || v.author,
          createdAt: dec.createdAt || new Date(v.timestamp || 0).toISOString()
        })
      }
      notes.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      return notes
    },

    async checkDueReminders() {
      if (!pmModel) return
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const now = Date.now()

      const sentMarkers = new Set()
      for (const m of messages) {
        const c = (m.value || {}).content
        if (!c || c.type !== "calendarReminderSent") continue
        const sig = c.occurrence ? `${c.calendarId}::${c.dateId}::${c.occurrence}` : `${c.calendarId}::${c.dateId}`
        sentMarkers.add(sig)
      }

      const authorByKey = new Map()
      for (const m of messages) authorByKey.set(m.key, (m.value || {}).author)
      const tombstoned = new Set()
      for (const m of messages) {
        const c = (m.value || {}).content
        if (c && c.type === "tombstone" && c.target) {
          const targetAuthor = authorByKey.get(c.target)
          if (targetAuthor && (m.value || {}).author === targetAuthor) tombstoned.add(c.target)
        }
      }

      const calendarDeadlines = new Map()
      const dueByCalendar = new Map()
      for (const m of messages) {
        if (tombstoned.has(m.key)) continue
        const v = m.value || {}
        const c = v.content
        if (!c || c.type !== "calendarDate") continue
        let dec = c
        if (c.encryptedPayload && tribeCrypto && tribesModel) {
          const r = await tribeCrypto.decryptFromTribe(c, tribesModel)
          if (!r || r._undecryptable) continue
          dec = r
        }
        if (!dec.date) continue
        const calId = c.calendarId
        let calDeadline = calendarDeadlines.get(calId)
        if (calDeadline === undefined) {
          try {
            const cc = await this.getCalendarById(calId)
            calDeadline = (cc && cc.deadline) || ""
          } catch (_) { calDeadline = "" }
          calendarDeadlines.set(calId, calDeadline)
        }
        const hasInterval = !!(dec.intervalWeekly || dec.intervalMonthly || dec.intervalYearly)
        const ruleDeadline = dec.intervalDeadline || calDeadline
        const occurrences = (hasInterval && ruleDeadline)
          ? expandRecurrence(dec.date, ruleDeadline, dec.intervalWeekly, dec.intervalMonthly, dec.intervalYearly)
          : [new Date(dec.date)]
        for (const occ of occurrences) {
          if (occ.getTime() > now) continue
          const occIso = occ.toISOString()
          const sig = hasInterval ? `${calId}::${m.key}::${occIso}` : `${calId}::${m.key}`
          if (sentMarkers.has(sig)) continue
          const entry = { key: m.key, calendarId: calId, date: occIso, label: dec.label || "", recurring: hasInterval }
          const list = dueByCalendar.get(calId) || []
          list.push(entry)
          dueByCalendar.set(calId, list)
        }
      }

      const publishMarker = (calendarId, dateId, occurrence) => new Promise((resolve, reject) => {
        const payload = {
          type: "calendarReminderSent",
          calendarId,
          dateId,
          sentAt: new Date().toISOString()
        }
        if (occurrence) payload.occurrence = occurrence
        ssbClient.publish(payload, (err) => err ? reject(err) : resolve())
      })

      for (const [calendarId, list] of dueByCalendar.entries()) {
        try {
          list.sort((a, b) => new Date(b.date) - new Date(a.date))
          const primary = list[0]
          const cal = await this.getCalendarById(calendarId)
          if (!cal) continue
          const participants = cal.participants.filter(p => typeof p === "string" && p.length > 0)
          if (participants.length > 0) {
            const notesForDay = await this.getNotesForDate(calendarId, primary.key)
            const notesBlock = notesForDay.length > 0
              ? notesForDay.map(n => `  - ${n.text}`).join("\n\n")
              : "  (no notes)"
            const subject = `Calendar Reminder: ${cal.title}`
            const text =
              `Reminder from: ${cal.author}\n` +
              `Title: ${cal.title}\n` +
              `Date: ${primary.label || primary.date}\n\n` +
              `Notes for this day:\n\n${notesBlock}\n\n` +
              `Visit Calendar: /calendars/${cal.rootId}`
            const chunkSize = 6
            for (let i = 0; i < participants.length; i += chunkSize) {
              await pmModel.sendMessage(participants.slice(i, i + chunkSize), subject, text)
            }
          }
          for (const dd of list) {
            try { await publishMarker(calendarId, dd.key, dd.recurring ? dd.date : null) } catch (_) {}
          }
        } catch (_) {}
      }
    },

    async generateInvite(calendarId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const cal = await this.getCalendarById(calendarId)
      if (!cal) throw new Error("Calendar not found")
      if (cal.author !== userId) throw new Error("Only the author can generate invites")
      const code = crypto.randomBytes(INVITE_CODE_BYTES).toString("hex")
      let invite = code
      if (tribeCrypto && !cal.tribeId) {
        const inviteSalt = tribeCrypto.generateInviteSalt()
        const ekChain = tribeCrypto.encryptChainForInvite([cal.rootId], code, inviteSalt)
        if (ekChain) invite = { code, ekChain, salt: inviteSalt, gen: lookupGen(cal.rootId) }
      }
      const tipId = await this.resolveCurrentId(calendarId)
      const item = await new Promise((resolve, reject) => ssbClient.get(tipId, (e, it) => e ? reject(e) : resolve(it)))
      const dec = item.content.tribeId
        ? await decryptIfTribe(item.content)
        : decryptCalendarRoot(item.content, cal.rootId)
      const invites = [...(Array.isArray(dec.invites) ? dec.invites : []), invite]
      let updated = {
        type: "calendar",
        title: dec.title || "",
        status: dec.status || "OPEN",
        deadline: dec.deadline || "",
        tags: Array.isArray(dec.tags) ? dec.tags : [],
        author: dec.author,
        participants: Array.isArray(dec.participants) ? dec.participants : [userId],
        invites,
        ...(item.content.tribeId ? { tribeId: item.content.tribeId } : {}),
        createdAt: dec.createdAt,
        updatedAt: new Date().toISOString(),
        replaces: tipId
      }
      if (item.content.tribeId) updated = await encryptIfTribe(updated)
      else updated = encryptStandalone(updated, cal.rootId)
      await new Promise((resolve, reject) => ssbClient.publish(updated, (e, res) => e ? reject(e) : resolve(res)))
      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
      await new Promise((resolve, reject) => ssbClient.publish(tombstone, e => e ? reject(e) : resolve()))
      return code
    },

    async joinByInvite(code) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const calendars = await this.listAll()
      let matched = null
      let matchedInvite = null
      for (const cal of calendars) {
        const invs = Array.isArray(cal.invites) ? cal.invites : []
        for (const inv of invs) {
          if (typeof inv === "string" && inv === code) { matched = cal; matchedInvite = inv; break }
          if (typeof inv === "object" && inv.code === code) { matched = cal; matchedInvite = inv; break }
        }
        if (matched) break
      }
      if (!matched) throw new Error("Invalid or expired invite code")
      if (matched.participants.includes(userId)) throw new Error("Already a participant")
      let calKey = null
      if (tribeCrypto && typeof matchedInvite === "object") {
        if (matchedInvite.ekChain) {
          const chain = tribeCrypto.decryptChainFromInvite(matchedInvite.ekChain, code, matchedInvite.salt)
          if (Array.isArray(chain) && chain.length) {
            for (const entry of chain) {
              if (Array.isArray(entry.keys) && entry.keys.length) {
                tribeCrypto.setKeys(entry.rootId, entry.keys, entry.gen || entry.keys.length)
              } else if (entry.key) {
                tribeCrypto.setKey(entry.rootId, entry.key, entry.gen || 1)
              }
            }
            calKey = chain[0].key
          }
        } else if (matchedInvite.ek) {
          calKey = tribeCrypto.decryptFromInvite(matchedInvite.ek, code, matchedInvite.salt)
          ownCrypto.setKey(matched.rootId, calKey, matchedInvite.gen || 1)
        }
      }
      const tipId = await this.resolveCurrentId(matched.rootId)
      const item = await new Promise((resolve, reject) => ssbClient.get(tipId, (e, it) => e ? reject(e) : resolve(it)))
      const dec = item.content.tribeId
        ? await decryptIfTribe(item.content)
        : decryptCalendarRoot(item.content, matched.rootId)
      const isPublicInvite = typeof matchedInvite === "object" && matchedInvite.public === true
      const invites = isPublicInvite
        ? (Array.isArray(dec.invites) ? dec.invites : [])
        : (Array.isArray(dec.invites) ? dec.invites : []).filter(inv => {
            if (typeof inv === "string") return inv !== code
            return inv.code !== code
          })
      let updated = {
        type: "calendar",
        title: dec.title || "",
        status: dec.status || "OPEN",
        deadline: dec.deadline || "",
        tags: Array.isArray(dec.tags) ? dec.tags : [],
        author: dec.author,
        participants: [...(Array.isArray(dec.participants) ? dec.participants : []), userId],
        invites,
        ...(item.content.tribeId ? { tribeId: item.content.tribeId } : {}),
        createdAt: dec.createdAt,
        updatedAt: new Date().toISOString(),
        replaces: tipId
      }
      if (item.content.tribeId) updated = await encryptIfTribe(updated)
      else updated = encryptStandalone(updated, matched.rootId)
      await new Promise((resolve, reject) => ssbClient.publish(updated, (e, res) => e ? reject(e) : resolve(res)))
      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
      await new Promise((resolve, reject) => ssbClient.publish(tombstone, e => e ? reject(e) : resolve()))
      if (tribeCrypto && calKey) {
        try {
          const ssbKeys = require("../server/node_modules/ssb-keys")
          const memberKeys = {}
          try { memberKeys[userId] = tribeCrypto.boxKeyForMember(calKey, userId, ssbKeys) } catch (_) {}
          if (matched.author && matched.author !== userId) {
            try { memberKeys[matched.author] = tribeCrypto.boxKeyForMember(calKey, matched.author, ssbKeys) } catch (_) {}
          }
          if (Object.keys(memberKeys).length) {
            await new Promise((resolve) => {
              ssbClient.publish({ type: "tribe-keys", tribeId: matched.rootId, generation: lookupGen(matched.rootId) || 1, memberKeys }, () => resolve())
            })
          }
        } catch (_) {}
      }
      return matched.rootId
    }
  }
}
