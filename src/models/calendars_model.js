const pull = require("../server/node_modules/pull-stream")
const { getConfig } = require("../configs/config-manager.js")
const logLimit = getConfig().ssbLogStream?.limit || 1000

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

module.exports = ({ cooler, pmModel, tribeCrypto, tribesModel }) => {
  let ssb
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb }

  const readAll = async (ssbClient) =>
    new Promise((resolve, reject) =>
      pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((err, msgs) => err ? reject(err) : resolve(msgs)))
    )

  const tribeHelpers = tribeCrypto ? tribeCrypto.createHelpers(tribesModel) : null
  const encryptIfTribe = tribeHelpers ? tribeHelpers.encryptIfTribe : async (c) => c
  const decryptIfTribe = tribeHelpers ? tribeHelpers.decryptIfTribe : async (c) => c
  const assertReadable = tribeHelpers ? tribeHelpers.assertReadable : () => {}
  const decryptIndexNodes = tribeHelpers ? tribeHelpers.decryptIndexNodes : async () => {}

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

      let content = {
        type: "calendar",
        title: safeText(title),
        status: validStatus,
        deadline: deadline || "",
        tags: normalizeTags(tags),
        author: userId,
        participants: [userId],
        createdAt: now,
        updatedAt: now,
        ...(tribeId ? { tribeId } : {})
      }
      content = await encryptIfTribe(content)

      const calMsg = await new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg))
      })

      const calendarId = calMsg.key
      const dates = expandRecurrence(firstDate, deadline, intervalWeekly, intervalMonthly, intervalYearly)

      const allDateMsgs = []
      for (const d of dates) {
        let dateContent = {
          type: "calendarDate",
          calendarId,
          date: d.toISOString(),
          label: safeText(firstDateLabel),
          author: userId,
          createdAt: new Date().toISOString(),
          ...(tribeId ? { tribeId } : {})
        }
        dateContent = await encryptIfTribe(dateContent)
        const dateMsg = await new Promise((resolve, reject) => {
          ssbClient.publish(dateContent, (err, msg) => err ? reject(err) : resolve(msg))
        })
        allDateMsgs.push(dateMsg)
      }

      if (firstNote && safeText(firstNote) && allDateMsgs.length > 0) {
        for (const dateMsg of allDateMsgs) {
          let noteContent = {
            type: "calendarNote",
            calendarId,
            dateId: dateMsg.key,
            text: safeText(firstNote),
            author: userId,
            createdAt: new Date().toISOString(),
            ...(tribeId ? { tribeId } : {})
          }
          noteContent = await encryptIfTribe(noteContent)
          await new Promise((resolve, reject) => {
            ssbClient.publish(noteContent, (err, msg) => err ? reject(err) : resolve(msg))
          })
        }
      }

      return calMsg
    },

    async updateCalendarById(id, data) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const item = await new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, it) => err ? reject(err) : resolve(it))
      })
      if (!item || !item.content) throw new Error("Calendar not found")
      const oldDec = await decryptIfTribe(item.content)
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
        ...(item.content.tribeId ? { tribeId: item.content.tribeId } : {}),
        createdAt: oldDec.createdAt,
        updatedAt: new Date().toISOString(),
        replaces: tipId
      }
      updated = await encryptIfTribe(updated)
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
      if ((dec.author || item.content.author) !== userId) throw new Error("Not the author")
      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
      return new Promise((resolve, reject) => ssbClient.publish(tombstone, e => e ? reject(e) : resolve()))
    },

    async joinCalendar(calendarId) {
      const tipId = await this.resolveCurrentId(calendarId)
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const item = await new Promise((resolve, reject) => ssbClient.get(tipId, (e, it) => e ? reject(e) : resolve(it)))
      if (!item || !item.content) throw new Error("Calendar not found")
      const dec = await decryptIfTribe(item.content)
      assertReadable(dec, "Calendar")
      const participants = Array.isArray(dec.participants) ? dec.participants : []
      if (participants.includes(userId)) return
      let updated = {
        type: "calendar",
        title: dec.title || "",
        status: dec.status || "OPEN",
        deadline: dec.deadline || "",
        tags: Array.isArray(dec.tags) ? dec.tags : [],
        author: dec.author,
        participants: [...participants, userId],
        ...(item.content.tribeId ? { tribeId: item.content.tribeId } : {}),
        createdAt: dec.createdAt,
        updatedAt: new Date().toISOString(),
        replaces: tipId
      }
      updated = await encryptIfTribe(updated)
      const result = await new Promise((resolve, reject) => ssbClient.publish(updated, (e, res) => e ? reject(e) : resolve(res)))
      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
      await new Promise((resolve, reject) => ssbClient.publish(tombstone, e => e ? reject(e) : resolve()))
      return result
    },

    async leaveCalendar(calendarId) {
      const tipId = await this.resolveCurrentId(calendarId)
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const item = await new Promise((resolve, reject) => ssbClient.get(tipId, (e, it) => e ? reject(e) : resolve(it)))
      if (!item || !item.content) throw new Error("Calendar not found")
      const dec = await decryptIfTribe(item.content)
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
        ...(item.content.tribeId ? { tribeId: item.content.tribeId } : {}),
        createdAt: dec.createdAt,
        updatedAt: new Date().toISOString(),
        replaces: tipId
      }
      updated = await encryptIfTribe(updated)
      const result = await new Promise((resolve, reject) => ssbClient.publish(updated, (e, res) => e ? reject(e) : resolve(res)))
      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
      await new Promise((resolve, reject) => ssbClient.publish(tombstone, e => e ? reject(e) : resolve()))
      return result
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

      const deadlineForExpansion = (intervalDeadline && hasAnyInterval(intervalWeekly, intervalMonthly, intervalYearly)) ? intervalDeadline : cal.deadline
      const dates = expandRecurrence(date, deadlineForExpansion, intervalWeekly, intervalMonthly, intervalYearly)
      const allMsgs = []
      for (const d of dates) {
        let dateContent = {
          type: "calendarDate",
          calendarId: rootId,
          date: d.toISOString(),
          label: safeText(label),
          author: userId,
          createdAt: new Date().toISOString(),
          ...(cal.tribeId ? { tribeId: cal.tribeId } : {})
        }
        dateContent = await encryptIfTribe(dateContent)
        const msg = await new Promise((resolve, reject) => {
          ssbClient.publish(dateContent, (err, m) => err ? reject(err) : resolve(m))
        })
        allMsgs.push(msg)
      }
      return allMsgs
    },

    async getDatesForCalendar(calendarId) {
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
      const dates = []
      for (const m of messages) {
        if (tombstoned.has(m.key)) continue
        const v = m.value || {}
        const c = v.content
        if (!c || c.type !== "calendarDate") continue
        if (c.calendarId !== rootId) continue
        let dec = c
        if (c.encryptedPayload && tribeCrypto && tribesModel) {
          const r = await tribeCrypto.decryptFromTribe(c, tribesModel)
          dec = r && !r._undecryptable ? r : c
          if (r && r._undecryptable) continue
        }
        dates.push({
          key: m.key,
          calendarId: dec.calendarId || c.calendarId,
          date: dec.date,
          label: dec.label || "",
          author: dec.author || v.author,
          createdAt: dec.createdAt || new Date(v.timestamp || 0).toISOString()
        })
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
      noteContent = await encryptIfTribe(noteContent)
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
        sentMarkers.add(`${c.calendarId}::${c.dateId}`)
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
        if (!dec.date || new Date(dec.date).getTime() > now) continue
        if (sentMarkers.has(`${c.calendarId}::${m.key}`)) continue
        const entry = { key: m.key, calendarId: c.calendarId, date: dec.date, label: dec.label || "" }
        const list = dueByCalendar.get(c.calendarId) || []
        list.push(entry)
        dueByCalendar.set(c.calendarId, list)
      }

      const publishMarker = (calendarId, dateId) => new Promise((resolve, reject) => {
        ssbClient.publish({
          type: "calendarReminderSent",
          calendarId,
          dateId,
          sentAt: new Date().toISOString()
        }, (err) => err ? reject(err) : resolve())
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
            try { await publishMarker(calendarId, dd.key) } catch (_) {}
          }
        } catch (_) {}
      }
    }
  }
}
