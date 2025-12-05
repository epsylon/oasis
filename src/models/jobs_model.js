const pull = require("../server/node_modules/pull-stream")
const moment = require("../server/node_modules/moment")
const { getConfig } = require("../configs/config-manager.js")
const logLimit = getConfig().ssbLogStream?.limit || 1000

const norm = (s) => String(s || "").trim().toLowerCase()
const toNum = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : NaN
}
const toInt = (v, fallback = 0) => {
  const n = parseInt(String(v ?? ""), 10)
  return Number.isFinite(n) ? n : fallback
}

const normalizeTags = (raw) => {
  if (raw === undefined || raw === null) return []
  if (Array.isArray(raw)) return raw.map(t => String(t || "").trim()).filter(Boolean)
  return String(raw).split(",").map(t => t.trim()).filter(Boolean)
}

const matchSearch = (job, q) => {
  const qq = norm(q)
  if (!qq) return true
  const hay = [
    job.title,
    job.description,
    job.requirements,
    job.tasks,
    job.languages,
    Array.isArray(job.tags) ? job.tags.join(" ") : ""
  ].map(x => norm(x)).join(" ")
  return hay.includes(qq)
}

module.exports = ({ cooler }) => {
  let ssb
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb }

  const readAll = async (ssbClient) =>
    new Promise((resolve, reject) =>
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
      )
    )

  const buildIndex = (messages) => {
    const tomb = new Set()
    const jobNodes = new Map()
    const parent = new Map()
    const child = new Map()
    const jobSubLatest = new Map()

    for (const m of messages) {
      const key = m.key
      const v = m.value || {}
      const c = v.content
      if (!c) continue

      if (c.type === "tombstone" && c.target) {
        tomb.add(c.target)
        continue
      }

      if (c.type === "job") {
        jobNodes.set(key, { key, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        if (c.replaces) {
          parent.set(key, c.replaces)
          child.set(c.replaces, key)
        }
        continue
      }

      if (c.type === "job_sub" && c.jobId) {
        const author = v.author
        if (!author) continue
        const ts = v.timestamp || m.timestamp || 0
        const jobId = c.jobId
        const k = `${jobId}::${author}`
        const prev = jobSubLatest.get(k)
        if (!prev || ts > prev.ts) jobSubLatest.set(k, { ts, value: !!c.value, author, jobId })
        continue
      }
    }

    const rootOf = (id) => {
      let cur = id
      while (parent.has(cur)) cur = parent.get(cur)
      return cur
    }

    const roots = new Set()
    for (const id of jobNodes.keys()) roots.add(rootOf(id))

    const tipOf = (id) => {
      let cur = id
      while (child.has(cur)) cur = child.get(cur)
      return cur
    }

    const tipByRoot = new Map()
    for (const r of roots) tipByRoot.set(r, tipOf(r))

    const subsByJob = new Map()
    for (const { jobId, author, value } of jobSubLatest.values()) {
      if (!subsByJob.has(jobId)) subsByJob.set(jobId, new Set())
      const set = subsByJob.get(jobId)
      if (value) set.add(author)
      else set.delete(author)
    }

    return { tomb, jobNodes, parent, child, rootOf, tipOf, tipByRoot, subsByJob }
  }

  const buildJobObject = (node, rootId, subscribers) => {
    const c = node.c || {}
    let blobId = c.image || null
    if (blobId && /\(([^)]+)\)/.test(String(blobId))) blobId = String(blobId).match(/\(([^)]+)\)/)[1]

    const vacants = Math.max(1, toInt(c.vacants, 1))
    const salaryN = toNum(c.salary)
    const salary = Number.isFinite(salaryN) ? salaryN.toFixed(6) : "0.000000"

    return {
      id: node.key,
      rootId,
      job_type: c.job_type,
      title: c.title,
      description: c.description,
      requirements: c.requirements,
      languages: c.languages,
      job_time: c.job_time,
      tasks: c.tasks,
      location: c.location,
      vacants,
      salary,
      image: blobId,
      author: c.author,
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      status: c.status || "OPEN",
      tags: Array.isArray(c.tags) ? c.tags : normalizeTags(c.tags),
      subscribers: Array.isArray(subscribers) ? subscribers : []
    }
  }

  return {
    type: "job",

    async createJob(jobData) {
      const ssbClient = await openSsb()

      const job_type = String(jobData.job_type || "").toLowerCase()
      if (!["freelancer", "employee"].includes(job_type)) throw new Error("Invalid job type")

      const title = String(jobData.title || "").trim()
      const description = String(jobData.description || "").trim()
      if (!title) throw new Error("Invalid title")
      if (!description) throw new Error("Invalid description")

      const vacants = Math.max(1, toInt(jobData.vacants, 1))
      const salaryN = toNum(jobData.salary)
      const salary = Number.isFinite(salaryN) ? salaryN.toFixed(6) : "0.000000"

      const job_time = String(jobData.job_time || "").toLowerCase()
      if (!["partial", "complete"].includes(job_time)) throw new Error("Invalid job time")

      const location = String(jobData.location || "").toLowerCase()
      if (!["remote", "presencial"].includes(location)) throw new Error("Invalid location")

      let blobId = jobData.image || null
      if (blobId && /\(([^)]+)\)/.test(String(blobId))) blobId = String(blobId).match(/\(([^)]+)\)/)[1]

      const tags = normalizeTags(jobData.tags)

      const content = {
        type: "job",
        job_type,
        title,
        description,
        requirements: String(jobData.requirements || ""),
        languages: String(jobData.languages || ""),
        job_time,
        tasks: String(jobData.tasks || ""),
        location,
        vacants,
        salary,
        image: blobId,
        tags,
        author: ssbClient.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "OPEN"
      }

      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => e ? rej(e) : res(m)))
    },

    async resolveCurrentId(jobId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const { tomb, child } = buildIndex(messages)

      let cur = jobId
      while (child.has(cur)) cur = child.get(cur)
      if (tomb.has(cur)) throw new Error("Job not found")
      return cur
    },

    async resolveRootId(jobId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const { tomb, parent, child } = buildIndex(messages)

      let tip = jobId
      while (child.has(tip)) tip = child.get(tip)
      if (tomb.has(tip)) throw new Error("Job not found")

      let root = tip
      while (parent.has(root)) root = parent.get(root)
      return root
    },

    async updateJob(id, jobData) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)

      const tipId = await this.resolveCurrentId(id)
      const node = idx.jobNodes.get(tipId)
      if (!node || !node.c) throw new Error("Job not found")

      const existingContent = node.c
      const author = existingContent.author
      if (author !== ssbClient.id) throw new Error("Unauthorized")

      const patch = {}

      if (jobData.job_type !== undefined) {
        const jt = String(jobData.job_type || "").toLowerCase()
        if (!["freelancer", "employee"].includes(jt)) throw new Error("Invalid job type")
        patch.job_type = jt
      }

      if (jobData.title !== undefined) {
        const t = String(jobData.title || "").trim()
        if (!t) throw new Error("Invalid title")
        patch.title = t
      }

      if (jobData.description !== undefined) {
        const d = String(jobData.description || "").trim()
        if (!d) throw new Error("Invalid description")
        patch.description = d
      }

      if (jobData.requirements !== undefined) patch.requirements = String(jobData.requirements || "")
      if (jobData.languages !== undefined) patch.languages = String(jobData.languages || "")
      if (jobData.tasks !== undefined) patch.tasks = String(jobData.tasks || "")

      if (jobData.job_time !== undefined) {
        const jt = String(jobData.job_time || "").toLowerCase()
        if (!["partial", "complete"].includes(jt)) throw new Error("Invalid job time")
        patch.job_time = jt
      }

      if (jobData.location !== undefined) {
        const loc = String(jobData.location || "").toLowerCase()
        if (!["remote", "presencial"].includes(loc)) throw new Error("Invalid location")
        patch.location = loc
      }

      if (jobData.vacants !== undefined) {
        const v = Math.max(1, toInt(jobData.vacants, 1))
        patch.vacants = v
      }

      if (jobData.salary !== undefined) {
        const s = toNum(jobData.salary)
        if (!Number.isFinite(s) || s < 0) throw new Error("Invalid salary")
        patch.salary = s.toFixed(6)
      }

      if (jobData.tags !== undefined) patch.tags = normalizeTags(jobData.tags)

      if (jobData.image !== undefined) {
        let blobId = jobData.image
        if (blobId && /\(([^)]+)\)/.test(String(blobId))) blobId = String(blobId).match(/\(([^)]+)\)/)[1]
        patch.image = blobId || null
      }

      if (jobData.status !== undefined) {
        const s = String(jobData.status || "").toUpperCase()
        if (!["OPEN", "CLOSED"].includes(s)) throw new Error("Invalid status")
        patch.status = s
      }

      const next = {
        ...existingContent,
        ...patch,
        author,
        createdAt: existingContent.createdAt,
        updatedAt: new Date().toISOString(),
        replaces: tipId,
        type: "job"
      }

      const tomb = {
        type: "tombstone",
        target: tipId,
        deletedAt: new Date().toISOString(),
        author: ssbClient.id
      }

      await new Promise((res, rej) => ssbClient.publish(tomb, (e) => e ? rej(e) : res()))
      return new Promise((res, rej) => ssbClient.publish(next, (e, m) => e ? rej(e) : res(m)))
    },

    async updateJobStatus(id, status) {
      return this.updateJob(id, { status: String(status || "").toUpperCase() })
    },

    async deleteJob(id) {
      const ssbClient = await openSsb()
      const tipId = await this.resolveCurrentId(id)
      const job = await this.getJobById(tipId)
      if (!job || job.author !== ssbClient.id) throw new Error("Unauthorized")

      const tomb = {
        type: "tombstone",
        target: tipId,
        deletedAt: new Date().toISOString(),
        author: ssbClient.id
      }

      return new Promise((res, rej) => ssbClient.publish(tomb, (e, r) => e ? rej(e) : res(r)))
    },

    async subscribeToJob(id, userId) {
      const ssbClient = await openSsb()
      const me = ssbClient.id
      const uid = userId || me

      const job = await this.getJobById(id)
      if (!job) throw new Error("Job not found")
      if (job.author === uid) throw new Error("Cannot subscribe to your own job")
      if (String(job.status || "").toUpperCase() !== "OPEN") throw new Error("Job is closed")

      const rootId = job.rootId || (await this.resolveRootId(id))

      const msg = {
        type: "job_sub",
        jobId: rootId,
        value: true,
        createdAt: new Date().toISOString()
      }

      return new Promise((res, rej) => ssbClient.publish(msg, (e, m) => e ? rej(e) : res(m)))
    },

    async unsubscribeFromJob(id, userId) {
      const ssbClient = await openSsb()
      const me = ssbClient.id
      const uid = userId || me

      const job = await this.getJobById(id)
      if (!job) throw new Error("Job not found")
      if (job.author === uid) throw new Error("Cannot unsubscribe from your own job")

      const rootId = job.rootId || (await this.resolveRootId(id))

      const msg = {
        type: "job_sub",
        jobId: rootId,
        value: false,
        createdAt: new Date().toISOString()
      }

      return new Promise((res, rej) => ssbClient.publish(msg, (e, m) => e ? rej(e) : res(m)))
    },

    async listJobs(filter = "ALL", viewerId = null, query = {}) {
      const ssbClient = await openSsb()
      const me = ssbClient.id
      const viewer = viewerId || me

      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)

      const jobs = []
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue
        const node = idx.jobNodes.get(tipId)
        if (!node) continue
        const subsSet = idx.subsByJob.get(rootId) || new Set()
        const subs = Array.from(subsSet)
        jobs.push(buildJobObject(node, rootId, subs))
      }

      const F = String(filter || "ALL").toUpperCase()
      let list = jobs

      if (F === "MINE") list = list.filter((j) => j.author === viewer)
      else if (F === "REMOTE") list = list.filter((j) => String(j.location || "").toUpperCase() === "REMOTE")
      else if (F === "PRESENCIAL") list = list.filter((j) => String(j.location || "").toUpperCase() === "PRESENCIAL")
      else if (F === "FREELANCER") list = list.filter((j) => String(j.job_type || "").toUpperCase() === "FREELANCER")
      else if (F === "EMPLOYEE") list = list.filter((j) => String(j.job_type || "").toUpperCase() === "EMPLOYEE")
      else if (F === "OPEN") list = list.filter((j) => String(j.status || "").toUpperCase() === "OPEN")
      else if (F === "CLOSED") list = list.filter((j) => String(j.status || "").toUpperCase() === "CLOSED")
      else if (F === "RECENT") list = list.filter((j) => moment(j.createdAt).isAfter(moment().subtract(24, "hours")))
      else if (F === "APPLIED") list = list.filter((j) => Array.isArray(j.subscribers) && j.subscribers.includes(viewer))

      const search = String(query.search || query.q || "").trim()
      const minSalary = query.minSalary ?? ""
      const maxSalary = query.maxSalary ?? ""
      const sort = String(query.sort || "").trim()

      if (search) list = list.filter((j) => matchSearch(j, search))

      const minS = toNum(minSalary)
      const maxS = toNum(maxSalary)

      if (Number.isFinite(minS)) list = list.filter((j) => toNum(j.salary) >= minS)
      if (Number.isFinite(maxS)) list = list.filter((j) => toNum(j.salary) <= maxS)

      const byRecent = () => list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      const bySalary = () => list.sort((a, b) => toNum(b.salary) - toNum(a.salary))
      const bySubscribers = () => list.sort((a, b) => (b.subscribers || []).length - (a.subscribers || []).length)

      if (F === "TOP") bySalary()
      else if (sort === "salary") bySalary()
      else if (sort === "subscribers") bySubscribers()
      else byRecent()

      return list
    },

    async getJobById(id, viewerId = null) {
      const ssbClient = await openSsb()
      void viewerId

      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)

      let tipId = id
      while (idx.child.has(tipId)) tipId = idx.child.get(tipId)
      if (idx.tomb.has(tipId)) throw new Error("Job not found")

      let rootId = tipId
      while (idx.parent.has(rootId)) rootId = idx.parent.get(rootId)

      const node = idx.jobNodes.get(tipId)
      if (!node) {
        const msg = await new Promise((r, j) => ssbClient.get(tipId, (e, m) => e ? j(e) : r(m)))
        if (!msg || !msg.content) throw new Error("Job not found")
        const tmpNode = { key: tipId, ts: msg.timestamp || 0, c: msg.content, author: msg.author }
        const subsSet = idx.subsByJob.get(rootId) || new Set()
        const subs = Array.from(subsSet)
        return buildJobObject(tmpNode, rootId, subs)
      }

      const subsSet = idx.subsByJob.get(rootId) || new Set()
      const subs = Array.from(subsSet)
      return buildJobObject(node, rootId, subs)
    },

    async getJobTipId(id) {
      return this.resolveCurrentId(id)
    }
  }
}

