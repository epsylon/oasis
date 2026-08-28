const pull = require("../server/node_modules/pull-stream")
const { getConfig } = require("../configs/config-manager.js")
const { buildValidatedTombstoneSet } = require('./tombstone_validator')
const { readTyped } = require('./typed_log')
const logLimit = (getConfig().ssbLogStream && getConfig().ssbLogStream.limit) || 1000

module.exports = ({ cooler }) => {
  let ssb
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open()
    return ssb
  }

  const TYPE = "industry"
  const SECTORS = ["software", "hardware", "agriculture", "textile", "energy", "food", "construction", "media", "services", "other"]
  const POLICIES = ["open", "vote", "invite"]

  const clampPercent = (n) => {
    const x = parseInt(n, 10)
    if (!Number.isFinite(x)) return 0
    return Math.max(0, Math.min(100, x))
  }
  const clampMajority = (n) => {
    const x = parseFloat(n)
    if (!Number.isFinite(x)) return 0.5
    return Math.max(0.5, Math.min(1, x))
  }
  const clampQuorum = (n) => {
    const x = parseInt(n, 10)
    if (!Number.isFinite(x) || x < 1) return 1
    return Math.min(100000, x)
  }
  const safeSector = (s) => {
    const v = String(s || "").toLowerCase().trim()
    return SECTORS.includes(v) ? v : "other"
  }
  const safePolicy = (p) => {
    const v = String(p || "").toLowerCase().trim()
    return POLICIES.includes(v) ? v : "vote"
  }
  const nonNegNum = (v) => {
    const x = parseFloat(v)
    return Number.isFinite(x) && x >= 0 ? x : 0
  }

  const INDUSTRY_TYPES = [TYPE, "industryMember", "industryInvite", "industryApply", "industryVote", "industryOpinion", "industryBlueprint", "industryBuild", "industryBuildStatus", "industryBuildDates", "industryBuildUpdate", "industryContribution", "industryAllocation", "tombstone"]

  async function getAllMsgs(ssbClient) {
    return readTyped(ssbClient, INDUSTRY_TYPES, { limit: logLimit })
  }

  function chainMaps(nodeMap) {
    const next = new Map(), prev = new Map(), strictNext = new Map()
    for (const [key, n] of nodeMap) {
      const t = n.c.replaces
      if (!t) continue
      next.set(t, key); prev.set(key, t)
      const orig = nodeMap.get(t)
      if (orig && orig.author === n.author) strictNext.set(t, key)
    }
    return { next, prev, strictNext }
  }

  function buildIndex(messages) {
    const tomb = buildValidatedTombstoneSet(messages)
    const nodes = new Map()
    const blueprints = new Map()
    const builds = new Map()
    const collab = { member: [], invite: [], apply: [], vote: [], opinion: [], buildStatus: [], buildDates: [], contribution: [], allocation: [] }
    for (const m of messages) {
      const c = m && m.value && m.value.content
      if (!c) continue
      if (c.type === "tombstone") continue
      const ts = (m.value && m.value.timestamp) || 0
      const author = m.value && m.value.author
      if (c.type === "industryMember") { collab.member.push({ target: c.target, author, action: c.action === "leave" ? "leave" : "join", ts }); continue }
      if (c.type === "industryInvite") { collab.invite.push({ target: c.target, author, invitee: c.invitee, ts }); continue }
      if (c.type === "industryApply") { collab.apply.push({ target: c.target, author, ts }); continue }
      if (c.type === "industryVote") { collab.vote.push({ target: c.target, author, subject: String(c.subject || ""), ref: String(c.ref || ""), choice: c.choice === "no" ? "no" : "yes", ts }); continue }
      if (c.type === "industryOpinion") { collab.opinion.push({ target: c.target, author, category: c.category, ts }); continue }
      if (c.type === "industryBlueprint") { blueprints.set(m.key, { key: m.key, ts, c, author }); continue }
      if (c.type === "industryBuild") { builds.set(m.key, { key: m.key, ts, c, author }); continue }
      if (c.type === "industryBuildStatus") { collab.buildStatus.push({ target: c.target, author, status: String(c.status || "").toUpperCase(), ts }); continue }
      if (c.type === "industryBuildDates" || c.type === "industryBuildUpdate") { collab.buildDates.push({ target: c.target, author, title: String(c.title || ""), notes: String(c.notes || ""), startDate: String(c.startDate || ""), endDate: String(c.endDate || ""), ts }); continue }
      if (c.type === "industryContribution") { collab.contribution.push({ target: c.target, author, kind: c.kind, hours: nonNegNum(c.hours), item: String(c.item || ""), value: nonNegNum(c.value), eco: nonNegNum(c.eco), transferId: c.transferId || null, note: String(c.note || ""), ts }); continue }
      if (c.type === "industryAllocation") { collab.allocation.push({ target: c.target, author, shares: (c.shares && typeof c.shares === "object") ? c.shares : {}, amounts: (c.amounts && typeof c.amounts === "object") ? c.amounts : {}, pot: nonNegNum(c.pot), outputValue: nonNegNum(c.outputValue), disposition: c.disposition || null, ts }); continue }
      if (c.type !== TYPE) continue
      nodes.set(m.key, { key: m.key, ts, c, author })
    }
    const fc = chainMaps(nodes)
    const bp = chainMaps(blueprints)
    return { tomb, nodes, blueprints, builds, collab, naiveNext: fc.next, naivePrev: fc.prev, strictNext: fc.strictNext, bpNext: bp.next, bpPrev: bp.prev, bpStrictNext: bp.strictNext }
  }

  const rootOfIdx = (idx, key) => { let x = key, g = 0; while (idx.naivePrev.has(x) && idx.nodes.has(idx.naivePrev.get(x)) && g++ < 100000) x = idx.naivePrev.get(x); return x }
  const rootOfBlueprint = (idx, key) => { let x = key, g = 0; while (idx.bpPrev.has(x) && idx.blueprints.has(idx.bpPrev.get(x)) && g++ < 100000) x = idx.bpPrev.get(x); return x }

  function passesThreshold(yesCount, memberCount, quorum, majority) {
    const size = Math.max(1, memberCount)
    const need = Math.max(Math.min(clampQuorum(quorum), size), Math.ceil(size * clampMajority(majority)))
    return yesCount >= need
  }

  function actionVoteState(idx, groupRoot, members, subject, ref) {
    const pref = new Map()
    for (const v of idx.collab.vote.filter(x => x.target === groupRoot && x.subject === subject && x.ref === ref).sort((a, b) => a.ts - b.ts)) {
      if (!members.has(v.author)) continue
      pref.set(v.author, v.choice)
    }
    const voters = [...pref.entries()].filter(([, c]) => c === "yes").map(([m]) => m)
    return { yes: voters.length, voters }
  }

  function voteNeedOf(g) {
    const size = Math.max(1, new Set(g.facility.members).size)
    return Math.max(Math.min(clampQuorum(g.facility.quorum), size), Math.ceil(size * clampMajority(g.facility.majority)))
  }

  function actionApproved(idx, g, subject, ref) {
    const members = new Set(g.facility.members)
    if (members.size <= 1) return true
    const st = actionVoteState(idx, g.root, members, subject, ref)
    return passesThreshold(st.yes, members.size, g.facility.quorum, g.facility.majority)
  }

  function blueprintGovernance(idx, g, bpRoot) {
    const members = new Set(g.facility.members)
    const up = actionVoteState(idx, g.root, members, "bpUpdate", bpRoot)
    const del = actionVoteState(idx, g.root, members, "bpDelete", bpRoot)
    return {
      root: bpRoot,
      facilityMembers: members.size,
      voteNeed: voteNeedOf(g),
      updateYes: up.yes,
      updateVoters: up.voters,
      deleteYes: del.yes,
      deleteVoters: del.voters,
      updateApproved: actionApproved(idx, g, "bpUpdate", bpRoot),
      deleteApproved: actionApproved(idx, g, "bpDelete", bpRoot)
    }
  }

  function buildGovernance(idx, g, buildId) {
    const members = new Set(g.facility.members)
    const up = actionVoteState(idx, g.root, members, "buildUpdate", buildId)
    const del = actionVoteState(idx, g.root, members, "buildDelete", buildId)
    return {
      facilityMembers: members.size,
      voteNeed: voteNeedOf(g),
      updateYes: up.yes,
      updateVoters: up.voters,
      deleteYes: del.yes,
      deleteVoters: del.voters,
      updateApproved: actionApproved(idx, g, "buildUpdate", buildId),
      deleteApproved: actionApproved(idx, g, "buildDelete", buildId)
    }
  }

  function resolveGroup(idx, root) {
    const { nodes, collab, naiveNext, strictNext } = idx
    const followStrict = (key) => { let x = key, g = 0; while (strictNext.has(x) && g++ < 100000) x = strictNext.get(x); return x }
    const rootNode = nodes.get(root)
    if (!rootNode) return null
    const steward = rootNode.author
    let tip = followStrict(root)
    const tn = nodes.get(tip)
    if (!tn || tn.author !== steward) tip = root
    const best = nodes.get(tip)
    if (!best) return null

    const groupKeys = []
    { let x = root, g = 0; groupKeys.push(x); while (naiveNext.has(x) && g++ < 100000) { x = naiveNext.get(x); groupKeys.push(x) } }

    const facility = { ...best.c, id: tip }
    const policy = safePolicy(facility.membershipPolicy)
    const quorum = clampQuorum(facility.quorum)
    const majority = clampMajority(facility.majority)

    const KIND_ORDER = { invite: 0, apply: 1, member: 2, vote: 3 }
    const events = []
    for (const e of collab.member.filter(x => x.target === root)) events.push({ kind: "member", ...e })
    for (const e of collab.invite.filter(x => x.target === root)) events.push({ kind: "invite", ...e })
    for (const e of collab.apply.filter(x => x.target === root)) events.push({ kind: "apply", ...e })
    for (const e of collab.vote.filter(x => x.target === root)) events.push({ kind: "vote", ...e })
    events.sort((a, b) => (a.ts - b.ts) || (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]))

    const members = new Set([steward])
    const invites = new Set()
    const applicants = new Set()
    const admitVotes = new Map()
    const dissolveVoters = new Set()
    let dissolved = false

    const admitKey = (uid) => "admit:" + uid
    for (const ev of events) {
      if (ev.kind === "invite") {
        if (members.has(ev.author) && ev.invitee) invites.add(ev.invitee)
        continue
      }
      if (ev.kind === "apply") {
        if (!members.has(ev.author)) applicants.add(ev.author)
        continue
      }
      if (ev.kind === "member") {
        if (ev.action === "leave") { if (ev.author !== steward) members.delete(ev.author); continue }
        if (members.has(ev.author)) continue
        if (policy === "open") { members.add(ev.author); applicants.delete(ev.author) }
        else if (policy === "invite" && invites.has(ev.author)) { members.add(ev.author); applicants.delete(ev.author) }
        continue
      }
      if (ev.kind === "vote") {
        if (!members.has(ev.author)) continue
        if (ev.subject === "admit" && ev.ref) {
          const k = admitKey(ev.ref)
          if (!admitVotes.has(k)) admitVotes.set(k, new Map())
          admitVotes.get(k).set(ev.author, ev.choice)
          const yes = [...admitVotes.get(k).values()].filter(v => v === "yes").length
          if (!members.has(ev.ref) && passesThreshold(yes, members.size, quorum, majority)) {
            members.add(ev.ref); applicants.delete(ev.ref)
          }
        } else if (ev.subject === "dissolve") {
          if (ev.choice === "yes") dissolveVoters.add(ev.author); else dissolveVoters.delete(ev.author)
          if (passesThreshold(dissolveVoters.size, members.size, quorum, majority)) dissolved = true
        }
        continue
      }
    }

    const pendingApplicants = [...applicants].map(uid => {
      const k = admitKey(uid)
      const vm = admitVotes.get(k) || new Map()
      let yes = 0, no = 0
      for (const v of vm.values()) { if (v === "yes") yes++; else no++ }
      return { id: uid, yes, no, voters: [...vm.keys()] }
    })

    const opinions = {}
    const opinionSet = new Set()
    for (const k of groupKeys) {
      const n = nodes.get(k); if (!n || n.author !== steward) continue
      const c = n.c
      if (c.opinions && typeof c.opinions === "object") { for (const kk of Object.keys(c.opinions)) opinions[kk] = Math.max(opinions[kk] || 0, Number(c.opinions[kk]) || 0) }
      for (const v of (Array.isArray(c.opinions_inhabitants) ? c.opinions_inhabitants : [])) opinionSet.add(v)
    }
    for (const op of collab.opinion.filter(x => x.target === root)) { if (!opinionSet.has(op.author)) { opinionSet.add(op.author); opinions[op.category] = (opinions[op.category] || 0) + 1 } }

    const pausePref = new Map()
    for (const ev of events) {
      if (ev.kind !== "vote" || ev.subject !== "pause") continue
      if (!members.has(ev.author)) continue
      pausePref.set(ev.author, ev.choice)
    }
    const pauseVoters = [...pausePref.entries()].filter(([, c]) => c === "yes").map(([m]) => m)
    const paused = passesThreshold(pauseVoters.length, members.size, quorum, majority)

    facility.steward = steward
    facility.root = root
    facility.membershipPolicy = policy
    facility.quorum = quorum
    facility.majority = majority
    facility.members = [...members]
    facility.memberCount = members.size
    facility.pendingApplicants = pendingApplicants
    facility.invites = [...invites]
    facility.opinions = opinions
    facility.opinions_inhabitants = [...opinionSet]
    facility.pauseVoters = pauseVoters
    facility.pauseYes = pauseVoters.length
    facility.status = dissolved ? "DISSOLVED" : (paused ? "PAUSED" : "ACTIVE")

    return { tip, root, best, facility, tombstoned: idx.tomb.has(tip) }
  }

  const BUILD_STATUSES = ["PROPOSED", "REJECTED", "APPROVED", "STOCKING", "IN_PRODUCTION", "COMPLETED", "FAILED"]
  const BUILD_TRANSITIONS = { APPROVED: ["STOCKING", "FAILED"], STOCKING: ["IN_PRODUCTION", "FAILED"], IN_PRODUCTION: ["COMPLETED", "FAILED"], FAILED: ["APPROVED", "STOCKING", "IN_PRODUCTION"], COMPLETED: ["IN_PRODUCTION"] }
  const CONTRIBUTABLE = new Set(["APPROVED", "STOCKING", "IN_PRODUCTION"])

  const normalizeMaterials = (raw, text) => {
    if (Array.isArray(raw)) return raw.map(m => ({ item: String((m && m.item) || "").trim(), qty: nonNegNum(m && m.qty), price: nonNegNum(m && m.price) })).filter(m => m.item)
    const t = String(text || "")
    if (!t.trim()) return []
    return t.split("\n").map(line => { const parts = line.split(/[:,]/).map(x => String(x || "").trim()); return { item: parts[0] || "", qty: nonNegNum(parts[1]), price: nonNegNum(parts[2]) } }).filter(m => m.item)
  }

  const safeMaterials = (v) => (Array.isArray(v) ? v : [])
  const estimateBlueprint = (bp, laborRate) => {
    const materialsCost = safeMaterials(bp.materials).reduce((s, m) => s + nonNegNum(m.qty) * nonNegNum(m.price), 0)
    const laborCost = nonNegNum(bp.laborHours) * nonNegNum(laborRate)
    return {
      estMaterialsCost: Number(materialsCost.toFixed(6)),
      estLaborCost: Number(laborCost.toFixed(6)),
      estTotal: Number((materialsCost + laborCost).toFixed(6))
    }
  }
  const estimateForBlueprintRef = (idx, bpRef, laborRate) => {
    if (!bpRef) return null
    const b = resolveBlueprint(idx, rootOfBlueprint(idx, bpRef))
    if (!b || b.tombstoned) return null
    return { blueprintName: b.blueprint.name, blueprintImage: b.blueprint.image || null, blueprintKind: b.blueprint.outKind || null, blueprintLicense: b.blueprint.license || "copyleft", ...estimateBlueprint(b.blueprint, laborRate) }
  }
  const normalizeSkills = (raw) => {
    if (Array.isArray(raw)) return raw.map(x => String(x || "").trim()).filter(Boolean)
    return String(raw || "").split(",").map(x => x.trim()).filter(Boolean)
  }

  function computeShares(contributions, laborRate) {
    const rate = nonNegNum(laborRate)
    const points = new Map()
    for (const c of contributions) {
      let p = 0
      if (c.kind === "labor") p = (c.hours || 0) * rate
      else if (c.kind === "material") p = (c.value || 0)
      else if (c.kind === "eco") p = (c.eco || 0)
      if (p <= 0) continue
      points.set(c.author, (points.get(c.author) || 0) + p)
    }
    let total = 0
    for (const v of points.values()) total += v
    const shares = new Map()
    if (total > 0) for (const [k, v] of points) shares.set(k, v / total)
    return { points, total, shares }
  }

  function resolveBlueprint(idx, root) {
    const { blueprints, bpStrictNext } = idx
    const followStrict = (key) => { let x = key, g = 0; while (bpStrictNext.has(x) && g++ < 100000) x = bpStrictNext.get(x); return x }
    const rootNode = blueprints.get(root)
    if (!rootNode) return null
    const author = rootNode.author
    let tip = followStrict(root)
    const tn = blueprints.get(tip)
    if (!tn || tn.author !== author) tip = root
    const best = blueprints.get(tip)
    if (!best) return null
    return { tip, root, blueprint: { ...best.c, id: tip, author }, tombstoned: idx.tomb.has(tip) }
  }

  function resolveBuild(idx, root, facility) {
    const node = idx.builds.get(root)
    if (!node) return null
    const build = { ...node.c, id: root, proposer: node.author }
    const steward = facility.steward
    const members = new Set(facility.members)
    const approveVotes = new Map()
    for (const v of idx.collab.vote.filter(x => x.subject === "build" && x.ref === root).sort((a, b) => a.ts - b.ts)) {
      if (!members.has(v.author)) continue
      approveVotes.set(v.author, v.choice)
    }
    const approveYes = [...approveVotes.values()].filter(x => x === "yes").length
    const approveNo = [...approveVotes.values()].filter(x => x === "no").length
    let status = "PROPOSED"
    if (passesThreshold(approveYes, members.size, facility.quorum, facility.majority)) status = "APPROVED"
    else if (passesThreshold(approveNo, members.size, facility.quorum, facility.majority)) status = "REJECTED"
    for (const ev of idx.collab.buildStatus.filter(x => x.target === root).sort((a, b) => a.ts - b.ts)) {
      const allowed = BUILD_TRANSITIONS[status] || []
      if (!allowed.includes(ev.status)) continue
      const isSteward = ev.author === steward
      const isProposer = ev.author === build.proposer
      const stewardOnly = ev.status === "COMPLETED" || ev.status === "FAILED"
      if (stewardOnly && !isSteward) continue
      if (!isSteward && !isProposer) continue
      status = ev.status
    }
    for (const ev of idx.collab.buildDates.filter(x => x.target === root).sort((a, b) => a.ts - b.ts)) {
      if (ev.author !== steward && ev.author !== build.proposer) continue
      if (ev.title) build.title = ev.title
      if (ev.notes) build.notes = ev.notes
      if (ev.startDate) build.startDate = ev.startDate
      if (ev.endDate) build.endDate = ev.endDate
    }
    build.status = status
    const contributions = idx.collab.contribution.filter(x => x.target === root && members.has(x.author)).sort((a, b) => a.ts - b.ts)
    build.contributions = contributions.map(c => ({ author: c.author, kind: c.kind, hours: c.hours, item: c.item, value: c.value, eco: c.eco, note: c.note, at: new Date(c.ts || 0).toISOString() }))
    const cs = computeShares(contributions, facility.laborRate)
    build.points = Object.fromEntries(cs.points)
    build.totalPoints = cs.total
    build.shares = Object.fromEntries(cs.shares)
    build.treasury = contributions.reduce((s, c) => s + (c.eco || 0), 0)
    const allocs = idx.collab.allocation.filter(x => x.target === root && x.author === steward).sort((a, b) => a.ts - b.ts)
    const latest = allocs[allocs.length - 1] || null
    build.distributed = !!latest
    build.allocation = latest ? { shares: latest.shares, amounts: latest.amounts, pot: latest.pot, outputValue: latest.outputValue, disposition: latest.disposition, at: new Date(latest.ts || 0).toISOString() } : null
    build.tombstoned = idx.tomb.has(root)
    return build
  }

  async function getById(id) {
    const ssbClient = await openSsb()
    const idx = buildIndex(await getAllMsgs(ssbClient))
    const g = resolveGroup(idx, rootOfIdx(idx, id))
    if (!g || g.tombstoned) throw new Error("Facility not found")
    return g.facility
  }

  async function resolveTipId(id) {
    const ssbClient = await openSsb()
    const idx = buildIndex(await getAllMsgs(ssbClient))
    const g = resolveGroup(idx, rootOfIdx(idx, id))
    if (!g || g.tombstoned) throw new Error("Facility not found")
    return g.tip
  }

  const CONTENT_COLLAB_FIELDS = ["id", "root", "steward", "members", "memberCount", "pendingApplicants", "invites", "opinions", "opinions_inhabitants", "pauseVoters", "pauseYes"]
  function stripCollab(content) {
    const out = { ...content }
    for (const f of CONTENT_COLLAB_FIELDS) delete out[f]
    out.opinions = {}
    out.opinions_inhabitants = []
    return out
  }

  async function publishReplace(ssbClient, currentId, content) {
    const tomb = { type: "tombstone", target: currentId, deletedAt: new Date().toISOString(), author: ssbClient.id }
    const updated = { ...stripCollab(content), type: TYPE, replaces: currentId, updatedAt: new Date().toISOString() }
    await new Promise((res, rej) => ssbClient.publish(tomb, (e) => (e ? rej(e) : res())))
    return new Promise((res, rej) => ssbClient.publish(updated, (e, m) => (e ? rej(e) : res(m))))
  }

  const publish = (ssbClient, content) => new Promise((res, rej) => ssbClient.publish(content, (e, m) => (e ? rej(e) : res(m))))

  return {
    type: TYPE,
    SECTORS,
    POLICIES,

    async createFacility(data) {
      const ssbClient = await openSsb()
      const content = {
        type: TYPE,
        name: String(data.name || "").trim(),
        sector: safeSector(data.sector),
        description: String(data.description || "").trim(),
        image: data.image || null,
        mapUrl: String(data.mapUrl || "").trim(),
        membershipPolicy: safePolicy(data.membershipPolicy),
        quorum: clampQuorum(data.quorum),
        majority: clampMajority(data.majority),
        laborRate: nonNegNum(data.laborRate),
        license: String(data.license || "copyleft").trim() || "copyleft",
        tags: normalizeSkills(data.tags),
        status: "ACTIVE",
        author: ssbClient.id,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        opinions: {},
        opinions_inhabitants: []
      }
      if (!content.name) throw new Error("Facility name is required")
      return publish(ssbClient, content)
    },

    async updateFacility(id, patch) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const g = resolveGroup(idx, rootOfIdx(idx, id))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      if (g.facility.steward !== ssbClient.id) throw new Error("Unauthorized")
      const current = g.facility
      const nextStatus = patch.status === undefined ? current.status : String(patch.status || "").toUpperCase()
      if (nextStatus === "DISSOLVED" && current.status !== "DISSOLVED") throw new Error("Dissolution requires a governance vote")
      const updated = {
        ...current,
        ...patch,
        name: patch.name === undefined ? current.name : String(patch.name || "").trim(),
        sector: patch.sector === undefined ? current.sector : safeSector(patch.sector),
        description: patch.description === undefined ? current.description : String(patch.description || "").trim(),
        image: patch.image === undefined ? current.image : (patch.image || null),
        mapUrl: patch.mapUrl === undefined ? current.mapUrl : String(patch.mapUrl || "").trim(),
        membershipPolicy: patch.membershipPolicy === undefined ? current.membershipPolicy : safePolicy(patch.membershipPolicy),
        quorum: patch.quorum === undefined ? current.quorum : clampQuorum(patch.quorum),
        majority: patch.majority === undefined ? current.majority : clampMajority(patch.majority),
        laborRate: patch.laborRate === undefined ? current.laborRate : nonNegNum(patch.laborRate),
        tags: patch.tags === undefined ? current.tags : normalizeSkills(patch.tags),
        status: nextStatus
      }
      return publishReplace(ssbClient, current.id, updated)
    },

    async deleteFacility(id) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const g = resolveGroup(idx, rootOfIdx(idx, id))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      if (g.facility.steward !== ssbClient.id) throw new Error("Unauthorized")
      if (g.facility.memberCount > 1) throw new Error("A facility with members cannot be deleted; it must be dissolved by vote")
      const tomb = { type: "tombstone", target: g.tip, deletedAt: new Date().toISOString(), author: ssbClient.id }
      return publish(ssbClient, tomb)
    },

    async joinFacility(id) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const g = resolveGroup(idx, rootOfIdx(idx, id))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      if (g.facility.status === "DISSOLVED") throw new Error("Facility is dissolved")
      const uid = ssbClient.id
      if (g.facility.members.includes(uid)) throw new Error("Already a member")
      const policy = g.facility.membershipPolicy
      if (policy === "vote") return publish(ssbClient, { type: "industryApply", target: g.root, createdAt: new Date().toISOString() })
      if (policy === "invite" && !g.facility.invites.includes(uid)) throw new Error("You need an invitation to join")
      return publish(ssbClient, { type: "industryMember", target: g.root, action: "join", createdAt: new Date().toISOString() })
    },

    async leaveFacility(id) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const g = resolveGroup(idx, rootOfIdx(idx, id))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      const uid = ssbClient.id
      if (uid === g.facility.steward) throw new Error("The steward cannot leave; dissolve the facility instead")
      if (!g.facility.members.includes(uid)) throw new Error("Not a member")
      return publish(ssbClient, { type: "industryMember", target: g.root, action: "leave", createdAt: new Date().toISOString() })
    },

    async inviteToFacility(id, invitee) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const g = resolveGroup(idx, rootOfIdx(idx, id))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      if (!g.facility.members.includes(ssbClient.id)) throw new Error("Only members can invite")
      if (!/^@[A-Za-z0-9+/]+={0,2}\.ed25519$/.test(String(invitee || ""))) throw new Error("Invalid invitee id")
      return publish(ssbClient, { type: "industryInvite", target: g.root, invitee: String(invitee), createdAt: new Date().toISOString() })
    },

    async voteGovernance(id, subject, ref, choice) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const g = resolveGroup(idx, rootOfIdx(idx, id))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      if (!g.facility.members.includes(ssbClient.id)) throw new Error("Only members can vote")
      const subj = String(subject || "")
      const SUBJECTS = ["admit", "dissolve", "pause", "bpUpdate", "bpDelete", "buildUpdate", "buildDelete"]
      if (!SUBJECTS.includes(subj)) throw new Error("Invalid governance subject")
      if (subj !== "admit" && subj !== "dissolve" && subj !== "pause" && !String(ref || "").trim()) throw new Error("Governance vote requires a target")
      return publish(ssbClient, { type: "industryVote", target: g.root, subject: subj, ref: String(ref || ""), choice: choice === "no" ? "no" : "yes", createdAt: new Date().toISOString() })
    },

    async createOpinion(id, category) {
      const categories = require('../backend/opinion_categories')
      if (!categories.includes(category)) throw new Error('Invalid opinion category')
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const g = resolveGroup(idx, rootOfIdx(idx, id))
      if (!g || g.tombstoned) throw new Error('Facility not found')
      if ((g.facility.opinions_inhabitants || []).includes(ssbClient.id)) throw new Error('Already opined')
      return publish(ssbClient, { type: 'industryOpinion', target: g.root, category, createdAt: new Date().toISOString() })
    },

    async getFacilityById(id) {
      return getById(id)
    },

    async listFacilities(filter = "ALL") {
      const ssbClient = await openSsb()
      const uid = ssbClient.id
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const roots = new Set()
      for (const key of idx.nodes.keys()) roots.add(rootOfIdx(idx, key))
      let list = []
      for (const root of roots) {
        const g = resolveGroup(idx, root)
        if (!g || g.tombstoned) continue
        list.push(g.facility)
      }
      const f = String(filter || "ALL").toUpperCase()
      if (f === "MINE") list = list.filter(x => x.steward === uid)
      else if (f === "MEMBER") list = list.filter(x => Array.isArray(x.members) && x.members.includes(uid))
      else if (f === "ACTIVE") list = list.filter(x => x.status === "ACTIVE")
      else if (f === "PAUSED") list = list.filter(x => x.status === "PAUSED")
      else if (f === "DISSOLVED") list = list.filter(x => x.status === "DISSOLVED")
      else if (SECTORS.includes(f.toLowerCase())) list = list.filter(x => x.sector === f.toLowerCase())
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      return list
    },

    async facilitiesOf(feedId) {
      const ssbClient = await openSsb()
      const uid = feedId || ssbClient.id
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const roots = new Set()
      for (const key of idx.nodes.keys()) roots.add(rootOfIdx(idx, key))
      const list = []
      for (const root of roots) {
        const g = resolveGroup(idx, root)
        if (!g || g.tombstoned) continue
        if (Array.isArray(g.facility.members) && g.facility.members.includes(uid)) list.push(g.facility)
      }
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      return list
    },

    async listMyBuilds() {
      const ssbClient = await openSsb()
      const uid = ssbClient.id
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const facRoots = new Set()
      for (const key of idx.nodes.keys()) facRoots.add(rootOfIdx(idx, key))
      const myFacilities = new Map()
      for (const root of facRoots) {
        const g = resolveGroup(idx, root)
        if (!g || g.tombstoned) continue
        if (Array.isArray(g.facility.members) && g.facility.members.includes(uid)) myFacilities.set(g.root, g.facility)
      }
      const out = []
      for (const [key, node] of idx.builds) {
        if (idx.tomb.has(key)) continue
        const fac = myFacilities.get(node.c.facility)
        if (!fac) continue
        const build = resolveBuild(idx, key, fac)
        build.facilityId = fac.root
        build.facilityName = fac.name
        out.push(build)
      }
      out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      return out
    },

    async createBlueprint(facilityId, data) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const g = resolveGroup(idx, rootOfIdx(idx, facilityId))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      if (!g.facility.members.includes(ssbClient.id)) throw new Error("Only members can add blueprints")
      const content = {
        type: "industryBlueprint",
        facility: g.root,
        name: String(data.name || "").trim(),
        description: String(data.description || "").trim(),
        image: data.image || null,
        sector: safeSector(data.sector || g.facility.sector),
        materials: normalizeMaterials(data.materials, data.materialsText),
        laborHours: nonNegNum(data.laborHours),
        skills: normalizeSkills(data.skills),
        outItem: String(data.outItem || "").trim(),
        outQty: nonNegNum(data.outQty),
        outUnit: String(data.outUnit || "unit").trim() || "unit",
        outKind: String(data.outKind || "physical").toLowerCase() === "digital" ? "digital" : "physical",
        license: String(data.license || "copyleft").trim() || "copyleft",
        createdAt: new Date().toISOString()
      }
      if (!content.name) throw new Error("Blueprint name is required")
      return publish(ssbClient, content)
    },

    async updateBlueprint(id, patch) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const b = resolveBlueprint(idx, rootOfBlueprint(idx, id))
      if (!b || b.tombstoned) throw new Error("Blueprint not found")
      if (b.blueprint.author !== ssbClient.id) throw new Error("Unauthorized")
      const gb = resolveGroup(idx, rootOfIdx(idx, b.blueprint.facility))
      if (!gb || gb.tombstoned) throw new Error("Facility not found")
      if (!gb.facility.members.includes(ssbClient.id)) throw new Error("Only members of the facility can do this")
      if (!actionApproved(idx, gb, "bpUpdate", b.root)) throw new Error("Updating this blueprint requires a governance vote")
      const cur = b.blueprint
      const updated = {
        type: "industryBlueprint",
        facility: cur.facility,
        name: patch.name === undefined ? cur.name : String(patch.name || "").trim(),
        description: patch.description === undefined ? (cur.description || "") : String(patch.description || "").trim(),
        image: patch.image === undefined ? (cur.image || null) : (patch.image || null),
        sector: patch.sector === undefined ? cur.sector : safeSector(patch.sector),
        materials: patch.materials === undefined && patch.materialsText === undefined ? cur.materials : normalizeMaterials(patch.materials, patch.materialsText),
        laborHours: patch.laborHours === undefined ? cur.laborHours : nonNegNum(patch.laborHours),
        skills: patch.skills === undefined ? cur.skills : normalizeSkills(patch.skills),
        outItem: patch.outItem === undefined ? cur.outItem : String(patch.outItem || "").trim(),
        outQty: patch.outQty === undefined ? cur.outQty : nonNegNum(patch.outQty),
        outUnit: patch.outUnit === undefined ? cur.outUnit : String(patch.outUnit || "unit").trim() || "unit",
        outKind: patch.outKind === undefined ? cur.outKind : (String(patch.outKind).toLowerCase() === "digital" ? "digital" : "physical"),
        license: patch.license === undefined ? cur.license : String(patch.license || "copyleft").trim() || "copyleft",
        replaces: b.tip,
        createdAt: cur.createdAt,
        updatedAt: new Date().toISOString()
      }
      const tomb = { type: "tombstone", target: b.tip, deletedAt: new Date().toISOString(), author: ssbClient.id }
      await publish(ssbClient, tomb)
      return publish(ssbClient, updated)
    },

    async deleteBlueprint(id) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const b = resolveBlueprint(idx, rootOfBlueprint(idx, id))
      if (!b || b.tombstoned) throw new Error("Blueprint not found")
      const g = resolveGroup(idx, rootOfIdx(idx, b.blueprint.facility))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      if (!g.facility.members.includes(ssbClient.id)) throw new Error("Only members of the facility can do this")
      if (b.blueprint.author !== ssbClient.id) throw new Error("Only the author can delete a blueprint")
      if (!actionApproved(idx, g, "bpDelete", b.root)) throw new Error("Deleting this blueprint requires a governance vote")
      const chain = []
      { let x = b.root, guard = 0; chain.push(x); while (idx.bpNext.has(x) && guard++ < 100000) { x = idx.bpNext.get(x); chain.push(x) } }
      const chainSet = new Set(chain)
      let usedBy = 0
      for (const [key, node] of idx.builds) {
        if (idx.tomb.has(key)) continue
        if (chainSet.has(node.c.blueprint)) usedBy++
      }
      if (usedBy > 0) throw new Error(`This blueprint is used by ${usedBy} build${usedBy > 1 ? "s" : ""}; delete them first`)
      let last = null
      for (const key of chain) {
        const node = idx.blueprints.get(key)
        if (!node || node.author !== ssbClient.id) continue
        if (idx.tomb.has(key)) continue
        last = await publish(ssbClient, { type: "tombstone", target: key, deletedAt: new Date().toISOString(), author: ssbClient.id })
      }
      return last
    },

    async getBlueprint(id) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const b = resolveBlueprint(idx, rootOfBlueprint(idx, id))
      if (!b || b.tombstoned) throw new Error("Blueprint not found")
      const g = resolveGroup(idx, rootOfIdx(idx, b.blueprint.facility))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      const builds = []
      for (const [key, node] of idx.builds) {
        if (idx.tomb.has(key)) continue
        if (node.c.blueprint !== b.tip && node.c.blueprint !== b.root) continue
        const rb = resolveBuild(idx, key, g.facility)
        if (rb) builds.push({ id: key, title: rb.title, status: rb.status, startDate: rb.startDate, endDate: rb.endDate })
      }
      builds.sort((x, y) => new Date(y.startDate || 0) - new Date(x.startDate || 0))
      return {
        ...b.blueprint,
        facilityId: g.root,
        facilityName: g.facility.name,
        members: g.facility.members,
        builds,
        ...estimateBlueprint(b.blueprint, g.facility.laborRate),
        ...blueprintGovernance(idx, g, b.root)
      }
    },

    async listBlueprints(facilityId) {
      const ssbClient = await openSsb()
      const msgs = await getAllMsgs(ssbClient)
      const idx = buildIndex(msgs)
      const root = rootOfIdx(idx, facilityId)
      const g = resolveGroup(idx, root)
      const laborRate = g && !g.tombstoned ? g.facility.laborRate : 0
      const roots = new Set()
      for (const key of idx.blueprints.keys()) roots.add(rootOfBlueprint(idx, key))
      const list = []
      for (const r of roots) {
        const b = resolveBlueprint(idx, r)
        if (!b || b.tombstoned) continue
        if (b.blueprint.facility !== root) continue
        list.push({ ...b.blueprint, ...estimateBlueprint(b.blueprint, laborRate), ...(g && !g.tombstoned ? blueprintGovernance(idx, g, b.root) : {}) })
      }
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      return list
    },

    async createBuild(facilityId, data) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const g = resolveGroup(idx, rootOfIdx(idx, facilityId))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      if (g.facility.status !== "ACTIVE") throw new Error("Facility is not active")
      if (!g.facility.members.includes(ssbClient.id)) throw new Error("Only members can propose builds")
      let blueprintId = String(data.blueprintId || "").trim() || null
      if (!blueprintId) throw new Error("A build needs a blueprint")
      {
        const b = resolveBlueprint(idx, rootOfBlueprint(idx, blueprintId))
        if (!b || b.tombstoned || b.blueprint.facility !== g.root) throw new Error("Blueprint not found in this facility")
        blueprintId = b.tip
      }
      const content = { type: "industryBuild", facility: g.root, blueprint: blueprintId, title: String(data.title || "").trim(), notes: String(data.notes || "").trim(), image: data.image || null, startDate: String(data.startDate || "").trim() || null, endDate: String(data.endDate || "").trim() || null, createdAt: new Date().toISOString() }
      if (!content.title) throw new Error("Build title is required")
      const today = new Date().toISOString().slice(0, 10)
      if (!content.startDate) throw new Error("Build start date is required")
      if (!content.endDate) throw new Error("Build end date is required")
      if (content.startDate < today) throw new Error("Start date cannot be in the past")
      if (content.startDate && content.endDate && new Date(content.endDate) < new Date(content.startDate)) throw new Error("End date must be after start date")
      return publish(ssbClient, content)
    },

    async voteBuild(buildId, choice) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const bnode = idx.builds.get(buildId)
      if (!bnode || idx.tomb.has(buildId)) throw new Error("Build not found")
      const g = resolveGroup(idx, rootOfIdx(idx, bnode.c.facility))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      if (!g.facility.members.includes(ssbClient.id)) throw new Error("Only members can vote")
      return publish(ssbClient, { type: "industryVote", target: g.root, subject: "build", ref: buildId, choice: choice === "no" ? "no" : "yes", createdAt: new Date().toISOString() })
    },

    async setBuildStatus(buildId, status) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const bnode = idx.builds.get(buildId)
      if (!bnode || idx.tomb.has(buildId)) throw new Error("Build not found")
      const g = resolveGroup(idx, rootOfIdx(idx, bnode.c.facility))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      const build = resolveBuild(idx, buildId, g.facility)
      const next = String(status || "").toUpperCase()
      if (!BUILD_STATUSES.includes(next)) throw new Error("Invalid status")
      const allowed = BUILD_TRANSITIONS[build.status] || []
      if (!allowed.includes(next)) throw new Error(`Cannot move build from ${build.status} to ${next}`)
      if (g.facility.status !== "ACTIVE") throw new Error("Facility is not active")
      if (!g.facility.members.includes(ssbClient.id)) throw new Error("Only members of the facility can do this")
      const isSteward = g.facility.steward === ssbClient.id
      const isProposer = build.proposer === ssbClient.id
      const isReopen = build.status === "COMPLETED" || build.status === "FAILED"
      if (build.status === "COMPLETED" && build.distributed) throw new Error("A distributed build cannot be reopened")
      if ((next === "COMPLETED" || next === "FAILED" || isReopen) && !isSteward) throw new Error("Only the steward can complete, fail or reopen a build")
      if (!isSteward && !isProposer) throw new Error("Only the steward or the proposer can advance the build")
      return publish(ssbClient, { type: "industryBuildStatus", target: buildId, status: next, createdAt: new Date().toISOString() })
    },

    async contribute(buildId, data) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const bnode = idx.builds.get(buildId)
      if (!bnode || idx.tomb.has(buildId)) throw new Error("Build not found")
      const g = resolveGroup(idx, rootOfIdx(idx, bnode.c.facility))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      if (!g.facility.members.includes(ssbClient.id)) throw new Error("Only members can contribute")
      if (g.facility.status !== "ACTIVE") throw new Error("Facility is not active")
      const build = resolveBuild(idx, buildId, g.facility)
      if (!CONTRIBUTABLE.has(build.status)) throw new Error("This build is not accepting contributions")
      const kind = ["labor", "material", "eco"].includes(String(data.kind)) ? String(data.kind) : "labor"
      const content = { type: "industryContribution", target: buildId, kind, hours: nonNegNum(data.hours), item: String(data.item || "").trim(), value: nonNegNum(data.value), eco: nonNegNum(data.eco), transferId: data.transferId || null, note: String(data.note || "").trim(), createdAt: new Date().toISOString() }
      if (kind === "labor") {
        if (content.hours <= 0) throw new Error("Labor contributions require hours above zero")
        content.item = ""; content.value = 0; content.eco = 0
      } else if (kind === "material") {
        if (!content.item) throw new Error("Material contributions require an item")
        if (content.value <= 0) throw new Error("Material contributions require a value above zero")
        content.hours = 0; content.eco = 0
      } else {
        if (content.eco <= 0) throw new Error("ECO contributions require an amount above zero")
        content.hours = 0; content.item = ""; content.value = 0
      }
      return publish(ssbClient, content)
    },

    async getBuild(buildId) {
      const ssbClient = await openSsb()
      const msgs = await getAllMsgs(ssbClient)
      const idx = buildIndex(msgs)
      const bnode = idx.builds.get(buildId)
      if (!bnode || idx.tomb.has(buildId)) throw new Error("Build not found")
      const g = resolveGroup(idx, rootOfIdx(idx, bnode.c.facility))
      if (!g) throw new Error("Facility not found")
      const build = resolveBuild(idx, buildId, g.facility)
      build.facilityId = g.root
      build.facilityName = g.facility.name
      build.steward = g.facility.steward
      build.members = g.facility.members
      const est = estimateForBlueprintRef(idx, build.blueprint, g.facility.laborRate)
      if (est) Object.assign(build, est)
      Object.assign(build, buildGovernance(idx, g, buildId))
      return build
    },

    async updateBuild(buildId, data) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const bnode = idx.builds.get(buildId)
      if (!bnode || idx.tomb.has(buildId)) throw new Error("Build not found")
      const g = resolveGroup(idx, rootOfIdx(idx, bnode.c.facility))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      if (!g.facility.members.includes(ssbClient.id)) throw new Error("Only members of the facility can do this")
      const build = resolveBuild(idx, buildId, g.facility)
      const isSteward = g.facility.steward === ssbClient.id
      if (build.proposer !== ssbClient.id && !isSteward) throw new Error("Only the steward or the proposer can update a build")
      if (build.distributed) throw new Error("A distributed build cannot be updated")
      if (!actionApproved(idx, g, "buildUpdate", buildId)) throw new Error("Updating this build requires a governance vote")
      const startDate = String(data.startDate || "").trim()
      const endDate = String(data.endDate || "").trim()
      if (!startDate) throw new Error("Build start date is required")
      if (!endDate) throw new Error("Build end date is required")
      if (new Date(endDate) < new Date(startDate)) throw new Error("End date must be after start date")
      const today = new Date().toISOString().slice(0, 10)
      if (endDate < today) throw new Error("End date cannot be in the past")
      const title = data.title === undefined ? String(build.title || "") : String(data.title || "").trim()
      if (!title) throw new Error("Build title is required")
      const notes = data.notes === undefined ? String(build.notes || "") : String(data.notes || "").trim()
      return publish(ssbClient, { type: "industryBuildUpdate", target: buildId, title, notes, startDate, endDate, createdAt: new Date().toISOString() })
    },

    async deleteBuild(buildId) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const bnode = idx.builds.get(buildId)
      if (!bnode || idx.tomb.has(buildId)) throw new Error("Build not found")
      const g = resolveGroup(idx, rootOfIdx(idx, bnode.c.facility))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      if (!g.facility.members.includes(ssbClient.id)) throw new Error("Only members of the facility can do this")
      if (bnode.author !== ssbClient.id) throw new Error("Only the proposer can delete a build")
      if (!actionApproved(idx, g, "buildDelete", buildId)) throw new Error("Deleting this build requires a governance vote")
      return publish(ssbClient, { type: "tombstone", target: buildId, deletedAt: new Date().toISOString(), author: ssbClient.id })
    },

    async listBuilds(facilityId, filter = "ALL") {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const g = resolveGroup(idx, rootOfIdx(idx, facilityId))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      let list = []
      for (const [key, node] of idx.builds) {
        if (idx.tomb.has(key)) continue
        if (node.c.facility !== g.root) continue
        const b = resolveBuild(idx, key, g.facility)
        if (!b) continue
        const est = estimateForBlueprintRef(idx, b.blueprint, g.facility.laborRate)
        list.push({ ...b, ...(est || {}), ...buildGovernance(idx, g, key) })
      }
      const f = String(filter || "ALL").toUpperCase()
      if (BUILD_STATUSES.includes(f)) list = list.filter(x => x.status === f)
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      return list
    },

    async listAllBlueprints() {
      const ssbClient = await openSsb()
      const msgs = await getAllMsgs(ssbClient)
      const idx = buildIndex(msgs)
      const roots = new Set()
      for (const key of idx.blueprints.keys()) roots.add(rootOfBlueprint(idx, key))
      const facCache = new Map()
      const list = []
      for (const root of roots) {
        const b = resolveBlueprint(idx, root)
        if (!b || b.tombstoned) continue
        const facRoot = rootOfIdx(idx, b.blueprint.facility)
        let g = facCache.get(facRoot)
        if (g === undefined) { g = resolveGroup(idx, facRoot); facCache.set(facRoot, g) }
        if (!g || g.tombstoned) continue
        list.push({ ...b.blueprint, facilityId: g.root, facilityName: g.facility.name, members: g.facility.members, ...estimateBlueprint(b.blueprint, g.facility.laborRate), ...blueprintGovernance(idx, g, b.root) })
      }
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      return list
    },

    async listAllBuilds() {
      const ssbClient = await openSsb()
      const msgs = await getAllMsgs(ssbClient)
      const idx = buildIndex(msgs)
      const facCache = new Map()
      const list = []
      for (const [key, node] of idx.builds) {
        if (idx.tomb.has(key)) continue
        const facRoot = rootOfIdx(idx, node.c.facility)
        let g = facCache.get(facRoot)
        if (g === undefined) { g = resolveGroup(idx, facRoot); facCache.set(facRoot, g) }
        if (!g || g.tombstoned) continue
        const b = resolveBuild(idx, key, g.facility)
        if (!b) continue
        const est = estimateForBlueprintRef(idx, b.blueprint, g.facility.laborRate)
        list.push({ ...b, facilityId: g.root, facilityName: g.facility.name, members: g.facility.members, ...(est || {}), ...buildGovernance(idx, g, key) })
      }
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      return list
    },

    computeDistributionPlan(build, outputValue) {
      const pot = nonNegNum(build.treasury) + nonNegNum(outputValue)
      const distributable = pot
      const allocations = []
      const amounts = {}
      for (const [uid, share] of Object.entries(build.shares || {})) {
        const amount = distributable * share
        amounts[uid] = amount
        if (amount > 0) allocations.push({ to: uid, amount, share })
      }
      return { pot, distributable, allocations, amounts }
    },

    async distributeBuild(buildId, data) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await getAllMsgs(ssbClient))
      const bnode = idx.builds.get(buildId)
      if (!bnode || idx.tomb.has(buildId)) throw new Error("Build not found")
      const g = resolveGroup(idx, rootOfIdx(idx, bnode.c.facility))
      if (!g || g.tombstoned) throw new Error("Facility not found")
      if (g.facility.steward !== ssbClient.id) throw new Error("Only the steward can distribute")
      const build = resolveBuild(idx, buildId, g.facility)
      if (build.status !== "COMPLETED") throw new Error("Only a completed build can be distributed")
      if (build.distributed) throw new Error("This build has already been distributed")
      if (build.totalPoints <= 0) throw new Error("There are no contributions to distribute")
      const plan = this.computeDistributionPlan(build, data && data.outputValue)
      const content = { type: "industryAllocation", target: buildId, shares: build.shares, amounts: plan.amounts, pot: plan.pot, outputValue: nonNegNum(data && data.outputValue), disposition: (data && data.disposition) || null, createdAt: new Date().toISOString() }
      await publish(ssbClient, content)
      return { plan, facility: g.facility, build }
    }
  }
}
