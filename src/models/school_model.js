const pull = require("../server/node_modules/pull-stream")
const moment = require("../server/node_modules/moment")
const { getConfig } = require("../configs/config-manager.js")
const { readTyped } = require("./typed_log")
const opinionCategories = require("../backend/opinion_categories")
const logLimit = getConfig().ssbLogStream?.limit || 1000

const norm = (s) => String(s || "").trim().toLowerCase()
const toNum = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : NaN
}

const normalizeTags = (raw) => {
  if (raw === undefined || raw === null) return []
  if (Array.isArray(raw)) return raw.map(t => String(t || "").trim()).filter(Boolean)
  return String(raw).split(",").map(t => t.trim()).filter(Boolean)
}

const normalizeDate = (raw) => {
  const t = Date.parse(String(raw || ""))
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

const normalizeIds = (raw) => {
  if (raw === undefined || raw === null) return []
  const arr = Array.isArray(raw) ? raw : String(raw).split(/[\s,]+/)
  return Array.from(new Set(arr.map(t => String(t || "").trim()).filter(t => t.startsWith("@"))))
}

const matchSearch = (course, q) => {
  const qq = norm(q)
  if (!qq) return true
  const hay = [
    course.title,
    course.description,
    Array.isArray(course.tags) ? course.tags.join(" ") : ""
  ].map(x => norm(x)).join(" ")
  return hay.includes(qq)
}

module.exports = ({ cooler, transfersModel, schoolCrypto, chatsModel }) => {
  const ssbKeys = require("../server/node_modules/ssb-keys")
  const nodeCrypto = require("crypto")
  let ssb
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb }

  const SCHOOL_TYPES = [
    "schoolCourse", "schoolLesson", "schoolLessonMedia", "schoolExam", "schoolExamQuestion",
    "schoolExamResult", "schoolProgress", "schoolOpinion", "schoolCertificate", "schoolCommentHide",
    "schoolEnroll", "school-invite", "tombstone", "tribe-keys", "transfer", "transferConfirm", "chatMember"
  ]

  const readAll = async (ssbClient) => readTyped(ssbClient, SCHOOL_TYPES, { limit: logLimit, withWindow: true })

  const buildIndex = (messages, ssbClient) => {
    const tomb = new Set()
    const courseNodes = new Map()
    const lessonNodes = new Map()
    const certNodes = new Map()
    const parent = new Map()
    const child = new Map()
    const naiveReplaces = new Map()
    const lessonReplaces = new Map()
    const enrollLatest = new Map()
    const transferAgg = new Map()
    const tribeKeyMsgs = []
    const opinionMsgs = []
    const examNodes = new Map()
    const questionNodes = new Map()
    const progressLatest = new Map()
    const examResultLatest = new Map()

    for (const m of messages) {
      const key = m.key
      const v = m.value || {}
      const c = v.content
      if (!c) continue

      if (c.type === "tombstone" && c.target) {
        tomb.add(c.target)
        continue
      }

      if (c.type === "schoolCourse") {
        courseNodes.set(key, { key, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        if (c.replaces) naiveReplaces.set(key, c.replaces)
        continue
      }

      if (c.type === "schoolLesson" && c.courseId) {
        lessonNodes.set(key, { key, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        if (c.replaces) lessonReplaces.set(key, c.replaces)
        continue
      }

      if (c.type === "schoolCertificate" && c.courseId) {
        certNodes.set(key, { key, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        continue
      }

      if (c.type === "schoolEnroll" && c.courseId) {
        const author = v.author
        if (!author) continue
        const ts = v.timestamp || m.timestamp || 0
        const k = `${c.courseId}::${author}`
        const prev = enrollLatest.get(k)
        if (!prev || ts >= prev.ts) enrollLatest.set(k, { ts, value: !!c.value, author, courseId: c.courseId, transferId: c.transferId || null, keyProof: c.keyProof || null })
        continue
      }

      if (c.type === "transfer") {
        const set = transferAgg.get(key) || new Set()
        for (const cb of (Array.isArray(c.confirmedBy) ? c.confirmedBy : [])) set.add(cb)
        if (c.from) set.add(c.from)
        transferAgg.set(key, set)
        continue
      }

      if (c.type === "transferConfirm" && c.target) {
        const set = transferAgg.get(c.target) || new Set()
        if (v.author) set.add(v.author)
        transferAgg.set(c.target, set)
        continue
      }

      if (c.type === "tribe-keys" && c.tribeId && c.memberKeys && typeof c.memberKeys === "object") {
        tribeKeyMsgs.push({ tribeId: c.tribeId, memberKeys: c.memberKeys, author: v.author })
        continue
      }

      if (c.type === "schoolOpinion" && c.target) {
        opinionMsgs.push({ target: c.target, author: v.author, category: c.category })
        continue
      }

      if (c.type === "schoolLessonMedia" && c.courseId && c.target) {
        examNodes.set("media:" + key, { key, ts: v.timestamp || m.timestamp || 0, c, author: v.author, isMedia: true })
        continue
      }

      if (c.type === "schoolExamQuestion" && c.courseId && c.target) {
        questionNodes.set(key, { key, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        continue
      }

      if (c.type === "schoolExam" && c.courseId) {
        examNodes.set(key, { key, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        continue
      }

      if (c.type === "schoolProgress" && c.courseId && c.lessonId) {
        const ts = v.timestamp || m.timestamp || 0
        const k = `${c.courseId}::${c.lessonId}::${v.author}`
        const prev = progressLatest.get(k)
        if (!prev || ts >= prev.ts) progressLatest.set(k, { ts, value: c.value !== false, author: v.author, courseId: c.courseId, lessonId: c.lessonId })
        continue
      }
    }

    if (ssbClient && ssbClient.private && typeof ssbClient.private.unbox === "function") {
      for (const m of messages) {
        if (typeof m.value?.content !== "string") continue
        try {
          const dec = ssbClient.private.unbox({ key: m.key, value: m.value, timestamp: m.value?.timestamp || m.timestamp || 0 })
          const c = dec?.value?.content
          const author = dec?.value?.author
          if (!c || !author) continue
          const ts = dec.value.timestamp || m.timestamp || 0
          if (c.type === "schoolEnroll" && c.courseId) {
            const k = `${c.courseId}::${author}`
            const prev = enrollLatest.get(k)
            if (!prev || ts >= prev.ts) enrollLatest.set(k, { ts, value: !!c.value, author, courseId: c.courseId, transferId: c.transferId || null, keyProof: c.keyProof || null })
            continue
          }
          if (c.type === "schoolProgress" && c.courseId && c.lessonId) {
            const k = `${c.courseId}::${c.lessonId}::${author}`
            const prev = progressLatest.get(k)
            if (!prev || ts >= prev.ts) progressLatest.set(k, { ts, value: c.value !== false, author, courseId: c.courseId, lessonId: c.lessonId })
            continue
          }
          if (c.type === "schoolExamResult" && c.courseId && c.examId) {
            const k = `${c.examId}::${author}`
            const prev = examResultLatest.get(k)
            if (!prev || ts >= prev.ts) examResultLatest.set(k, { ts, author, courseId: c.courseId, examId: c.examId, score: c.score, total: c.total })
            continue
          }
        } catch {}
      }
    }

    for (const [key, replacesId] of naiveReplaces.entries()) {
      const node = courseNodes.get(key)
      if (!node) continue
      const orig = courseNodes.get(replacesId)
      if (!orig) continue
      if (String(orig.author) !== String(node.author)) { courseNodes.delete(key); continue }
      parent.set(key, replacesId)
      child.set(replacesId, key)
    }

    const lessonParent = new Map()
    for (const [key, target] of lessonReplaces.entries()) {
      const node = lessonNodes.get(key)
      const orig = lessonNodes.get(target)
      if (node && orig && String(orig.author) === String(node.author)) lessonParent.set(key, target)
    }
    const lessonChildOf = new Map()
    for (const [k, t] of lessonParent.entries()) lessonChildOf.set(t, k)
    const lessonRootOf = (id) => {
      let cur = id
      while (lessonParent.has(cur)) cur = lessonParent.get(cur)
      return cur
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
    for (const id of courseNodes.keys()) roots.add(rootOf(id))

    const tipByRoot = new Map()
    for (const r of roots) tipByRoot.set(r, tipOf(r))

    const enrollByCourse = new Map()
    for (const { courseId, author, value, transferId, keyProof } of enrollLatest.values()) {
      if (!enrollByCourse.has(courseId)) enrollByCourse.set(courseId, new Map())
      const enrollments = enrollByCourse.get(courseId)
      if (value) enrollments.set(author, { transferId, keyProof: keyProof || null })
      else enrollments.delete(author)
    }

    const opinionsByCourse = new Map()
    for (const op of opinionMsgs) {
      const root = rootOf(op.target)
      if (!courseNodes.has(root)) continue
      if (!opinionsByCourse.has(root)) opinionsByCourse.set(root, { opinions: {}, voters: new Set() })
      const agg = opinionsByCourse.get(root)
      if (!op.author || agg.voters.has(op.author)) continue
      agg.voters.add(op.author)
      if (op.category) agg.opinions[op.category] = (agg.opinions[op.category] || 0) + 1
    }

    const progressByCourse = new Map()
    for (const pr of progressLatest.values()) {
      if (!pr.value) continue
      const root = rootOf(pr.courseId)
      if (!courseNodes.has(root)) continue
      if (!progressByCourse.has(root)) progressByCourse.set(root, new Map())
      const perStudent = progressByCourse.get(root)
      if (!perStudent.has(pr.author)) perStudent.set(pr.author, new Set())
      perStudent.get(pr.author).add(lessonRootOf(pr.lessonId))
    }

    const grantsByCourse = new Map()
    const myId = ssbClient ? ssbClient.id : null
    for (const tk of tribeKeyMsgs) {
      const root = rootOf(tk.tribeId)
      if (!courseNodes.has(root)) continue
      if (!grantsByCourse.has(root)) grantsByCourse.set(root, new Set())
      for (const member of Object.keys(tk.memberKeys)) grantsByCourse.get(root).add(member)
      if (schoolCrypto && myId && tk.memberKeys[myId]) {
        try {
          const cfg = require("../server/ssb_config")
          const unboxed = ssbKeys.unbox(tk.memberKeys[myId], cfg.keys)
          if (typeof unboxed === "string" && unboxed) schoolCrypto.addNewKey(root, unboxed)
        } catch {}
      }
    }

    return { tomb, courseNodes, lessonNodes, certNodes, examNodes, parent, child, rootOf, tipOf, tipByRoot, enrollByCourse, transferAgg, grantsByCourse, opinionsByCourse, progressByCourse, examResultLatest, lessonRootOf, lessonChildOf, questionNodes }
  }

  const keyProofFor = (keyHex, studentId) => {
    try { return nodeCrypto.createHmac("sha256", Buffer.from(keyHex, "hex")).update(String(studentId), "utf8").digest("hex") } catch (_) { return null }
  }

  const buildCourseObject = (node, rootId, enrollments, transferAgg, grants, opinionAgg) => {
    let c = node.c || {}
    const ringKeys = schoolCrypto ? (schoolCrypto.getKeys(rootId) || []) : []
    if (c.encryptedPayload) {
      const dec = ringKeys.length && schoolCrypto ? schoolCrypto.decryptContent(c, ringKeys.map(k => [k])) : { ...c, _undecryptable: true }
      if (dec._undecryptable) return { undecryptable: true, id: node.key, rootId, author: node.author }
      c = dec
    }
    let blobId = c.image || null
    if (blobId && /\(([^)]+)\)/.test(String(blobId))) blobId = String(blobId).match(/\(([^)]+)\)/)[1]

    const priceN = toNum(c.price)
    const paid = Number.isFinite(priceN) && priceN > 0
    const students = []
    const pending = []
    const grantedViaInvite = []
    for (const [student, info] of (enrollments || new Map())) {
      if (info.keyProof && ringKeys.some(k => keyProofFor(k, student) === info.keyProof)) grantedViaInvite.push(student)
      if (paid) {
        const signatures = info.transferId ? (transferAgg && transferAgg.get(info.transferId)) : null
        if (signatures && signatures.size >= 2) students.push(student)
        else pending.push({ author: student, transferId: info.transferId || null })
      } else {
        students.push(student)
      }
    }
    return {
      id: node.key,
      rootId,
      title: c.title,
      description: c.description,
      tags: Array.isArray(c.tags) ? c.tags : normalizeTags(c.tags),
      image: blobId,
      price: Number.isFinite(priceN) && priceN > 0 ? priceN.toFixed(6) : "0.000000",
      visibility: String(c.visibility || "PUBLIC").toUpperCase() === "INVITE" ? "INVITE" : "PUBLIC",
      status: String(c.status || "ONGOING").toUpperCase() === "CLOSED" ? "CLOSED" : "ONGOING",
      invited: normalizeIds(c.invited).filter(id => !students.includes(id)),
      startDate: c.startDate || null,
      chatId: c.chatId || null,
      inviteCode: c.inviteCode || null,
      author: node.author || c.author,
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      students,
      pending,
      granted: Array.from(new Set([...(grants ? Array.from(grants) : []), ...grantedViaInvite])),
      opinions: opinionAgg ? opinionAgg.opinions : {},
      opinions_inhabitants: opinionAgg ? Array.from(opinionAgg.voters) : []
    }
  }

  const isProtected = (course) => Number(course.price) > 0 || course.visibility === "INVITE"

  const addToChat = async (ssbClient, course, members) => {
    if (!course.chatId || !members.length) return
    for (const member of members) {
      try {
        await new Promise((res) => ssbClient.publish({ type: "chatMember", target: course.chatId, member, on: true, createdAt: new Date().toISOString() }, () => res()))
      } catch {}
    }
    if (chatsModel && typeof chatsModel.listAll === "function") {
      try { await chatsModel.listAll({ filter: "all", viewerId: ssbClient.id }) } catch {}
    }
  }

  const canView = (course, viewer) =>
    course.visibility === "PUBLIC" ||
    course.author === viewer ||
    course.invited.includes(viewer) ||
    course.students.includes(viewer) ||
    course.pending.some(p => p.author === viewer)

  const ensureCourseKey = async (ssbClient, rootId) => {
    if (!schoolCrypto) return null
    let key = schoolCrypto.getKey(rootId)
    if (key) return key
    key = schoolCrypto.generateTribeKey()
    schoolCrypto.setKey(rootId, key, 1)
    await publishKeyGrant(ssbClient, rootId, key, [ssbClient.id])
    return key
  }

  const publishKeyGrant = (ssbClient, rootId, key, members) => {
    const memberKeys = {}
    for (const member of members) {
      try { memberKeys[member] = schoolCrypto.boxKeyForMember(key, member, ssbKeys) } catch {}
    }
    if (!Object.keys(memberKeys).length) return Promise.resolve(null)
    return new Promise((res) => ssbClient.publish({ type: "tribe-keys", tribeId: rootId, generation: 1, memberKeys }, () => res(null)))
  }

  return {
    type: "schoolCourse",

    async createCourse(data) {
      const ssbClient = await openSsb()

      const title = String(data.title || "").trim()
      const description = String(data.description || "").trim()
      if (!title) throw new Error("Invalid title")
      if (!description) throw new Error("Invalid description")

      let blobId = data.image || null
      if (blobId && /\(([^)]+)\)/.test(String(blobId))) blobId = String(blobId).match(/\(([^)]+)\)/)[1]

      const priceN = toNum(data.price)
      const protectedCourse = (Number.isFinite(priceN) && priceN > 0) || String(data.visibility || "PUBLIC").toUpperCase() === "INVITE"
      let chatId = null
      if (chatsModel) {
        try {
          const chat = await chatsModel.createChat(`Course: ${title}`, description, blobId, "school", protectedCourse ? "INVITE-ONLY" : "OPEN", normalizeTags(data.tags))
          chatId = chat && chat.key ? chat.key : null
        } catch {}
      }
      const content = {
        type: "schoolCourse",
        title,
        description,
        tags: normalizeTags(data.tags),
        image: blobId,
        price: Number.isFinite(priceN) && priceN > 0 ? priceN.toFixed(6) : "0.000000",
        visibility: String(data.visibility || "PUBLIC").toUpperCase() === "INVITE" ? "INVITE" : "PUBLIC",
        status: "ONGOING",
        invited: normalizeIds(data.invited),
        startDate: (() => {
          const d = normalizeDate(data.startDate)
          if (d && d.slice(0, 10) < new Date().toISOString().slice(0, 10)) throw new Error("Start date cannot be in the past")
          return d
        })(),
        chatId,
        author: ssbClient.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      let toPublish = content
      let courseKey = null
      if (content.visibility === "INVITE" && schoolCrypto) {
        courseKey = schoolCrypto.generateTribeKey()
        toPublish = schoolCrypto.encryptContent(content, [courseKey], true)
      }
      const published = await new Promise((res, rej) => ssbClient.publish(toPublish, (e, m) => e ? rej(e) : res(m)))
      if (published && published.key) {
        if (courseKey) {
          schoolCrypto.setKey(published.key, courseKey, 1)
          await publishKeyGrant(ssbClient, published.key, courseKey, [ssbClient.id])
        } else if (Number(content.price) > 0) {
          await ensureCourseKey(ssbClient, published.key)
        }
      }
      return published
    },

    async resolveCurrentId(courseId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const { tomb, child } = buildIndex(messages, ssbClient)

      let cur = courseId
      while (child.has(cur)) cur = child.get(cur)
      if (tomb.has(cur)) throw new Error("Course not found")
      return cur
    },

    async resolveRootId(courseId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const { tomb, parent, child } = buildIndex(messages, ssbClient)

      let tip = courseId
      while (child.has(tip)) tip = child.get(tip)
      if (tomb.has(tip)) throw new Error("Course not found")

      let root = tip
      while (parent.has(root)) root = parent.get(root)
      return root
    },

    async updateCourse(id, data) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages, ssbClient)

      const tipId = await this.resolveCurrentId(id)
      const node = idx.courseNodes.get(tipId)
      if (!node || !node.c) throw new Error("Course not found")

      let existingContent = node.c
      if (existingContent.encryptedPayload) {
        const rootForKeys = idx.rootOf(tipId)
        const keys = schoolCrypto ? (schoolCrypto.getKeys(rootForKeys) || []) : []
        const dec = keys.length && schoolCrypto ? schoolCrypto.decryptContent(existingContent, keys.map(k => [k])) : { ...existingContent, _undecryptable: true }
        if (dec._undecryptable) throw new Error("Course not found")
        delete dec._decrypted
        existingContent = dec
      }
      const author = existingContent.author
      if (author !== ssbClient.id) throw new Error("Unauthorized")

      const patch = {}

      if (data.title !== undefined) {
        const t = String(data.title || "").trim()
        if (!t) throw new Error("Invalid title")
        patch.title = t
      }

      if (data.description !== undefined) {
        const d = String(data.description || "").trim()
        if (!d) throw new Error("Invalid description")
        patch.description = d
      }

      if (data.tags !== undefined) patch.tags = normalizeTags(data.tags)

      if (data.image !== undefined) {
        let blobId = data.image
        if (blobId && /\(([^)]+)\)/.test(String(blobId))) blobId = String(blobId).match(/\(([^)]+)\)/)[1]
        patch.image = blobId || null
      }

      if (data.price !== undefined) {
        const p = toNum(data.price)
        if (Number.isFinite(p) && p < 0) throw new Error("Invalid price")
        patch.price = Number.isFinite(p) && p > 0 ? p.toFixed(6) : "0.000000"
      }

      if (data.visibility !== undefined) {
        patch.visibility = String(data.visibility || "PUBLIC").toUpperCase() === "INVITE" ? "INVITE" : "PUBLIC"
      }

      if (data.status !== undefined) {
        const s = String(data.status || "").toUpperCase()
        if (!["ONGOING", "CLOSED"].includes(s)) throw new Error("Invalid status")
        patch.status = s
      }

      if (data.invited !== undefined) patch.invited = normalizeIds(data.invited)

      if (data.inviteCode !== undefined) patch.inviteCode = String(data.inviteCode || "") || null

      if (data.startDate !== undefined) patch.startDate = normalizeDate(data.startDate)

      const next = {
        ...existingContent,
        ...patch,
        author,
        createdAt: existingContent.createdAt,
        updatedAt: new Date().toISOString(),
        replaces: tipId,
        type: "schoolCourse"
      }

      const tombMsg = {
        type: "tombstone",
        target: tipId,
        deletedAt: new Date().toISOString(),
        author: ssbClient.id
      }

      await new Promise((res, rej) => ssbClient.publish(tombMsg, (e) => e ? rej(e) : res()))
      let toPublish = next
      if (String(next.visibility || "").toUpperCase() === "INVITE" && schoolCrypto) {
        const key = await ensureCourseKey(ssbClient, idx.rootOf(tipId))
        if (key) toPublish = schoolCrypto.encryptContent(next, [key], true)
      }
      const published = await new Promise((res, rej) => ssbClient.publish(toPublish, (e, m) => e ? rej(e) : res(m)))
      if (patch.image !== undefined && existingContent.chatId && chatsModel && typeof chatsModel.updateChatById === "function") {
        try { await chatsModel.updateChatById(existingContent.chatId, { image: patch.image }) } catch {}
      }
      return published
    },

    async updateCourseStatus(id, status) {
      return this.updateCourse(id, { status: String(status || "").toUpperCase() })
    },

    async deleteCourse(id) {
      const ssbClient = await openSsb()
      const tipId = await this.resolveCurrentId(id)
      const course = await this.getCourseById(tipId)
      if (!course || course.author !== ssbClient.id) throw new Error("Unauthorized")

      const tombMsg = {
        type: "tombstone",
        target: tipId,
        deletedAt: new Date().toISOString(),
        author: ssbClient.id
      }

      return new Promise((res, rej) => ssbClient.publish(tombMsg, (e, r) => e ? rej(e) : res(r)))
    },

    async inviteStudent(id, studentId) {
      const ssbClient = await openSsb()
      const course = await this.getCourseById(id)
      const ids = normalizeIds(studentId)
      if (!ids.length) throw new Error("Invalid student id")
      const updated = await this.updateCourse(course.id, { invited: course.invited.concat(ids) })
      if (isProtected(course) && schoolCrypto) {
        const key = await ensureCourseKey(ssbClient, course.rootId)
        if (key) await publishKeyGrant(ssbClient, course.rootId, key, ids)
      }
      return updated
    },

    async uninviteStudent(id, studentId) {
      const course = await this.getCourseById(id)
      const drop = new Set(normalizeIds(studentId))
      return this.updateCourse(course.id, { invited: course.invited.filter(s => !drop.has(s)) })
    },

    async enroll(id) {
      const ssbClient = await openSsb()
      const me = ssbClient.id

      const course = await this.getCourseById(id)
      if (course.author === me) throw new Error("Cannot enroll in your own course")
      if (course.status !== "ONGOING") throw new Error("Course is closed")
      if (course.students.includes(me)) return { alreadyEnrolled: true }
      if (course.pending.some(p => p.author === me)) return { alreadyPending: true }
      if (course.visibility === "INVITE" && !course.invited.includes(me)) throw new Error("Invitation required")

      const rootId = course.rootId || (await this.resolveRootId(id))

      let transferId = null
      if (Number(course.price) > 0) {
        if (!transfersModel) throw new Error("Transfers module unavailable")
        const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        const bill = await transfersModel.createTransfer(course.author, "SCHOOL", course.price, deadline, ["SCHOOL"], "ECONOMIC")
        transferId = bill && bill.key ? bill.key : null
      }

      const msg = {
        type: "schoolEnroll",
        courseId: rootId,
        value: true,
        transferId,
        createdAt: new Date().toISOString()
      }

      if (isProtected(course)) {
        return new Promise((res, rej) => ssbClient.private.publish(msg, [me, course.author], (e, m) => e ? rej(e) : res(m)))
      }
      const published = await new Promise((res, rej) => ssbClient.publish(msg, (e, m) => e ? rej(e) : res(m)))
      if (course.chatId && chatsModel && typeof chatsModel.joinChat === "function") {
        try { await chatsModel.joinChat(course.chatId) } catch {}
      }
      return published
    },

    async unenroll(id) {
      const ssbClient = await openSsb()
      const me = ssbClient.id

      const course = await this.getCourseById(id)
      if (!course.students.includes(me) && !course.pending.some(pn => pn.author === me)) return { notEnrolled: true }

      const rootId = course.rootId || (await this.resolveRootId(id))

      const msg = {
        type: "schoolEnroll",
        courseId: rootId,
        value: false,
        createdAt: new Date().toISOString()
      }

      if (isProtected(course)) {
        return new Promise((res, rej) => ssbClient.private.publish(msg, [me, course.author], (e, m) => e ? rej(e) : res(m)))
      }
      return new Promise((res, rej) => ssbClient.publish(msg, (e, m) => e ? rej(e) : res(m)))
    },

    async addLesson(courseId, data) {
      const ssbClient = await openSsb()
      const course = await this.getCourseById(courseId)
      if (course.author !== ssbClient.id) throw new Error("Unauthorized")

      const title = String(data.title || "").trim()
      const text = String(data.text || "").trim()
      if (!title) throw new Error("Invalid title")
      if (!text) throw new Error("Invalid text")

      const rootId = course.rootId || (await this.resolveRootId(courseId))

      const orderN = toNum(data.order)
      let content = {
        type: "schoolLesson",
        courseId: rootId,
        title,
        text,
        unit: String(data.unit || "").trim() || null,
        order: Number.isFinite(orderN) ? orderN : null,
        sessionDate: (() => {
          const d = normalizeDate(data.sessionDate)
          if (d && d.slice(0, 10) < new Date().toISOString().slice(0, 10)) throw new Error("Session date cannot be in the past")
          return d
        })(),
        author: ssbClient.id,
        createdAt: new Date().toISOString()
      }

      if (isProtected(course) && schoolCrypto) {
        const key = await ensureCourseKey(ssbClient, rootId)
        if (key) content = schoolCrypto.encryptContent(content, [key], true)
      }

      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => e ? rej(e) : res(m)))
    },

    async createOpinion(courseId, category) {
      if (!opinionCategories.includes(category)) throw new Error("Invalid voting category")
      const ssbClient = await openSsb()
      const me = ssbClient.id
      const course = await this.getCourseById(courseId)
      if (course.author === me) throw new Error("Cannot rate your own course")
      if (!course.students.includes(me)) throw new Error("Only students can rate a course")
      if (course.opinions_inhabitants.includes(me)) throw new Error("Already voted")

      const content = { type: "schoolOpinion", target: course.rootId, category, createdAt: new Date().toISOString() }
      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => e ? rej(e) : res(m)))
    },

    async markLesson(courseId, lessonId, value = true) {
      const ssbClient = await openSsb()
      const me = ssbClient.id
      const course = await this.getCourseById(courseId)
      if (!course.students.includes(me)) throw new Error("Only students can track progress")

      const msg = {
        type: "schoolProgress",
        courseId: course.rootId,
        lessonId,
        value: value !== false,
        createdAt: new Date().toISOString()
      }

      if (isProtected(course)) {
        return new Promise((res, rej) => ssbClient.private.publish(msg, [me, course.author], (e, m) => e ? rej(e) : res(m)))
      }
      return new Promise((res, rej) => ssbClient.publish(msg, (e, m) => e ? rej(e) : res(m)))
    },

    async progressForCourse(courseId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages, ssbClient)
      const rootId = idx.rootOf(courseId)
      const perStudent = idx.progressByCourse.get(rootId) || new Map()
      const out = {}
      for (const [student, lessonSet] of perStudent) out[student] = lessonSet.size
      return out
    },

    async createExam(courseId, title, opts = {}) {
      const ssbClient = await openSsb()
      const course = await this.getCourseById(courseId)
      if (course.author !== ssbClient.id) throw new Error("Unauthorized")
      if (!isProtected(course)) throw new Error("Exams are only for paid or invite courses")
      if (!schoolCrypto) throw new Error("School crypto unavailable")

      const examTitle = String(title || "").trim()
      if (!examTitle) throw new Error("Invalid title")

      const rootId = course.rootId
      const key = await ensureCourseKey(ssbClient, rootId)
      if (!key) throw new Error("Course key unavailable")

      let content = {
        type: "schoolExam",
        courseId: rootId,
        title: examTitle,
        lessonId: opts.lessonId ? String(opts.lessonId) : null,
        author: ssbClient.id,
        createdAt: new Date().toISOString()
      }
      content = schoolCrypto.encryptContent(content, [key], true)

      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => e ? rej(e) : res(m)))
    },

    async addExamQuestion(courseId, examId, data) {
      const ssbClient = await openSsb()
      const course = await this.getCourseById(courseId)
      if (course.author !== ssbClient.id) throw new Error("Unauthorized")
      if (!schoolCrypto) throw new Error("School crypto unavailable")

      const q = String(data.q || "").trim()
      const options = [data.o1, data.o2, data.o3, data.o4].map(o => String(o || "").trim())
      const correct = parseInt(String(data.correct), 10)
      if (!q) throw new Error("Invalid question")
      if (options.some(o => !o)) throw new Error("Four options are required")
      if (!Number.isFinite(correct) || correct < 0 || correct > 3) throw new Error("Invalid correct option")

      const key = await ensureCourseKey(ssbClient, course.rootId)
      if (!key) throw new Error("Course key unavailable")

      let content = {
        type: "schoolExamQuestion",
        courseId: course.rootId,
        target: examId,
        q,
        options,
        correct,
        author: ssbClient.id,
        createdAt: new Date().toISOString()
      }
      content = schoolCrypto.encryptContent(content, [key], true)

      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => e ? rej(e) : res(m)))
    },

    async deleteExamQuestion(questionId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages, ssbClient)
      const node = idx.questionNodes.get(questionId)
      if (!node || idx.tomb.has(questionId)) throw new Error("Question not found")
      if (node.author !== ssbClient.id) throw new Error("Unauthorized")
      const tombMsg = { type: "tombstone", target: questionId, deletedAt: new Date().toISOString(), author: ssbClient.id }
      return new Promise((res, rej) => ssbClient.publish(tombMsg, (e, r) => e ? rej(e) : res(r)))
    },

    async deleteExam(examId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages, ssbClient)
      const node = idx.examNodes.get(examId)
      if (!node || node.isMedia || idx.tomb.has(examId)) throw new Error("Exam not found")
      if (node.author !== ssbClient.id) throw new Error("Unauthorized")
      const tombMsg = { type: "tombstone", target: examId, deletedAt: new Date().toISOString(), author: ssbClient.id }
      return new Promise((res, rej) => ssbClient.publish(tombMsg, (e, r) => e ? rej(e) : res(r)))
    },

    async listExams(courseId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages, ssbClient)
      const rootId = idx.rootOf(courseId)
      const keys = schoolCrypto ? (schoolCrypto.getKeys(rootId) || []) : []

      const exams = []
      for (const node of idx.examNodes.values()) {
        if (node.isMedia) continue
        if (idx.tomb.has(node.key)) continue
        if (idx.rootOf(node.c.courseId) !== rootId) continue
        let c = node.c
        let locked = false
        if (c.encryptedPayload) {
          const dec = keys.length && schoolCrypto ? schoolCrypto.decryptContent(c, keys.map(k => [k])) : { ...c, _undecryptable: true }
          if (dec._undecryptable) locked = true
          else c = dec
        }
        const myResult = idx.examResultLatest.get(`${node.key}::${ssbClient.id}`) || null
        const results = []
        for (const r of idx.examResultLatest.values()) {
          if (r.examId === node.key) results.push({ author: r.author, score: r.score, total: r.total })
        }
        const questions = []
        if (!locked) {
          for (const qn of idx.questionNodes.values()) {
            if (idx.tomb.has(qn.key)) continue
            if (qn.c.target !== node.key) continue
            let qc = qn.c
            if (qc.encryptedPayload) {
              const dec = keys.length && schoolCrypto ? schoolCrypto.decryptContent(qc, keys.map(k => [k])) : { ...qc, _undecryptable: true }
              if (dec._undecryptable) continue
              qc = dec
            }
            questions.push({ id: qn.key, q: qc.q, options: qc.options, correct: qc.correct, createdAt: qc.createdAt || new Date(qn.ts).toISOString() })
          }
          questions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        }
        const passMark = locked ? null : 10
        exams.push({
          id: node.key,
          courseId: rootId,
          locked,
          title: locked ? null : c.title,
          lessonId: locked ? null : (c.lessonId ? idx.lessonRootOf(c.lessonId) : null),
          passMark,
          questions,
          author: node.author,
          createdAt: c.createdAt || new Date(node.ts).toISOString(),
          myResult: myResult ? { score: myResult.score, total: myResult.total, at: myResult.ts, passed: passMark != null && Number(myResult.score) >= passMark } : null,
          results: results.map(r => ({ ...r, passed: passMark != null && Number(r.score) >= passMark }))
        })
      }
      return exams.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    },

    async takeExam(courseId, examId, answers) {
      const ssbClient = await openSsb()
      const me = ssbClient.id
      const course = await this.getCourseById(courseId)
      if (course.author === me) throw new Error("Cannot take your own exam")
      if (!course.students.includes(me)) throw new Error("Only students can take exams")

      const exams = await this.listExams(courseId)
      const exam = exams.find(x => x.id === examId)
      if (!exam || exam.locked) throw new Error("Exam not found")
      if (exam.myResult && exam.myResult.passed) throw new Error("Exam already passed")
      if (exam.myResult && Date.now() - Number(exam.myResult.at || 0) < 24 * 60 * 60 * 1000) throw new Error("Retry available after 24 hours")

      if (!exam.questions.length) throw new Error("Exam has no questions")

      let correctCount = 0
      exam.questions.forEach((question, i) => {
        const given = parseInt(String(Array.isArray(answers) ? answers[i] : (answers || {})[`q${i}`]), 10)
        if (given === question.correct) correctCount += 1
      })
      const score = Math.round((correctCount / exam.questions.length) * 100) / 10

      const msg = {
        type: "schoolExamResult",
        courseId: course.rootId,
        examId,
        score,
        total: 10,
        createdAt: new Date().toISOString()
      }

      return new Promise((res, rej) => ssbClient.private.publish(msg, [me, course.author], (e, m) => e ? rej(e) : res(m)))
    },

    async addLessonMaterial(courseId, lessonId, mediaMarkdown, caption = "") {
      const ssbClient = await openSsb()
      const course = await this.getCourseById(courseId)
      if (course.author !== ssbClient.id) throw new Error("Unauthorized")
      const media = String(mediaMarkdown || "").trim()
      if (!media) throw new Error("Invalid material")

      let content = {
        type: "schoolLessonMedia",
        courseId: course.rootId,
        target: lessonId,
        media,
        caption: String(caption || "").trim() || null,
        author: ssbClient.id,
        createdAt: new Date().toISOString()
      }

      if (isProtected(course) && schoolCrypto) {
        const key = await ensureCourseKey(ssbClient, course.rootId)
        if (key) content = schoolCrypto.encryptContent(content, [key], true)
      }

      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => e ? rej(e) : res(m)))
    },

    async deleteLessonMaterial(materialId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages, ssbClient)
      const node = idx.examNodes.get("media:" + materialId)
      if (!node || idx.tomb.has(materialId)) throw new Error("Material not found")
      if (node.author !== ssbClient.id) throw new Error("Unauthorized")
      const tombMsg = { type: "tombstone", target: materialId, deletedAt: new Date().toISOString(), author: ssbClient.id }
      return new Promise((res, rej) => ssbClient.publish(tombMsg, (e, r) => e ? rej(e) : res(r)))
    },

    async listLessonMaterials(courseId, lessonId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages, ssbClient)
      const rootId = idx.rootOf(courseId)
      const keys = schoolCrypto ? (schoolCrypto.getKeys(rootId) || []) : []

      const materials = []
      for (const node of idx.examNodes.values()) {
        if (!node.isMedia) continue
        if (idx.tomb.has(node.key)) continue
        if (idx.rootOf(node.c.courseId) !== rootId) continue
        if (idx.lessonRootOf(node.c.target) !== idx.lessonRootOf(lessonId)) continue
        let c = node.c
        let locked = false
        if (c.encryptedPayload) {
          const dec = keys.length && schoolCrypto ? schoolCrypto.decryptContent(c, keys.map(k => [k])) : { ...c, _undecryptable: true }
          if (dec._undecryptable) locked = true
          else c = dec
        }
        materials.push({
          id: node.key,
          lessonId,
          locked,
          media: locked ? null : (c.media || ""),
          caption: locked ? null : (c.caption || null),
          author: node.author,
          createdAt: c.createdAt || new Date(node.ts).toISOString()
        })
      }
      return materials.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    },

    async generateInvite(courseId) {
      const ssbClient = await openSsb()
      const course = await this.getCourseById(courseId)
      if (course.author !== ssbClient.id) throw new Error("Unauthorized")
      if (course.visibility !== "INVITE") throw new Error("Only invite courses use invitation codes")
      if (!schoolCrypto) throw new Error("School crypto unavailable")

      if (course.inviteCode) {
        const messages = await readAll(ssbClient)
        const alive = messages.some(m => {
          const c = m.value && m.value.content
          if (!c || c.type !== "school-invite" || c.target !== course.rootId) return false
          try { return schoolCrypto.hashInviteCode(course.inviteCode, c.salt) === c.codeHash } catch { return false }
        })
        if (alive) return { code: course.inviteCode, courseId: course.rootId }
        const key = await ensureCourseKey(ssbClient, course.rootId)
        if (!key) throw new Error("Course key unavailable")
        const salt = schoolCrypto.generateInviteSalt()
        const ek = schoolCrypto.encryptForInvite(key, course.inviteCode, salt)
        await new Promise((res, rej) => ssbClient.publish({
          type: "school-invite", target: course.rootId, ek, salt,
          codeHash: schoolCrypto.hashInviteCode(course.inviteCode, salt)
        }, (e) => e ? rej(e) : res()))
        return { code: course.inviteCode, courseId: course.rootId }
      }

      const key = await ensureCourseKey(ssbClient, course.rootId)
      if (!key) throw new Error("Course key unavailable")

      const code = nodeCrypto.randomBytes(16).toString("hex")
      const salt = schoolCrypto.generateInviteSalt()
      const ek = schoolCrypto.encryptForInvite(key, code, salt)
      await new Promise((res, rej) => ssbClient.publish({
        type: "school-invite", target: course.rootId, ek, salt,
        codeHash: schoolCrypto.hashInviteCode(code, salt)
      }, (e) => e ? rej(e) : res()))
      try { await this.updateCourse(courseId, { inviteCode: code }) } catch (_) {}
      return { code, courseId: course.rootId }
    },

    async joinByInvite(rawCode) {
      if (!schoolCrypto) throw new Error("School crypto unavailable")
      const ssbClient = await openSsb()
      const me = ssbClient.id
      const messages = await readAll(ssbClient)

      const candidates = Array.from(new Set([String(rawCode || "").trim(), String(rawCode || "").trim().toLowerCase()])).filter(Boolean)
      let matched = null
      let code = null
      for (const m of messages) {
        const c = m.value && m.value.content
        if (!c || c.type !== "school-invite") continue
        for (const cand of candidates) {
          try {
            if (schoolCrypto.hashInviteCode(cand, c.salt) === c.codeHash) { matched = c; code = cand; break }
          } catch {}
        }
        if (matched) break
      }
      if (!matched) throw new Error("Invalid or expired invite code")

      const courseKey = schoolCrypto.decryptFromInvite(matched.ek, code, matched.salt)
      if (!courseKey) throw new Error("Could not decrypt invite")
      schoolCrypto.addNewKey(matched.target, courseKey)

      const idx = buildIndex(messages, ssbClient)
      const tipId = idx.tipOf(matched.target)
      const node = idx.courseNodes.get(tipId)
      if (!node) throw new Error("Course not found")
      const teacherId = node.author
      let cc = node.c
      if (cc.encryptedPayload) {
        const dec = schoolCrypto.decryptContent(cc, [[courseKey]])
        if (dec && !dec._undecryptable) cc = dec
      }
      const priceN = toNum(cc.price)

      if (teacherId !== me) {
        const enrollments = idx.enrollByCourse.get(matched.target) || new Map()
        if (!enrollments.has(me)) {
          let transferId = null
          if (Number.isFinite(priceN) && priceN > 0 && transfersModel) {
            const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            const bill = await transfersModel.createTransfer(teacherId, "SCHOOL", priceN.toFixed(6), deadline, ["SCHOOL"], "ECONOMIC")
            transferId = bill && bill.key ? bill.key : null
          }
          const msg = { type: "schoolEnroll", courseId: matched.target, value: true, transferId, keyProof: keyProofFor(courseKey, me), createdAt: new Date().toISOString() }
          await new Promise((res, rej) => ssbClient.private.publish(msg, [me, teacherId], (e, m) => e ? rej(e) : res(m)))
        }
        if (cc.chatId) {
          try {
            await new Promise((res) => ssbClient.publish({ type: "chatMember", target: cc.chatId, member: me, on: true, createdAt: new Date().toISOString() }, () => res()))
          } catch {}
        }
      }
      return { ok: true, courseId: matched.target }
    },

    async grantAccess(courseId, studentId) {
      const ssbClient = await openSsb()
      const course = await this.getCourseById(courseId)
      if (course.author !== ssbClient.id) throw new Error("Unauthorized")
      if (!schoolCrypto) throw new Error("School crypto unavailable")

      const ids = normalizeIds(studentId)
      if (!ids.length) throw new Error("Invalid student id")
      for (const student of ids) {
        const known = course.students.includes(student) || course.invited.includes(student) || course.pending.some(p => p.author === student)
        if (!known) throw new Error("Not a student of this course")
      }

      const key = await ensureCourseKey(ssbClient, course.rootId)
      const grant = await publishKeyGrant(ssbClient, course.rootId, key, ids)
      await addToChat(ssbClient, course, ids)
      return grant
    },

    async updateLesson(courseId, lessonId, data) {
      const ssbClient = await openSsb()
      const course = await this.getCourseById(courseId)
      if (course.author !== ssbClient.id) throw new Error("Unauthorized")

      const lessons = await this.listLessons(course.rootId)
      const current = lessons.find(l => l.id === lessonId)
      if (!current || current.locked) throw new Error("Lesson not found")

      const title = data.title !== undefined ? String(data.title || "").trim() : current.title
      const text = data.text !== undefined ? String(data.text || "").trim() : current.text
      if (!title || !text) throw new Error("Invalid lesson")

      const orderN = toNum(data.order)
      let content = {
        type: "schoolLesson",
        courseId: course.rootId,
        title,
        text,
        unit: data.unit !== undefined ? (String(data.unit || "").trim() || null) : current.unit,
        order: data.order !== undefined ? (Number.isFinite(orderN) ? orderN : null) : current.order,
        sessionDate: data.sessionDate !== undefined ? normalizeDate(data.sessionDate) : current.sessionDate,
        author: ssbClient.id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
        replaces: lessonId
      }

      if (isProtected(course) && schoolCrypto) {
        const key = await ensureCourseKey(ssbClient, course.rootId)
        if (key) content = schoolCrypto.encryptContent(content, [key], true)
      }

      const tombMsg = { type: "tombstone", target: lessonId, deletedAt: new Date().toISOString(), author: ssbClient.id }
      await new Promise((res, rej) => ssbClient.publish(tombMsg, (e) => e ? rej(e) : res()))
      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => e ? rej(e) : res(m)))
    },

    async deleteLesson(lessonId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages, ssbClient)

      const node = idx.lessonNodes.get(lessonId)
      if (!node || idx.tomb.has(lessonId)) throw new Error("Lesson not found")
      if (node.author !== ssbClient.id) throw new Error("Unauthorized")

      const tombMsg = {
        type: "tombstone",
        target: lessonId,
        deletedAt: new Date().toISOString(),
        author: ssbClient.id
      }

      return new Promise((res, rej) => ssbClient.publish(tombMsg, (e, r) => e ? rej(e) : res(r)))
    },

    async listLessons(courseId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages, ssbClient)

      const rootId = idx.rootOf(courseId)
      const keys = schoolCrypto ? (schoolCrypto.getKeys(rootId) || []) : []
      const lessons = []
      for (const node of idx.lessonNodes.values()) {
        if (idx.tomb.has(node.key)) continue
        if (idx.lessonChildOf.has(node.key)) continue
        if (idx.rootOf(node.c.courseId) !== rootId) continue
        let c = node.c
        let locked = false
        if (c.encryptedPayload) {
          const dec = keys.length && schoolCrypto ? schoolCrypto.decryptContent(c, keys.map(k => [k])) : { ...c, _undecryptable: true }
          if (dec._undecryptable) locked = true
          else c = dec
        }
        lessons.push({
          id: node.key,
          courseId: rootId,
          locked,
          title: locked ? null : c.title,
          text: locked ? null : c.text,
          unit: locked ? null : (c.unit || null),
          order: locked ? null : (Number.isFinite(toNum(c.order)) ? toNum(c.order) : null),
          sessionDate: locked ? null : (c.sessionDate || null),
          author: node.author,
          createdAt: c.createdAt || new Date(node.ts).toISOString()
        })
      }
      const myProgress = (idx.progressByCourse.get(rootId) || new Map()).get(ssbClient.id) || new Set()
      for (const lesson of lessons) lesson.completed = myProgress.has(idx.lessonRootOf(lesson.id))
      return lessons.sort((a, b) =>
        ((a.order ?? Infinity) - (b.order ?? Infinity)) || (new Date(a.createdAt) - new Date(b.createdAt))
      )
    },

    async hasPassedCourse(courseId, studentId) {
      const ssbClient = await openSsb()
      const course = await this.getCourseById(courseId)
      const student = normalizeIds(studentId)[0] || ssbClient.id
      const lessons = await this.listLessons(course.rootId)
      if (!lessons.length) return false
      const exams = await this.listExams(course.rootId)
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages, ssbClient)
      const progressSet = (idx.progressByCourse.get(course.rootId) || new Map()).get(student) || new Set()
      for (const lesson of lessons) {
        const lessonRoot = idx.lessonRootOf(lesson.id)
        const lessonExams = exams.filter(x => !x.locked && x.questions.length && x.lessonId && x.lessonId === lessonRoot)
        if (lessonExams.length) {
          for (const x of lessonExams) {
            const r = idx.examResultLatest.get(`${x.id}::${student}`)
            if (!r || x.passMark == null || Number(r.score) < x.passMark) return false
          }
        } else if (!progressSet.has(lessonRoot)) {
          return false
        }
      }
      return true
    },

    async issueCertificate(courseId, studentId, text = "") {
      const ssbClient = await openSsb()
      const course = await this.getCourseById(courseId)
      if (course.author !== ssbClient.id) throw new Error("Unauthorized")

      const student = normalizeIds(studentId)[0]
      if (!student) throw new Error("Invalid student id")
      if (!course.students.includes(student)) throw new Error("Student is not enrolled")

      const lessons = await this.listLessons(course.rootId)
      if (lessons.length) {
        const exams = await this.listExams(course.rootId)
        const messages2 = await readAll(ssbClient)
        const idx2 = buildIndex(messages2, ssbClient)
        const progressSet = (idx2.progressByCourse.get(course.rootId) || new Map()).get(student) || new Set()
        for (const lesson of lessons) {
          const lessonRoot = idx2.lessonRootOf(lesson.id)
          const lessonExams = exams.filter(x => !x.locked && x.lessonId && x.lessonId === lessonRoot)
          if (lessonExams.length) {
            for (const x of lessonExams) {
              const r = idx2.examResultLatest.get(`${x.id}::${student}`)
              if (!r || x.passMark == null || Number(r.score) < x.passMark) throw new Error("Student has not passed all lessons")
            }
          } else if (!progressSet.has(lessonRoot)) {
            throw new Error("Student has not completed all lessons")
          }
        }
      }

      const rootId = course.rootId || (await this.resolveRootId(courseId))
      const existing = await this.listCertificates(rootId)
      if (existing.some(cert => cert.student === student)) return { alreadyIssued: true }

      const content = {
        type: "schoolCertificate",
        courseId: rootId,
        courseTitle: course.title,
        student,
        text: String(text || "").trim(),
        author: ssbClient.id,
        createdAt: new Date().toISOString()
      }

      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => e ? rej(e) : res(m)))
    },

    async listCertificates(courseId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages, ssbClient)

      const rootId = idx.rootOf(courseId)
      const certs = []
      for (const node of idx.certNodes.values()) {
        if (idx.tomb.has(node.key)) continue
        if (idx.rootOf(node.c.courseId) !== rootId) continue
        certs.push({
          id: node.key,
          courseId: rootId,
          courseTitle: node.c.courseTitle,
          student: node.c.student,
          text: node.c.text || "",
          author: node.author,
          createdAt: node.c.createdAt || new Date(node.ts).toISOString()
        })
      }
      return certs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    },

    async listCertificatesForStudent(studentId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages, ssbClient)

      const certs = []
      for (const node of idx.certNodes.values()) {
        if (idx.tomb.has(node.key)) continue
        if (node.c.student !== studentId) continue
        certs.push({
          id: node.key,
          courseId: idx.rootOf(node.c.courseId),
          courseTitle: node.c.courseTitle,
          student: node.c.student,
          text: node.c.text || "",
          author: node.author,
          createdAt: node.c.createdAt || new Date(node.ts).toISOString()
        })
      }
      return certs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    },

    async lessonRootOf(lessonId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages, ssbClient)
      return idx.lessonRootOf(lessonId) || lessonId
    },

    async listHiddenComments(courseId) {
      const ssbClient = await openSsb()
      const course = await this.getCourseById(courseId)
      const messages = await readAll(ssbClient)
      const hidden = new Set()
      for (const m of messages) {
        const c = m.value?.content
        if (!c || c.type !== "schoolCommentHide" || !c.target) continue
        if (m.value?.author !== course.author) continue
        if (c.courseId !== course.rootId) continue
        hidden.add(c.target)
      }
      return hidden
    },

    async hideComment(courseId, commentId) {
      const ssbClient = await openSsb()
      const course = await this.getCourseById(courseId)
      if (course.author !== ssbClient.id) throw new Error("Only the teacher can hide comments")
      const content = { type: "schoolCommentHide", courseId: course.rootId, target: commentId, author: ssbClient.id, createdAt: new Date().toISOString() }
      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => e ? rej(e) : res(m)))
    },

    async listCourses(filter = "ALL", viewerId = null, query = {}) {
      const ssbClient = await openSsb()
      const viewer = viewerId || ssbClient.id

      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages, ssbClient)

      const courses = []
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue
        const node = idx.courseNodes.get(tipId)
        if (!node) continue
        const course = buildCourseObject(node, rootId, idx.enrollByCourse.get(rootId), idx.transferAgg, idx.grantsByCourse.get(rootId), idx.opinionsByCourse.get(rootId))
        if (course.undecryptable) continue
        if (!canView(course, viewer)) continue
        courses.push(course)
      }

      const F = String(filter || "ALL").toUpperCase()
      let list = courses

      if (F === "MINE") list = list.filter(c => c.author === viewer)
      else if (F === "APPLIED") list = list.filter(c => c.students.includes(viewer) || c.pending.some(p => p.author === viewer))
      else if (F === "OPEN") list = list.filter(c => !(Number(c.price) > 0))
      else if (F === "ONGOING") list = list.filter(c => c.status === "ONGOING")
      else if (F === "CLOSED") list = list.filter(c => c.status === "CLOSED")
      else if (F === "RECENT") list = list.filter(c => moment(c.createdAt).isAfter(moment().subtract(24, "hours")))
      else if (F === "TOP") list = [...list].sort((a, b) => b.students.length - a.students.length)

      const search = String(query.q || query.search || "").trim()
      if (search) list = list.filter(c => matchSearch(c, search))

      const sort = String(query.sort || "").trim()
      const byRecent = () => list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      if (sort === "students") list.sort((a, b) => b.students.length - a.students.length)
      else if (sort === "title") list.sort((a, b) => String(a.title).localeCompare(String(b.title)))
      else if (F !== "TOP") byRecent()

      return list
    },

    async getCourseById(id, viewerId = null) {
      const ssbClient = await openSsb()
      const viewer = viewerId || ssbClient.id

      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages, ssbClient)

      let tipId = id
      while (idx.child.has(tipId)) tipId = idx.child.get(tipId)
      if (idx.tomb.has(tipId)) throw new Error("Course not found")

      let rootId = tipId
      while (idx.parent.has(rootId)) rootId = idx.parent.get(rootId)

      const node = idx.courseNodes.get(tipId)
      if (!node) throw new Error("Course not found")

      const course = buildCourseObject(node, rootId, idx.enrollByCourse.get(rootId), idx.transferAgg, idx.grantsByCourse.get(rootId), idx.opinionsByCourse.get(rootId))
      if (course.undecryptable) throw new Error("Course not found")
      if (!canView(course, viewer)) throw new Error("Course not found")
      return course
    }
  }
}
