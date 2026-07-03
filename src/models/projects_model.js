const pull = require("../server/node_modules/pull-stream")
const moment = require("../server/node_modules/moment")
const { getConfig } = require("../configs/config-manager.js")
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { dedupeBy, norm } = require('../backend/dedupe')
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

  const COLLAB_MSG = new Set(["projectOpinion", "projectFollow", "projectPledge", "projectClaim", "projectPledgeConfirm"])

  function buildProjectIndex(messages) {
    const tomb = buildValidatedTombstoneSet(messages)
    const nodes = new Map()
    const collab = { opinion: [], follow: [], pledge: [], claim: [], pledgeConfirm: [] }
    for (const m of messages) {
      const c = m && m.value && m.value.content
      if (!c) continue
      if (c.type === "tombstone") continue
      if (c.type === "projectOpinion") { collab.opinion.push({ target: c.target, author: m.value.author, category: c.category, ts: (m.value && m.value.timestamp) || 0 }); continue }
      if (c.type === "projectFollow") { collab.follow.push({ target: c.target, author: m.value.author, on: c.on !== false, ts: (m.value && m.value.timestamp) || 0 }); continue }
      if (c.type === "projectPledge") { collab.pledge.push({ target: c.target, author: m.value.author, amount: Math.max(0, parseFloat(c.amount || 0) || 0), transferId: c.transferId || null, milestoneIndex: c.milestoneIndex != null ? c.milestoneIndex : null, bountyIndex: c.bountyIndex != null ? c.bountyIndex : null, ts: (m.value && m.value.timestamp) || 0 }); continue }
      if (c.type === "projectPledgeConfirm") { collab.pledgeConfirm.push({ target: c.target, author: m.value.author, transferId: c.transferId || null, ts: (m.value && m.value.timestamp) || 0 }); continue }
      if (c.type === "projectClaim") { collab.claim.push({ target: c.target, author: m.value.author, index: parseInt(c.index, 10), ts: (m.value && m.value.timestamp) || 0 }); continue }
      if (c.type !== TYPE) continue
      nodes.set(m.key, { key: m.key, ts: (m.value && m.value.timestamp) || 0, c, author: m.value.author })
    }
    const naiveNext = new Map(), naivePrev = new Map(), strictNext = new Map()
    for (const [key, n] of nodes) {
      const t = n.c.replaces
      if (!t) continue
      naiveNext.set(t, key); naivePrev.set(key, t)
      const orig = nodes.get(t)
      if (orig && orig.author === n.author) strictNext.set(t, key)
    }
    return { tomb, nodes, collab, naiveNext, naivePrev, strictNext }
  }

  function resolveProjectGroup(idx, root) {
    const { nodes, collab, naiveNext, strictNext } = idx
    const followStrict = (key) => { let x = key, g = 0; while (strictNext.has(x) && g++ < 100000) x = strictNext.get(x); return x }
    const rootNode = nodes.get(root)
    const rootAuthor = rootNode ? rootNode.author : null
    let tip = followStrict(root)
    const tn = nodes.get(tip)
    if (!tn || tn.author !== rootAuthor) tip = root
    const best = nodes.get(tip)
    if (!best) return null

    const groupKeys = []
    { let x = root, g = 0; groupKeys.push(x); while (naiveNext.has(x) && g++ < 100000) { x = naiveNext.get(x); groupKeys.push(x) } }

    const project = { ...best.c, id: tip }

    const followers = new Set()
    const opinions = {}
    const opinionSet = new Set()
    let backers = []
    const claimByIndex = new Map()
    for (const k of groupKeys) {
      const n = nodes.get(k); if (!n) continue
      if (n.author !== rootAuthor) continue
      const c = n.c
      for (const f of (Array.isArray(c.followers) ? c.followers : [])) followers.add(f)
      if (Array.isArray(c.backers) && c.backers.length > backers.length) backers = c.backers.slice()
      for (const v of (Array.isArray(c.opinions_inhabitants) ? c.opinions_inhabitants : [])) {
        if (!opinionSet.has(v)) opinionSet.add(v)
      }
      if (c.opinions && typeof c.opinions === "object") { for (const kk of Object.keys(c.opinions)) opinions[kk] = Math.max(opinions[kk] || 0, Number(c.opinions[kk]) || 0) }
      if (Array.isArray(c.bounties)) c.bounties.forEach((b, i) => { if (b && b.claimedBy && !claimByIndex.has(i)) claimByIndex.set(i, b.claimedBy) })
    }

    for (const f of collab.follow.filter(x => x.target === root).sort((a, b) => a.ts - b.ts)) { if (f.on) followers.add(f.author); else followers.delete(f.author) }
    for (const op of collab.opinion.filter(x => x.target === root)) { if (!opinionSet.has(op.author)) { opinionSet.add(op.author); opinions[op.category] = (opinions[op.category] || 0) + 1 } }
    const confirmedTransfers = new Set(collab.pledgeConfirm.filter(x => x.target === root && x.author === rootAuthor && x.transferId).map(x => String(x.transferId)))
    const pledgeMsgs = collab.pledge.filter(x => x.target === root).sort((a, b) => a.ts - b.ts)
    for (const p of pledgeMsgs) backers.push({ userId: p.author, amount: p.amount, at: new Date(p.ts || 0).toISOString(), transferId: p.transferId || null, milestoneIndex: p.milestoneIndex, bountyIndex: p.bountyIndex, confirmed: !!(p.transferId && confirmedTransfers.has(String(p.transferId))) })
    for (const cl of collab.claim.filter(x => x.target === root).sort((a, b) => a.ts - b.ts)) { if (Number.isInteger(cl.index) && !claimByIndex.has(cl.index)) claimByIndex.set(cl.index, cl.author) }

    project.followers = [...followers]
    project.opinions = opinions
    project.opinions_inhabitants = [...opinionSet]
    project.backers = backers
    const pledged = backers.reduce((s, b) => s + (parseFloat(b && b.amount || 0) || 0), 0)
    project.pledged = pledged
    if (Array.isArray(project.bounties)) project.bounties = project.bounties.map((b, i) => ({ ...b, claimedBy: claimByIndex.has(i) ? claimByIndex.get(i) : (b && b.claimedBy) || null }))
    const goalNum = parseFloat(project.goal || 0) || 0
    if (goalNum > 0) project.progress = Math.max(clampPercent(project.progress), Math.min(100, Math.round((pledged / goalNum) * 100)))

    return { tip, root, best, project, tombstoned: idx.tomb.has(tip) }
  }

  const rootOfIdx = (idx, key) => { let x = key, g = 0; while (idx.naivePrev.has(x) && idx.nodes.has(idx.naivePrev.get(x)) && g++ < 100000) x = idx.naivePrev.get(x); return x }

  async function resolveTipId(id) {
    const ssbClient = await openSsb()
    const idx = buildProjectIndex(await getAllMsgs(ssbClient))
    const g = resolveProjectGroup(idx, rootOfIdx(idx, id))
    if (!g || g.tombstoned) throw new Error("Project not found")
    return g.tip
  }

  async function getById(id) {
    const ssbClient = await openSsb()
    const idx = buildProjectIndex(await getAllMsgs(ssbClient))
    const g = resolveProjectGroup(idx, rootOfIdx(idx, id))
    if (!g || g.tombstoned) throw new Error("Project not found")
    return g.project
  }

  const CONTENT_COLLAB_FIELDS = ["followers", "backers", "opinions", "opinions_inhabitants", "pledged", "activity"]
  function stripCollab(content) {
    const out = { ...content }
    delete out.id
    for (const f of CONTENT_COLLAB_FIELDS) delete out[f]
    out.followers = []
    out.backers = []
    out.opinions = {}
    out.opinions_inhabitants = []
    out.pledged = 0
    if (Array.isArray(out.bounties)) out.bounties = out.bounties.map((b) => ({ ...b, claimedBy: null }))
    return out
  }

  async function publishReplace(ssbClient, currentId, content) {
    const tomb = { type: "tombstone", target: currentId, deletedAt: new Date().toISOString(), author: ssbClient.id }
    const updated = { ...stripCollab(content), type: TYPE, replaces: currentId, updatedAt: new Date().toISOString() }
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
        updatedAt: null,
        mapUrl: String(data.mapUrl || "").trim(),
        clearnetPublic: data.clearnetPublic === true || data.clearnetPublic === 'true' || data.clearnetPublic === 'on',
        opinions: {},
        opinions_inhabitants: []
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
        status: patch.status === undefined ? current.status : String(patch.status || "").toUpperCase(),
        clearnetPublic: patch.clearnetPublic === undefined ? !!current.clearnetPublic : (patch.clearnetPublic === true || patch.clearnetPublic === 'true' || patch.clearnetPublic === 'on')
      }

      return publishReplace(ssbClient, current.id, updated)
    },

    async createOpinion(id, category) {
      const categories = require('../backend/opinion_categories')
      if (!categories.includes(category)) throw new Error('Invalid opinion category')
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const idx = buildProjectIndex(await getAllMsgs(ssbClient))
      const g = resolveProjectGroup(idx, rootOfIdx(idx, id))
      if (!g || g.tombstoned) throw new Error('Project not found')
      if ((g.project.opinions_inhabitants || []).includes(userId)) throw new Error('Already opined')
      const content = { type: 'projectOpinion', target: g.root, category, createdAt: new Date().toISOString() }
      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => (e ? rej(e) : res(m))))
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
      const ssbClient = await openSsb()
      const idx = buildProjectIndex(await getAllMsgs(ssbClient))
      const g = resolveProjectGroup(idx, rootOfIdx(idx, id))
      if (!g || g.tombstoned) throw new Error("Project not found")
      const content = { type: "projectFollow", target: g.root, on: true, createdAt: new Date().toISOString() }
      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => (e ? rej(e) : res(m))))
    },

    async unfollowProject(id, uid) {
      const ssbClient = await openSsb()
      const idx = buildProjectIndex(await getAllMsgs(ssbClient))
      const g = resolveProjectGroup(idx, rootOfIdx(idx, id))
      if (!g || g.tombstoned) throw new Error("Project not found")
      const content = { type: "projectFollow", target: g.root, on: false, createdAt: new Date().toISOString() }
      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => (e ? rej(e) : res(m))))
    },

    async pledgeToProject(id, uid, amount, extra = {}) {
      const ssbClient = await openSsb()
      const idx = buildProjectIndex(await getAllMsgs(ssbClient))
      const g = resolveProjectGroup(idx, rootOfIdx(idx, id))
      if (!g || g.tombstoned) throw new Error("Project not found")
      const amt = Math.max(0, parseFloat(amount || 0) || 0)
      if (amt <= 0) throw new Error("Invalid amount")
      const content = { type: "projectPledge", target: g.root, amount: amt, createdAt: new Date().toISOString() }
      if (extra && extra.transferId) content.transferId = extra.transferId
      if (extra && extra.milestoneIndex != null) content.milestoneIndex = extra.milestoneIndex
      if (extra && extra.bountyIndex != null) content.bountyIndex = extra.bountyIndex
      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => (e ? rej(e) : res(m))))
    },

    async confirmPledge(id, transferId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const idx = buildProjectIndex(await getAllMsgs(ssbClient))
      const g = resolveProjectGroup(idx, rootOfIdx(idx, id))
      if (!g || g.tombstoned) throw new Error("Project not found")
      if (String(g.project.author) !== String(userId)) throw new Error("Only the project author can confirm pledges")
      const content = { type: "projectPledgeConfirm", target: g.root, transferId: String(transferId || ""), createdAt: new Date().toISOString() }
      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => (e ? rej(e) : res(m))))
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
      const ssbClient = await openSsb()
      const idx = buildProjectIndex(await getAllMsgs(ssbClient))
      const g = resolveProjectGroup(idx, rootOfIdx(idx, id))
      if (!g || g.tombstoned) throw new Error("Project not found")
      const bounties = Array.isArray(g.project.bounties) ? g.project.bounties : []
      if (!bounties[index]) throw new Error("Bounty not found")
      if (bounties[index].claimedBy) throw new Error("Already claimed")
      if (g.project.author === uid) throw new Error("Authors cannot claim")
      const content = { type: "projectClaim", target: g.root, index: parseInt(index, 10), createdAt: new Date().toISOString() }
      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => (e ? rej(e) : res(m))))
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
      const idx = buildProjectIndex(await getAllMsgs(ssbClient))

      const roots = new Set()
      for (const key of idx.nodes.keys()) roots.add(rootOfIdx(idx, key))

      const out = []
      for (const root of roots) {
        const g = resolveProjectGroup(idx, root)
        if (!g || g.tombstoned) continue
        const c = g.project
        out.push({
          ...c,
          id: g.tip,
          status: String(c.status || "ACTIVE").toUpperCase(),
          createdAt: c.createdAt || new Date(g.best.ts).toISOString(),
          deadline: c.deadline || null
        })
      }

      let list = dedupeBy(out, p => p.title ? [norm(p.author), norm(p.title), norm(p.createdAt)].join('|') : null)
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

