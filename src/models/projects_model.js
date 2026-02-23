const pull = require("../server/node_modules/pull-stream")
const moment = require("../server/node_modules/moment")
const { getConfig } = require("../configs/config-manager.js")
const logLimit = (getConfig().ssbLogStream && getConfig().ssbLogStream.limit) || 1000

module.exports = ({ cooler }) => {
  let ssb
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open()
    return ssb
  }

  const TYPE = "project"

  const clampPercent = (n) => {
    const x = parseInt(n, 10)
    if (!Number.isFinite(x)) return 0
    return Math.max(0, Math.min(100, x))
  }

  async function getAllMsgs(ssbClient) {
    return new Promise((r, j) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((e, m) => (e ? j(e) : r(m)))
      )
    })
  }

  function extractBlobId(possibleMarkdownImage) {
    return possibleMarkdownImage || null
  }

  function normalizeMilestonesFrom(data) {
    if (Array.isArray(data.milestones)) {
      return data.milestones
        .map((m) => {
          return {
            title: String((m && m.title) || "").trim(),
            description: (m && m.description) || "",
            targetPercent: clampPercent(m && m.targetPercent),
            dueDate: m && m.dueDate ? new Date(m.dueDate).toISOString() : null,
            done: !!(m && m.done)
          }
        })
        .filter((m) => m.title)
    }

    const title = String((data["milestones[0][title]"] || data.milestoneTitle || "")).trim()
    const description = data["milestones[0][description]"] || data.milestoneDescription || ""
    const tpRaw = (data["milestones[0][targetPercent]"] != null ? data["milestones[0][targetPercent]"] : data.milestoneTargetPercent) != null
      ? (data["milestones[0][targetPercent]"] != null ? data["milestones[0][targetPercent]"] : data.milestoneTargetPercent)
      : 0
    const targetPercent = clampPercent(tpRaw)
    const dueRaw = data["milestones[0][dueDate]"] || data.milestoneDueDate || null
    const dueDate = dueRaw ? new Date(dueRaw).toISOString() : null
    const out = []
    if (title) out.push({ title, description, targetPercent, dueDate, done: false })
    return out
  }

  function safeMilestoneIndex(project, idx) {
    const total = Array.isArray(project.milestones) ? project.milestones.length : 0
    if (idx === null || idx === undefined || idx === "" || isNaN(idx)) return null
    const n = parseInt(idx, 10)
    if (!Number.isFinite(n)) return null
    if (n < 0 || n >= total) return null
    return n
  }

  function autoCompleteMilestoneIfReady(projectLike, milestoneIdx) {
    if (milestoneIdx === null || milestoneIdx === undefined) {
      return { milestones: projectLike.milestones || [], progress: projectLike.progress || 0, changed: false }
    }
    const milestones = Array.isArray(projectLike.milestones) ? projectLike.milestones.slice() : []
    if (!milestones[milestoneIdx]) {
      return { milestones, progress: projectLike.progress || 0, changed: false }
    }
    const bounties = Array.isArray(projectLike.bounties) ? projectLike.bounties : []
    const related = bounties.filter((b) => b && b.milestoneIndex === milestoneIdx)
    if (related.length === 0) {
      return { milestones, progress: projectLike.progress || 0, changed: false }
    }
    const allDone = related.every((b) => !!(b && b.done))
    let progress = projectLike.progress || 0
    let changed = false
    if (allDone && !milestones[milestoneIdx].done) {
      milestones[milestoneIdx].done = true
      const target = clampPercent(milestones[milestoneIdx].targetPercent || 0)
      const pInt = parseInt(progress, 10)
      progress = Math.max(Number.isFinite(pInt) ? pInt : 0, target)
      changed = true
    }
    return { milestones, progress, changed }
  }

  async function resolveTipId(id) {
    const ssbClient = await openSsb()
    const all = await getAllMsgs(ssbClient)

    const tomb = new Set()
    const forward = new Map()

    for (const m of all) {
      const c = m && m.value && m.value.content
      if (!c) continue
      if (c.type === "tombstone" && c.target) tomb.add(c.target)
      if (c.type === TYPE && c.replaces) forward.set(c.replaces, m.key)
    }

    let cur = id
    while (forward.has(cur)) cur = forward.get(cur)
    if (tomb.has(cur)) throw new Error("Project not found")
    return cur
  }

  async function getById(id) {
    const ssbClient = await openSsb()
    const tip = await resolveTipId(id)
    const msg = await new Promise((r, j) => ssbClient.get(tip, (e, m) => (e ? j(e) : r(m))))
    if (!msg || !msg.content) throw new Error("Project not found")
    return { id: tip, ...msg.content }
  }

  async function publishReplace(ssbClient, currentId, content) {
    const tomb = { type: "tombstone", target: currentId, deletedAt: new Date().toISOString(), author: ssbClient.id }
    const updated = { ...content, type: TYPE, replaces: currentId, updatedAt: new Date().toISOString() }
    await new Promise((res, rej) => ssbClient.publish(tomb, (e) => (e ? rej(e) : res())))
    return new Promise((res, rej) => ssbClient.publish(updated, (e, m) => (e ? rej(e) : res(m))))
  }

  function isParticipant(project, uid) {
    if (!project || !uid) return false
    const backers = Array.isArray(project.backers) ? project.backers : []
    if (backers.some((b) => b && b.userId === uid)) return true
    const bounties = Array.isArray(project.bounties) ? project.bounties : []
    if (bounties.some((b) => b && b.claimedBy === uid)) return true
    return false
  }

  return {
    type: TYPE,

    async createProject(data) {
      const ssbClient = await openSsb()
      const blobId = extractBlobId(data.image)
      const milestones = normalizeMilestonesFrom(data)

      let goal = parseFloat(data.goal || 0) || 0
      if (goal < 0) goal = 0

      const deadlineISO = data.deadline ? new Date(data.deadline).toISOString() : null

      const content = {
        type: TYPE,
        title: data.title,
        description: data.description,
        image: blobId || null,
        goal,
        pledged: parseFloat(data.pledged || 0) || 0,
        deadline: deadlineISO,
        progress: clampPercent(data.progress || 0),
        status: String(data.status || "ACTIVE").toUpperCase(),
        milestones,
        bounties: Array.isArray(data.bounties)
          ? data.bounties
              .map((b) => {
                return {
                  title: String((b && b.title) || "").trim(),
                  amount: Math.max(0, parseFloat((b && b.amount) || 0) || 0),
                  description: (b && b.description) || "",
                  claimedBy: (b && b.claimedBy) || null,
                  done: !!(b && b.done),
                  milestoneIndex: b && b.milestoneIndex != null ? parseInt(b.milestoneIndex, 10) : null
                }
              })
              .filter((b) => b.title)
          : [],
        followers: [],
        backers: [],
        author: ssbClient.id,
        createdAt: new Date().toISOString(),
        updatedAt: null
      }

      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => (e ? rej(e) : res(m))))
    },

    async updateProject(id, patch) {
      const ssbClient = await openSsb()
      const current = await getById(id)
      if (current.author !== ssbClient.id) throw new Error("Unauthorized")

      let blobId = patch.image === undefined ? current.image : patch.image
      blobId = extractBlobId(blobId)

      let milestones = patch.milestones === undefined ? current.milestones : patch.milestones
      if (milestones != null) {
        milestones = Array.isArray(milestones)
          ? milestones
              .map((m) => {
                return {
                  title: String((m && m.title) || "").trim(),
                  description: (m && m.description) || "",
                  targetPercent: clampPercent(m && m.targetPercent),
                  dueDate: m && m.dueDate ? new Date(m.dueDate).toISOString() : null,
                  done: !!(m && m.done)
                }
              })
              .filter((m) => m.title)
          : current.milestones
      }

      let bounties = patch.bounties === undefined ? current.bounties : patch.bounties
      if (bounties != null) {
        bounties = Array.isArray(bounties)
          ? bounties
              .map((b) => {
                return {
                  title: String((b && b.title) || "").trim(),
                  amount: Math.max(0, parseFloat((b && b.amount) || 0) || 0),
                  description: (b && b.description) || "",
                  claimedBy: (b && b.claimedBy) || null,
                  done: !!(b && b.done),
                  milestoneIndex: b && b.milestoneIndex != null ? safeMilestoneIndex({ milestones: milestones || current.milestones }, b.milestoneIndex) : null
                }
              })
              .filter((b) => b.title)
          : current.bounties
      }

      let deadline = patch.deadline === undefined ? current.deadline : patch.deadline
      if (deadline != null && deadline !== "") deadline = new Date(deadline).toISOString()
      else if (deadline === "") deadline = null

      const updated = {
        ...current,
        ...patch,
        image: blobId || null,
        milestones,
        bounties,
        deadline,
        progress: patch.progress === undefined ? current.progress : clampPercent(patch.progress),
        status: patch.status === undefined ? current.status : String(patch.status || "").toUpperCase()
      }

      return publishReplace(ssbClient, current.id, updated)
    },

    async deleteProject(id) {
      const ssbClient = await openSsb()
      const tip = await resolveTipId(id)
      const project = await getById(tip)
      if (project.author !== ssbClient.id) throw new Error("Unauthorized")
      const tomb = { type: "tombstone", target: tip, deletedAt: new Date().toISOString(), author: ssbClient.id }
      return new Promise((res, rej) => ssbClient.publish(tomb, (e, r) => (e ? rej(e) : res(r))))
    },

    async updateProjectStatus(id, status) {
      const s = String(status || "").toUpperCase()
      return this.updateProject(id, { status: s })
    },

    async updateProjectProgress(id, progress) {
      const p = clampPercent(progress)
      return this.updateProject(id, { progress: p, ...(p >= 100 ? { status: "COMPLETED" } : {}) })
    },

    async followProject(id, uid) {
      const tip = await resolveTipId(id)
      const ssbClient = await openSsb()
      const project = await getById(tip)
      const followers = Array.isArray(project.followers) ? project.followers.slice() : []
      if (!followers.includes(uid)) followers.push(uid)
      return publishReplace(ssbClient, project.id, { ...project, followers, activity: { kind: "follow", activityActor: uid, at: new Date().toISOString() } })
    },

    async unfollowProject(id, uid) {
      const tip = await resolveTipId(id)
      const ssbClient = await openSsb()
      const project = await getById(tip)
      const followers = Array.isArray(project.followers) ? project.followers.filter((x) => x !== uid) : []
      return publishReplace(ssbClient, project.id, { ...project, followers, activity: { kind: "unfollow", activityActor: uid, at: new Date().toISOString() } })
    },

    async pledgeToProject(id, uid, amount) {
      const tip = await resolveTipId(id)
      const ssbClient = await openSsb()
      const project = await getById(tip)
      const amt = Math.max(0, parseFloat(amount || 0) || 0)
      if (amt <= 0) throw new Error("Invalid amount")
      const backers = Array.isArray(project.backers) ? project.backers.slice() : []
      backers.push({ userId: uid, amount: amt, at: new Date().toISOString(), confirmed: false })
      const pledged = (parseFloat(project.pledged || 0) || 0) + amt
      const progress = project.goal ? (pledged / parseFloat(project.goal || 1)) * 100 : project.progress
      return publishReplace(ssbClient, project.id, { ...project, backers, pledged, progress })
    },

    async addBounty(id, bounty) {
      const tip = await resolveTipId(id)
      const ssbClient = await openSsb()
      const project = await getById(tip)
      if (project.author !== ssbClient.id) throw new Error("Unauthorized")
      const bounties = Array.isArray(project.bounties) ? project.bounties.slice() : []
      const clean = {
        title: String((bounty && bounty.title) || "").trim(),
        amount: Math.max(0, parseFloat((bounty && bounty.amount) || 0) || 0),
        description: (bounty && bounty.description) || "",
        claimedBy: null,
        done: false,
        milestoneIndex: safeMilestoneIndex(project, bounty && bounty.milestoneIndex)
      }
      if (!clean.title) throw new Error("Bounty title required")
      bounties.push(clean)
      return publishReplace(ssbClient, project.id, { ...project, bounties })
    },

    async updateBounty(id, index, patch) {
      const tip = await resolveTipId(id)
      const ssbClient = await openSsb()
      const project = await getById(tip)
      if (project.author !== ssbClient.id) throw new Error("Unauthorized")
      const bounties = Array.isArray(project.bounties) ? project.bounties.slice() : []
      if (!bounties[index]) throw new Error("Bounty not found")

      if (patch.title !== undefined) bounties[index].title = String(patch.title || "").trim()
      if (patch.amount !== undefined) bounties[index].amount = Math.max(0, parseFloat(patch.amount || 0) || 0)
      if (patch.description !== undefined) bounties[index].description = patch.description || ""
      if (patch.milestoneIndex !== undefined) bounties[index].milestoneIndex = safeMilestoneIndex(project, patch.milestoneIndex)
      if (patch.done !== undefined) bounties[index].done = !!patch.done

      return publishReplace(ssbClient, project.id, { ...project, bounties })
    },

    async addMilestone(id, milestone) {
      const tip = await resolveTipId(id)
      const ssbClient = await openSsb()
      const project = await getById(tip)
      if (project.author !== ssbClient.id) throw new Error("Unauthorized")
      const milestones = Array.isArray(project.milestones) ? project.milestones.slice() : []
      const clean = {
        title: String((milestone && milestone.title) || "").trim(),
        description: (milestone && milestone.description) || "",
        targetPercent: clampPercent(milestone && milestone.targetPercent),
        dueDate: milestone && milestone.dueDate ? new Date(milestone.dueDate).toISOString() : null,
        done: false
      }
      if (!clean.title) throw new Error("Milestone title required")
      milestones.push(clean)
      return publishReplace(ssbClient, project.id, { ...project, milestones })
    },

    async updateMilestone(id, index, patch) {
      const tip = await resolveTipId(id)
      const ssbClient = await openSsb()
      const project = await getById(tip)
      if (project.author !== ssbClient.id) throw new Error("Unauthorized")
      const milestones = Array.isArray(project.milestones) ? project.milestones.slice() : []
      if (!milestones[index]) throw new Error("Milestone not found")

      if (patch.title !== undefined) milestones[index].title = String(patch.title || "").trim()
      if (patch.description !== undefined) milestones[index].description = patch.description || ""
      if (patch.targetPercent !== undefined) milestones[index].targetPercent = clampPercent(patch.targetPercent)
      if (patch.dueDate !== undefined) milestones[index].dueDate = patch.dueDate ? new Date(patch.dueDate).toISOString() : null

      let progress = project.progress
      if (patch.done !== undefined) {
        milestones[index].done = !!patch.done
        if (milestones[index].done) {
          const target = clampPercent(milestones[index].targetPercent || 0)
          const pInt = parseInt(project.progress || 0, 10)
          progress = Math.max(Number.isFinite(pInt) ? pInt : 0, target)
        }
      }

      const updated = { ...project, milestones, ...(progress !== project.progress ? { progress, ...(progress >= 100 ? { status: "COMPLETED" } : {}) } : {}) }
      return publishReplace(ssbClient, project.id, updated)
    },

    async claimBounty(id, index, uid) {
      const tip = await resolveTipId(id)
      const ssbClient = await openSsb()
      const project = await getById(tip)
      const bounties = Array.isArray(project.bounties) ? project.bounties.slice() : []
      if (!bounties[index]) throw new Error("Bounty not found")
      if (bounties[index].claimedBy) throw new Error("Already claimed")
      if (project.author === uid) throw new Error("Authors cannot claim")
      bounties[index].claimedBy = uid
      return publishReplace(ssbClient, project.id, { ...project, bounties })
    },

    async completeBounty(id, index, uid) {
      const tip = await resolveTipId(id)
      const ssbClient = await openSsb()
      const project = await getById(tip)
      if (project.author !== uid) throw new Error("Unauthorized")
      const bounties = Array.isArray(project.bounties) ? project.bounties.slice() : []
      if (!bounties[index]) throw new Error("Bounty not found")
      bounties[index].done = true

      const ac = autoCompleteMilestoneIfReady({ ...project, bounties }, bounties[index].milestoneIndex)
      const patch = { ...project, bounties }
      if (ac && ac.changed) {
        patch.milestones = ac.milestones
        patch.progress = ac.progress
        if (ac.progress >= 100) patch.status = "COMPLETED"
      }

      return publishReplace(ssbClient, project.id, patch)
    },

    async completeMilestone(id, index, uid) {
      const tip = await resolveTipId(id)
      const ssbClient = await openSsb()
      const project = await getById(tip)
      if (project.author !== uid) throw new Error("Unauthorized")
      const milestones = Array.isArray(project.milestones) ? project.milestones.slice() : []
      if (!milestones[index]) throw new Error("Milestone not found")
      milestones[index].done = true
      const target = clampPercent(milestones[index].targetPercent || 0)
      const pInt = parseInt(project.progress || 0, 10)
      const progress = Math.max(Number.isFinite(pInt) ? pInt : 0, target)
      const patch = { ...project, milestones, progress }
      if (progress >= 100) patch.status = "COMPLETED"
      return publishReplace(ssbClient, project.id, patch)
    },

    async listProjects(filter) {
      const ssbClient = await openSsb()
      const currentUserId = ssbClient.id
      const msgs = await getAllMsgs(ssbClient)

      const tomb = new Set()
      const nodes = new Map()
      const parent = new Map()
      const child = new Map()

      for (const m of msgs) {
        const k = m && m.key
        const c = m && m.value && m.value.content
        if (!c) continue
        if (c.type === "tombstone" && c.target) {
          tomb.add(c.target)
          continue
        }
        if (c.type !== TYPE) continue
        nodes.set(k, { key: k, ts: (m.value && m.value.timestamp) || 0, c })
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

      const out = []
      for (const entry of groups.entries()) {
        const root = entry[0]
        const ids = entry[1]

        let tip = Array.from(ids).find((id) => !child.has(id))
        if (!tip) {
          const arr = Array.from(ids)
          tip = arr.reduce((a, b) => (nodes.get(a).ts > nodes.get(b).ts ? a : b))
        }
        if (tomb.has(tip)) continue
        const n = nodes.get(tip)
        if (!n || !n.c) continue

        const c = n.c
        const status = String(c.status || "ACTIVE").toUpperCase()
        const createdAt = c.createdAt || new Date(n.ts).toISOString()
        const deadline = c.deadline || null

        out.push({
          id: tip,
          ...c,
          status,
          createdAt,
          deadline
        })
      }

      let list = out
      const F = String(filter || "ALL").toUpperCase()

      if (F === "MINE") list = list.filter((p) => p && p.author === currentUserId)
      else if (F === "APPLIED") list = list.filter((p) => p && p.author !== currentUserId && isParticipant(p, currentUserId))
      else if (F === "ACTIVE") list = list.filter((p) => String((p && p.status) || "").toUpperCase() === "ACTIVE")
      else if (F === "COMPLETED") list = list.filter((p) => String((p && p.status) || "").toUpperCase() === "COMPLETED")
      else if (F === "PAUSED") list = list.filter((p) => String((p && p.status) || "").toUpperCase() === "PAUSED")
      else if (F === "CANCELLED") list = list.filter((p) => String((p && p.status) || "").toUpperCase() === "CANCELLED")
      else if (F === "RECENT") list = list.filter((p) => p && moment(p.createdAt).isAfter(moment().subtract(24, "hours")))
      else if (F === "FOLLOWING") list = list.filter((p) => Array.isArray(p.followers) && p.followers.includes(currentUserId))

      if (F === "TOP") {
        list.sort((a, b) => (parseFloat(b.pledged || 0) / (parseFloat(b.goal || 1))) - (parseFloat(a.pledged || 0) / (parseFloat(a.goal || 1))))
      } else {
        list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      }

      return list
    },

    async getProjectById(id) {
      return getById(id)
    },

    async getProjectTipId(id) {
      return resolveTipId(id)
    }
  }
}

