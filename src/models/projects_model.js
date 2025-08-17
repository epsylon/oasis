const pull = require('../server/node_modules/pull-stream')
const moment = require('../server/node_modules/moment')
const { getConfig } = require('../configs/config-manager.js')
const logLimit = getConfig().ssbLogStream?.limit || 1000

module.exports = ({ cooler }) => {
  let ssb
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open()
    return ssb
  }

  const TYPE = 'project'
  const clampPercent = n => Math.max(0, Math.min(100, parseInt(n,10) || 0))

  async function getAllMsgs(ssbClient) {
    return new Promise((r, j) => {
      pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((e, m) => e ? j(e) : r(m)))
    })
  }

  function normalizeMilestonesFrom(data) {
    if (Array.isArray(data.milestones)) {
      return data.milestones.map(m => ({
        title: String(m.title || '').trim(),
        description: m.description || '',
        targetPercent: clampPercent(m.targetPercent || 0),
        dueDate: m.dueDate ? new Date(m.dueDate).toISOString() : null,
        done: !!m.done
      })).filter(m => m.title)
    }
    const title = String((data['milestones[0][title]'] || data.milestoneTitle || '')).trim()
    const description = data['milestones[0][description]'] || data.milestoneDescription || ''
    const tpRaw = (data['milestones[0][targetPercent]'] ?? data.milestoneTargetPercent) ?? 0
    const targetPercent = clampPercent(tpRaw)
    const dueRaw = data['milestones[0][dueDate]'] || data.milestoneDueDate || null
    const dueDate = dueRaw ? new Date(dueRaw).toISOString() : null
    const out = []
    if (title) out.push({ title, description, targetPercent, dueDate, done: false })
    return out
  }

  function autoCompleteMilestoneIfReady(projectLike, milestoneIdx, clampPercentFn) {
    if (milestoneIdx == null) {
      return { milestones: projectLike.milestones || [], progress: projectLike.progress || 0, changed: false }
    }
    const milestones = Array.isArray(projectLike.milestones) ? projectLike.milestones.slice() : []
    if (!milestones[milestoneIdx]) {
      return { milestones, progress: projectLike.progress || 0, changed: false }
    }
    const bounties = Array.isArray(projectLike.bounties) ? projectLike.bounties : []
    const related = bounties.filter(b => b.milestoneIndex === milestoneIdx)
    if (related.length === 0) {
      return { milestones, progress: projectLike.progress || 0, changed: false }
    }
    const allDone = related.every(b => !!b.done)
    let progress = projectLike.progress || 0
    let changed = false
    if (allDone && !milestones[milestoneIdx].done) {
      milestones[milestoneIdx].done = true
      const target = clampPercentFn(milestones[milestoneIdx].targetPercent || 0)
      progress = Math.max(parseInt(progress, 10) || 0, target)
      changed = true
    }
    return { milestones, progress, changed }
  }

  async function resolveTipId(id) {
    const ssbClient = await openSsb()
    const all = await getAllMsgs(ssbClient)
    const tomb = new Set()
    const replaces = new Map()
    all.forEach(m => {
      const c = m.value.content
      if (!c) return
      if (c.type === 'tombstone' && c.target) tomb.add(c.target)
      else if (c.type === TYPE && c.replaces) replaces.set(c.replaces, m.key)
    })
    let key = id
    while (replaces.has(key)) key = replaces.get(key)
    if (tomb.has(key)) throw new Error('Project not found')
    return key
  }

  async function getById(id) {
    const ssbClient = await openSsb()
    const tip = await resolveTipId(id)
    const msg = await new Promise((r, j) => ssbClient.get(tip, (e, m) => e ? j(e) : r(m)))
    if (!msg) throw new Error('Project not found')
    return { id: tip, ...msg.content }
  }

  function extractBlobId(possibleMarkdownImage) {
    let blobId = possibleMarkdownImage
    if (blobId && /\(([^)]+)\)/.test(blobId)) blobId = blobId.match(/\(([^)]+)\)/)[1]
    return blobId
  }

  function safeMilestoneIndex(project, idx) {
    const total = Array.isArray(project.milestones) ? project.milestones.length : 0
    if (idx === null || idx === undefined || idx === '' || isNaN(idx)) return null
    const n = parseInt(idx, 10)
    if (n < 0 || n >= total) return null
    return n
  }

  return {
    type: TYPE,

    async createProject(data) {
      const ssbClient = await openSsb()
      const blobId = extractBlobId(data.image)
      const milestones = normalizeMilestonesFrom(data)
      const content = {
        type: TYPE,
        title: data.title,
        description: data.description,
        image: blobId || null,
        goal: parseFloat(data.goal || 0) || 0,
        pledged: parseFloat(data.pledged || 0) || 0,
        deadline: data.deadline || null,
        progress: clampPercent(data.progress || 0),
        status: (data.status || 'ACTIVE').toUpperCase(),
        milestones,
        bounties: Array.isArray(data.bounties)
          ? data.bounties.map(b => ({
              title: String(b.title || '').trim(),
              amount: Math.max(0, parseFloat(b.amount || 0) || 0),
              description: b.description || '',
              claimedBy: b.claimedBy || null,
              done: !!b.done,
              milestoneIndex: b.milestoneIndex != null ? parseInt(b.milestoneIndex,10) : null
            }))
          : [],
        followers: [],
        backers: [],
        author: ssbClient.id,
        createdAt: new Date().toISOString(),
        updatedAt: null
      }
      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => e ? rej(e) : res(m)))
    },

    async updateProject(id, patch) {
      const ssbClient = await openSsb()
      const current = await getById(id)
      if (current.author !== ssbClient.id) throw new Error('Unauthorized')

      let blobId = (patch.image === undefined ? current.image : patch.image)
      blobId = extractBlobId(blobId)

      let bounties = patch.bounties === undefined ? current.bounties : patch.bounties
      if (bounties) {
        bounties = bounties.map(b => ({
          title: String(b.title || '').trim(),
          amount: Math.max(0, parseFloat(b.amount || 0) || 0),
          description: b.description || '',
          claimedBy: b.claimedBy || null,
          done: !!b.done,
          milestoneIndex: b.milestoneIndex != null ? safeMilestoneIndex(current, b.milestoneIndex) : null
        }))
      }
      const tomb = { type: 'tombstone', target: current.id, deletedAt: new Date().toISOString(), author: ssbClient.id }
      const updated = {
        type: TYPE,
        ...current,
        ...patch,
        image: blobId || null,
        bounties,
        updatedAt: new Date().toISOString(),
        replaces: current.id
      }
      await new Promise((res, rej) => ssbClient.publish(tomb, e => e ? rej(e) : res()))
      return new Promise((res, rej) => ssbClient.publish(updated, (e, m) => e ? rej(e) : res(m)))
    },

    async deleteProject(id) {
      const ssbClient = await openSsb()
      const tip = await resolveTipId(id)
      const project = await getById(tip)
      if (project.author !== ssbClient.id) throw new Error('Unauthorized')
      const tomb = { type: 'tombstone', target: tip, deletedAt: new Date().toISOString(), author: ssbClient.id }
      return new Promise((res, rej) => ssbClient.publish(tomb, (e, r) => e ? rej(e) : res(r)))
    },

    async updateProjectStatus(id, status) {
      return this.updateProject(id, { status: String(status || '').toUpperCase() })
    },

    async updateProjectProgress(id, progress) {
      const p = clampPercent(progress)
      return this.updateProject(id, { progress: p, status: p >= 100 ? 'COMPLETED' : undefined })
    },
    
    async getProjectById(id) {
      const project = await projectsModel.getById(id);
      project.backers = project.backers || [];
      const bakers = project.backers.map(b => ({
        userId: b.userId,
        amount: b.amount,
        contributedAt: moment(b.at).format('YYYY/MM/DD')
      }));
      return { ...project, bakers };
    },
    
    async updateProjectGoalProgress(projectId, pledgeAmount) {
     const project = await projectsModel.getById(projectId);
     project.pledged += pledgeAmount;
     const goalProgress = (project.pledged / project.goal) * 100;
     await projectsModel.updateProject(projectId, { pledged: project.pledged, progress: goalProgress });
    },

    async followProject(id, userId) {
      const tip = await this.getProjectTipId(id)
      const project = await this.getProjectById(tip)
      const followers = Array.isArray(project.followers) ? project.followers.slice() : []
      if (!followers.includes(userId)) followers.push(userId)
      return this.updateProject(tip, { followers })
    },

    async unfollowProject(id, userId) {
      const tip = await this.getProjectTipId(id)
      const project = await this.getProjectById(tip)
      const followers = (project.followers || []).filter(uid => uid !== userId)
      return this.updateProject(tip, { followers })
    },

    async pledgeToProject(id, userId, amount) {
      openSsb().then(ssbClient => {
        const tip = getProjectTipId(id);
        getProjectById(tip).then(project => {
          const amt = Math.max(0, parseFloat(amount || 0) || 0);
          if (amt <= 0) throw new Error('Invalid amount');     
          const backers = Array.isArray(project.backers) ? project.backers.slice() : [];
          backers.push({ userId, amount: amt, at: new Date().toISOString() });    
          const pledged = (parseFloat(project.pledged || 0) || 0) + amt;  
          updateProject(tip, { backers, pledged }).then(updated => {
            if (project.author == userId) {
              const recipients = [project.author];
              const content = {
               type: 'post',
               from: ssbClient.id,
               to: recipients,
               subject: 'PROJECT_PLEDGE',
               text: `${userId} has pledged ${amt} ECO to your project "${project.title}" /projects/${encodeURIComponent(tip)}`,
               sentAt: new Date().toISOString(),
               private: true,
               meta: {
                 type: 'project-pledge',
                 projectId: tip,
                 projectTitle: project.title,
                 amount: amt,
                 pledgedBy: userId
               }
             };
             ssbClient.private.publish(content, recipients);
            }
           return updated;
          });
        });
     });
    },

    async addBounty(id, bounty) {
      const tip = await this.getProjectTipId(id)
      const project = await this.getProjectById(tip)
      const bounties = Array.isArray(project.bounties) ? project.bounties.slice() : []
      const clean = {
        title: String(bounty.title || '').trim(),
        amount: Math.max(0, parseFloat(bounty.amount || 0) || 0),
        description: bounty.description || '',
        claimedBy: null,
        done: false,
        milestoneIndex: safeMilestoneIndex(project, bounty.milestoneIndex)
      }
      bounties.push(clean)
      return this.updateProject(tip, { bounties })
    },

    async updateBounty(id, index, patch) {
      const tip = await this.getProjectTipId(id)
      const project = await this.getProjectById(tip)
      const bounties = Array.isArray(project.bounties) ? project.bounties.slice() : []
      if (!bounties[index]) throw new Error('Bounty not found')
      if (patch.title !== undefined) bounties[index].title = String(patch.title).trim()
      if (patch.amount !== undefined) bounties[index].amount = Math.max(0, parseFloat(patch.amount || 0) || 0)
      if (patch.description !== undefined) bounties[index].description = patch.description || ''
      if (patch.milestoneIndex !== undefined) {
        const newIdx = patch.milestoneIndex == null ? null : parseInt(patch.milestoneIndex, 10)
        bounties[index].milestoneIndex = (newIdx == null) ? null : (isNaN(newIdx) ? null : newIdx)
      }
      if (patch.done !== undefined) bounties[index].done = !!patch.done
      let autoPatch = {}
      if (bounties[index].milestoneIndex != null) {
        const { milestones, progress, changed } =
          autoCompleteMilestoneIfReady({ ...project, bounties }, bounties[index].milestoneIndex, clampPercent)
        if (changed) {
          autoPatch.milestones = milestones
          autoPatch.progress = progress
          if (progress >= 100) autoPatch.status = 'COMPLETED'
        }
      }
      return this.updateProject(tip, { bounties, ...autoPatch })
    },

    async updateMilestone(id, index, patch) {
      const tip = await this.getProjectTipId(id)
      const project = await this.getProjectById(tip)
      const milestones = Array.isArray(project.milestones) ? project.milestones.slice() : []
      if (!milestones[index]) throw new Error('Milestone not found')
      if (patch.title !== undefined) milestones[index].title = String(patch.title).trim()
      if (patch.targetPercent !== undefined) milestones[index].targetPercent = clampPercent(patch.targetPercent)
      if (patch.dueDate !== undefined) milestones[index].dueDate = patch.dueDate ? new Date(patch.dueDate).toISOString() : null
      let progress = project.progress
      if (patch.done !== undefined) {
        milestones[index].done = !!patch.done
        if (milestones[index].done) {
          const target = clampPercent(milestones[index].targetPercent || 0)
          progress = Math.max(parseInt(project.progress || 0, 10) || 0, target)
        }
      }
      const patchOut = { milestones }
      if (progress !== project.progress) {
        patchOut.progress = progress
        if (progress >= 100) patchOut.status = 'COMPLETED'
      }
      return this.updateProject(tip, patchOut)
    },

    async claimBounty(id, index, userId) {
      const tip = await this.getProjectTipId(id)
      const project = await this.getProjectById(tip)
      const bounties = Array.isArray(project.bounties) ? project.bounties.slice() : []
      if (!bounties[index]) throw new Error('Bounty not found')
      if (bounties[index].claimedBy) throw new Error('Already claimed')
      bounties[index].claimedBy = userId
      return this.updateProject(tip, { bounties })
    },

    async completeBounty(id, index, userId) {
      const tip = await this.getProjectTipId(id)
      const project = await this.getProjectById(tip)
      if (project.author !== userId) throw new Error('Unauthorized')
      const bounties = Array.isArray(project.bounties) ? project.bounties.slice() : []
      if (!bounties[index]) throw new Error('Bounty not found')
      bounties[index].done = true
      const { milestones, progress, changed } =
        autoCompleteMilestoneIfReady({ ...project, bounties }, bounties[index].milestoneIndex, clampPercent)
      const patch = { bounties }
      if (changed) {
        patch.milestones = milestones
        patch.progress = progress
        if (progress >= 100) patch.status = 'COMPLETED'
      }
      return this.updateProject(tip, patch)
    },
    
    async addMilestone(id, milestone) {
      const tip = await this.getProjectTipId(id)
      const project = await this.getProjectById(tip)
      const milestones = Array.isArray(project.milestones) ? project.milestones.slice() : []
      const clean = {
        title: String(milestone.title || '').trim(),
        description: milestone.description || '',
        targetPercent: clampPercent(milestone.targetPercent || 0),
        dueDate: milestone.dueDate ? new Date(milestone.dueDate).toISOString() : null,
        done: false
      }
      if (!clean.title) throw new Error('Milestone title required')
      milestones.push(clean)
      return this.updateProject(tip, { milestones })
    },

    async completeMilestone(id, index, userId) {
      const tip = await this.getProjectTipId(id)
      const project = await this.getProjectById(tip)
      if (project.author !== userId) throw new Error('Unauthorized')
      const milestones = Array.isArray(project.milestones) ? project.milestones.slice() : []
      if (!milestones[index]) throw new Error('Milestone not found')
      milestones[index].done = true
      const target = clampPercent(milestones[index].targetPercent || 0)
      const progress = Math.max(parseInt(project.progress || 0, 10) || 0, target)
      const patch = { milestones, progress }
      if (progress >= 100) patch.status = 'COMPLETED'
      return this.updateProject(tip, patch)
    },

    async listProjects(filter) {
      const ssbClient = await openSsb()
      const currentUserId = ssbClient.id
      return new Promise((res, rej) => {
        pull(
          ssbClient.createLogStream({ limit: logLimit }),
          pull.collect((e, msgs) => {
            if (e) return rej(e)
            const tomb = new Set()
            const replaces = new Map()
            const referencedAsReplaces = new Set()
            const projects = new Map()
            msgs.forEach(m => {
              const k = m.key
              const c = m.value.content
              if (!c) return
              if (c.type === 'tombstone' && c.target) { tomb.add(c.target); return }
              if (c.type !== TYPE) return
              if (c.replaces) { replaces.set(c.replaces, k); referencedAsReplaces.add(c.replaces) }
              projects.set(k, { key: k, content: c })
            })
            const tipProjects = []
            for (const [id, pr] of projects.entries()) if (!referencedAsReplaces.has(id)) tipProjects.push(pr)
            const groups = {}
            for (const pr of tipProjects) {
              const ancestor = pr.content.replaces || pr.key
              if (!groups[ancestor]) groups[ancestor] = []
              groups[ancestor].push(pr)
            }
            const liveTipIds = new Set()
            for (const group of Object.values(groups)) {
              let best = group[0]
              for (const pr of group) {
                const bestTime = new Date(best.content.updatedAt || best.content.createdAt || 0)
                const prTime = new Date(pr.content.updatedAt || pr.content.createdAt || 0)
                if (
                  (best.content.status === 'CANCELLED' && pr.content.status !== 'CANCELLED') ||
                  (best.content.status === pr.content.status && prTime > bestTime) ||
                  pr.content.status === 'COMPLETED'
                ) best = pr
              }
              liveTipIds.add(best.key)
            }
            let list = Array.from(projects.values())
              .filter(p => liveTipIds.has(p.key) && !tomb.has(p.key))
              .map(p => ({ id: p.key, ...p.content }))
            const F = String(filter || 'ALL').toUpperCase()
            if (F === 'MINE') list = list.filter(p => p.author === currentUserId)
            else if (F === 'ACTIVE') list = list.filter(p => (p.status || '').toUpperCase() === 'ACTIVE')
            else if (F === 'COMPLETED') list = list.filter(p => (p.status || '').toUpperCase() === 'COMPLETED')
            else if (F === 'PAUSED') list = list.filter(p => (p.status || '').toUpperCase() === 'PAUSED')
            else if (F === 'CANCELLED') list = list.filter(p => (p.status || '').toUpperCase() === 'CANCELLED')
            else if (F === 'RECENT') list = list.filter(p => moment(p.createdAt).isAfter(moment().subtract(24, 'hours')))
            else if (F === 'FOLLOWING') list = list.filter(p => Array.isArray(p.followers) && p.followers.includes(currentUserId))
            if (F === 'TOP') list.sort((a, b) => (parseFloat(b.pledged||0)/(parseFloat(b.goal||1))) - (parseFloat(a.pledged||0)/(parseFloat(a.goal||1))))
            else list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            res(list)
          })
        )
      })
    },

    async getProjectById(id) { return getById(id) },
    async getProjectTipId(id) { return resolveTipId(id) }
  }
}

