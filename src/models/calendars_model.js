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

module.exports = ({ cooler, pmModel }) => {
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
      if (c.type === "calendar") {
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

  const buildCalendar = (node, rootId) => {
    const c = node.c || {}
    if (c.type !== "calendar") return null
    return {
      key: node.key,
      rootId,
      title: safeText(c.title),
      status: c.status || "OPEN",
      deadline: c.deadline || "",
      tags: Array.isArray(c.tags) ? c.tags : [],
      author: c.author || node.author,
      participants: Array.isArray(c.participants) ? c.participants : [],
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      tribeId: c.tribeId || null
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

      const content = {
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

      const calMsg = await new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg))
      })

      const calendarId = calMsg.key
      const dates = expandRecurrence(firstDate, deadline, intervalWeekly, intervalMonthly, intervalYearly)

      const allDateMsgs = []
      for (const d of dates) {
        const dateMsg = await new Promise((resolve, reject) => {
          ssbClient.publish({
            type: "calendarDate",
            calendarId,
            date: d.toISOString(),
            label: safeText(firstDateLabel),
            author: userId,
            createdAt: new Date().toISOString()
          }, (err, msg) => err ? reject(err) : resolve(msg))
        })
        allDateMsgs.push(dateMsg)
      }

      if (firstNote && safeText(firstNote) && allDateMsgs.length > 0) {
        for (const dateMsg of allDateMsgs) {
          await new Promise((resolve, reject) => {
            ssbClient.publish({
              type: "calendarNote",
              calendarId,
              dateId: dateMsg.key,
              text: safeText(firstNote),
              author: userId,
              createdAt: new Date().toISOString()
            }, (err, msg) => err ? reject(err) : resolve(msg))
          })
        }
      }

      return calMsg
    },

    async updateCalendarById(id, data) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Calendar not found"))
          if (item.content.author !== userId) return reject(new Error("Not the author"))
          const c = item.content
          const updated = {
            ...c,
            title: data.title !== undefined ? safeText(data.title) : c.title,
            status: data.status !== undefined ? (["OPEN","CLOSED"].includes(String(data.status).toUpperCase()) ? String(data.status).toUpperCase() : c.status) : c.status,
            deadline: data.deadline !== undefined ? data.deadline : c.deadline,
            tags: data.tags !== undefined ? normalizeTags(data.tags) : c.tags,
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

    async deleteCalendarById(id) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Calendar not found"))
          if (item.content.author !== userId) return reject(new Error("Not the author"))
          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
          ssbClient.publish(tombstone, (e) => e ? reject(e) : resolve())
        })
      })
    },

    async joinCalendar(calendarId) {
      const tipId = await this.resolveCurrentId(calendarId)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Calendar not found"))
          const c = item.content
          const participants = Array.isArray(c.participants) ? c.participants : []
          if (participants.includes(userId)) return resolve()
          const updated = { ...c, participants: [...participants, userId], updatedAt: new Date().toISOString(), replaces: tipId }
          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
          ssbClient.publish(tombstone, (e1) => {
            if (e1) return reject(e1)
            ssbClient.publish(updated, (e2, res) => e2 ? reject(e2) : resolve(res))
          })
        })
      })
    },

    async leaveCalendar(calendarId) {
      const tipId = await this.resolveCurrentId(calendarId)
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Calendar not found"))
          const c = item.content
          if (c.author === userId) return reject(new Error("Author cannot leave"))
          const participants = Array.isArray(c.participants) ? c.participants : []
          if (!participants.includes(userId)) return resolve()
          const updated = { ...c, participants: participants.filter(p => p !== userId), updatedAt: new Date().toISOString(), replaces: tipId }
          const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }
          ssbClient.publish(tombstone, (e1) => {
            if (e1) return reject(e1)
            ssbClient.publish(updated, (e2, res) => e2 ? reject(e2) : resolve(res))
          })
        })
      })
    },

    async getCalendarById(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
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
        const msg = await new Promise((resolve, reject) => {
          ssbClient.publish({
            type: "calendarDate",
            calendarId: rootId,
            date: d.toISOString(),
            label: safeText(label),
            author: userId,
            createdAt: new Date().toISOString()
          }, (err, m) => err ? reject(err) : resolve(m))
        })
        allMsgs.push(msg)
      }
      return allMsgs
    },

    async getDatesForCalendar(calendarId) {
      const rootId = await this.resolveRootId(calendarId)
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const tombstoned = new Set()
      for (const m of messages) {
        const c = (m.value || {}).content
        if (c && c.type === "tombstone" && c.target) tombstoned.add(c.target)
      }
      const dates = []
      for (const m of messages) {
        if (tombstoned.has(m.key)) continue
        const v = m.value || {}
        const c = v.content
        if (!c || c.type !== "calendarDate") continue
        if (c.calendarId !== rootId) continue
        dates.push({
          key: m.key,
          calendarId: c.calendarId,
          date: c.date,
          label: c.label || "",
          author: c.author || v.author,
          createdAt: c.createdAt || new Date(v.timestamp || 0).toISOString()
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
      const tombstoned = new Set()
      for (const m of messages) {
        const c = (m.value || {}).content
        if (c && c.type === "tombstone" && c.target) tombstoned.add(c.target)
      }
      let dateAuthor = null
      for (const m of messages) {
        if (m.key !== dateId) continue
        const c = (m.value || {}).content
        if (!c || c.type !== "calendarDate") continue
        if (tombstoned.has(m.key)) break
        dateAuthor = c.author || (m.value || {}).author
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
      return new Promise((resolve, reject) => {
        ssbClient.publish({
          type: "calendarNote",
          calendarId: rootId,
          dateId,
          text: safeText(text),
          author: userId,
          createdAt: new Date().toISOString()
        }, (err, msg) => err ? reject(err) : resolve(msg))
      })
    },

    async deleteNote(noteId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      return new Promise((resolve, reject) => {
        ssbClient.get(noteId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Note not found"))
          if (item.content.author !== userId) return reject(new Error("Not the author"))
          ssbClient.publish({ type: "tombstone", target: noteId, deletedAt: new Date().toISOString(), author: userId }, (e, msg) => e ? reject(e) : resolve(msg))
        })
      })
    },

    async getNotesForDate(calendarId, dateId) {
      const rootId = await this.resolveRootId(calendarId)
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const tombstoned = new Set()
      for (const m of messages) {
        const c = (m.value || {}).content
        if (c && c.type === "tombstone" && c.target) tombstoned.add(c.target)
      }
      const notes = []
      for (const m of messages) {
        const v = m.value || {}
        const c = v.content
        if (!c || c.type !== "calendarNote") continue
        if (tombstoned.has(m.key)) continue
        if (c.calendarId !== rootId || c.dateId !== dateId) continue
        notes.push({
          key: m.key,
          calendarId: c.calendarId,
          dateId: c.dateId,
          text: c.text || "",
          author: c.author || v.author,
          createdAt: c.createdAt || new Date(v.timestamp || 0).toISOString()
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

      const tombstoned = new Set()
      for (const m of messages) {
        const c = (m.value || {}).content
        if (c && c.type === "tombstone" && c.target) tombstoned.add(c.target)
      }

      const dueByCalendar = new Map()
      for (const m of messages) {
        if (tombstoned.has(m.key)) continue
        const v = m.value || {}
        const c = v.content
        if (!c || c.type !== "calendarDate") continue
        if (new Date(c.date).getTime() > now) continue
        if (sentMarkers.has(`${c.calendarId}::${m.key}`)) continue
        const entry = { key: m.key, calendarId: c.calendarId, date: c.date, label: c.label || "" }
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
