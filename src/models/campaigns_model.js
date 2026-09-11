const { readTyped } = require('./typed_log');
const categories = require('../backend/opinion_categories');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const CAMPAIGN_TYPE = 'campaign';
const SIGNATURE_TYPE = 'campaignSignature';
const UPDATE_TYPE = 'campaignUpdate';
const OPINION_TYPE = 'campaignOpinion';
const PROPOSAL_TYPE = 'parliamentProposal';
const TYPES = [CAMPAIGN_TYPE, SIGNATURE_TYPE, UPDATE_TYPE, OPINION_TYPE, PROPOSAL_TYPE, 'tombstone'];
const CATEGORIES = ['ENVIRONMENT', 'RIGHTS', 'HEALTH', 'EDUCATION', 'INFRASTRUCTURE', 'CULTURE', 'ECONOMY', 'OTHER'];
const STATUSES = ['OPEN', 'ACHIEVED', 'CLOSED'];
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

const safeText = (v) => String(v == null ? '' : v).trim();
const normU = (v) => String(v || '').trim().toUpperCase();
const normalizeCategory = (v) => (CATEGORIES.includes(normU(v)) ? normU(v) : 'OTHER');
const normalizeTags = (raw) => {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(',');
  return Array.from(new Set(arr.map(t => String(t || '').trim()).filter(Boolean)));
};
const toIso = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString() : ''; };
const MEDIA_RE = /!?\[(image|video):[^\]]*\]\((&[^)]+)\)/;
const mediaOf = (text) => { const m = safeText(text).match(MEDIA_RE); return m ? { kind: m[1], blobId: m[2] } : null; };
const goalOf = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };
  const publish = (ssbClient, content) => new Promise((resolve, reject) => ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res)));

  const buildIndex = (messages) => {
    const tomb = buildValidatedTombstoneSet(messages);
    const nodes = new Map();
    const parentOf = new Map();
    const signatures = [];
    const updates = [];
    const opinions = [];
    const proposalByCampaign = new Map();
    for (const m of messages) {
      const v = m.value || {};
      const c = v.content;
      if (!c || typeof c !== 'object') continue;
      if (c.type === CAMPAIGN_TYPE) {
        nodes.set(m.key, { key: m.key, author: v.author, ts: v.timestamp || m.timestamp || 0, c });
        if (typeof c.replaces === 'string') parentOf.set(m.key, c.replaces);
      } else if (c.type === SIGNATURE_TYPE && typeof c.target === 'string') {
        signatures.push({ key: m.key, target: c.target, author: v.author, ts: v.timestamp || 0, text: safeText(c.text), createdAt: c.createdAt || new Date(v.timestamp || 0).toISOString() });
      } else if (c.type === PROPOSAL_TYPE) {
        const legacy = typeof c.campaignId === 'string' && c.campaignId ? null : String(c.description || '').match(/signatures: \/campaigns\/(%[^\s]+\.sha256)\s*$/);
        const ref = typeof c.campaignId === 'string' && c.campaignId ? c.campaignId : (legacy ? legacy[1] : '');
        if (ref && !proposalByCampaign.has(ref)) proposalByCampaign.set(ref, m.key);
      } else if (c.type === OPINION_TYPE && typeof c.target === 'string') {
        opinions.push({ target: c.target, author: v.author, category: String(c.category || ''), ts: v.timestamp || 0 });
      } else if (c.type === UPDATE_TYPE && typeof c.target === 'string') {
        updates.push({ key: m.key, target: c.target, author: v.author, ts: v.timestamp || 0, text: safeText(c.text), createdAt: c.createdAt || new Date(v.timestamp || 0).toISOString(), replaces: typeof c.replaces === 'string' ? c.replaces : null });
      }
    }
    const updateParent = new Map(updates.filter(u => u.replaces).map(u => [u.key, u.replaces]));
    const updateRootOf = (key) => {
      const seen = new Set();
      let cur = key;
      while (updateParent.has(cur) && !seen.has(cur)) { seen.add(cur); cur = updateParent.get(cur); }
      return cur;
    };
    const updateVersions = new Map();
    for (const u of updates) {
      const uroot = updateRootOf(u.key);
      if (tomb.has(uroot)) continue;
      if (!updateVersions.has(uroot)) updateVersions.set(uroot, []);
      updateVersions.get(uroot).push(u);
    }
    const updateItems = [];
    for (const [uroot, versions] of updateVersions) {
      versions.sort((a, b) => a.ts - b.ts);
      const first = versions[0];
      const own = versions.filter(v => v.author === first.author);
      const tip = own[own.length - 1];
      updateItems.push({ id: uroot, key: uroot, tipId: tip.key, target: first.target, author: first.author, ts: first.ts, text: tip.text, createdAt: first.createdAt, updatedAt: tip.createdAt, edited: tip.key !== uroot });
    }
    const rootOf = (key) => {
      const seen = new Set();
      let cur = key;
      while (parentOf.has(cur) && !seen.has(cur)) { seen.add(cur); cur = parentOf.get(cur); }
      return cur;
    };
    const versionsByRoot = new Map();
    for (const node of nodes.values()) {
      const root = rootOf(node.key);
      if (tomb.has(root)) continue;
      if (!versionsByRoot.has(root)) versionsByRoot.set(root, []);
      versionsByRoot.get(root).push(node);
    }
    const sigByRoot = new Map();
    for (const s of signatures) {
      if (!nodes.has(s.target)) continue;
      const r = rootOf(s.target);
      if (!sigByRoot.has(r)) sigByRoot.set(r, new Map());
      const prev = sigByRoot.get(r).get(s.author);
      if (!prev || s.ts < prev.ts) sigByRoot.get(r).set(s.author, s);
    }
    const opinionsByRoot = new Map();
    for (const op of opinions) {
      if (!nodes.has(op.target)) continue;
      const r = rootOf(op.target);
      if (!opinionsByRoot.has(r)) opinionsByRoot.set(r, []);
      opinionsByRoot.get(r).push(op);
    }
    const campaigns = new Map();
    const now = Date.now();
    for (const [root, versions] of versionsByRoot) {
      versions.sort((a, b) => a.ts - b.ts);
      const first = versions[0];
      const own = versions.filter(v => v.author === first.author);
      const tip = own[own.length - 1];
      const c = tip.c;
      const sigs = Array.from((sigByRoot.get(root) || new Map()).values()).sort((a, b) => a.ts - b.ts);
      const goal = goalOf(c.goal);
      const deadline = toIso(c.deadline);
      const deadlineTs = Date.parse(deadline) || 0;
      const expired = !!deadlineTs && deadlineTs < now;
      const achieved = goal > 0 && sigs.length >= goal;
      const manual = normU(c.status) === 'CLOSED';
      const status = manual ? 'CLOSED' : (achieved ? 'ACHIEVED' : (expired ? 'CLOSED' : 'OPEN'));
      const thread = updateItems.filter(u => nodes.has(u.target) && rootOf(u.target) === root && u.author === first.author).sort((a, b) => a.ts - b.ts);
      const ops = {};
      const voters = [];
      for (const op of (opinionsByRoot.get(root) || []).sort((a, b) => a.ts - b.ts)) {
        if (voters.includes(op.author) || !categories.includes(op.category)) continue;
        voters.push(op.author);
        ops[op.category] = (ops[op.category] || 0) + 1;
      }
      campaigns.set(root, {
        id: root, rootId: root, tipId: tip.key,
        title: safeText(c.title), text: safeText(c.text), media: mediaOf(c.text), category: normalizeCategory(c.category),
        goal, deadline, deadlineTs, expired, tags: normalizeTags(c.tags), mapUrl: safeText(c.mapUrl),
        status, achieved, closed: status === 'CLOSED', proposalId: safeText(c.proposalId) || proposalByCampaign.get(root) || '',
        author: first.author, createdAt: first.c.createdAt || new Date(first.ts).toISOString(),
        updatedAt: c.updatedAt || new Date(tip.ts).toISOString(), ts: tip.ts,
        signatures: sigs, signatureCount: sigs.length, signers: sigs.map(s => s.author),
        progress: goal > 0 ? Math.min(100, Math.round((sigs.length / goal) * 100)) : 0,
        updates: thread,
        opinions: ops, opinions_inhabitants: voters, opinionCount: voters.length,
        lastActivityTs: Math.max(tip.ts, ...sigs.map(s => s.ts), ...thread.map(u => u.ts))
      });
    }
    return { campaigns, rootOf, nodes, updatesById: new Map(updateItems.map(u => [u.id, u])), updateRootOf };
  };

  const load = async () => {
    const ssbClient = await openSsb();
    const idx = buildIndex(await readTyped(ssbClient, TYPES, { limit: logLimit }));
    return { ssbClient, idx };
  };

  const find = (idx, id) => {
    const key = String(id || '');
    if (idx.campaigns.has(key)) return idx.campaigns.get(key);
    if (idx.nodes.has(key)) return idx.campaigns.get(idx.rootOf(key)) || null;
    return null;
  };

  const decorate = (cp, me) => ({
    ...cp,
    isOwner: cp.author === me,
    signed: cp.signers.includes(me),
    canSign: !cp.closed && !cp.signers.includes(me),
    canElevate: cp.author === me && cp.achieved && !cp.proposalId
  });

  const versionOf = (cp, me, data = {}) => ({
    type: CAMPAIGN_TYPE,
    title: safeText(data.title) || cp.title,
    text: data.text !== undefined ? safeText(data.text) : cp.text,
    category: data.category !== undefined ? normalizeCategory(data.category) : cp.category,
    goal: data.goal !== undefined && goalOf(data.goal) ? goalOf(data.goal) : cp.goal,
    deadline: data.deadline !== undefined ? toIso(data.deadline) : cp.deadline,
    tags: data.tags !== undefined ? normalizeTags(data.tags) : cp.tags,
    mapUrl: data.mapUrl !== undefined ? safeText(data.mapUrl) : cp.mapUrl,
    status: data.status !== undefined ? (normU(data.status) === 'CLOSED' ? 'CLOSED' : 'OPEN') : (cp.status === 'CLOSED' && !cp.expired ? 'CLOSED' : 'OPEN'),
    proposalId: data.proposalId !== undefined ? safeText(data.proposalId) : cp.proposalId,
    author: me,
    createdAt: cp.createdAt,
    updatedAt: new Date().toISOString(),
    replaces: cp.tipId
  });

  return {
    CATEGORIES,
    STATUSES,

    async createCampaign({ title, text, category, goal, deadline, tags, mapUrl }) {
      const ssbClient = await openSsb();
      const t = safeText(title);
      if (!t) throw new Error('Title is required');
      const g = goalOf(goal);
      if (!g) throw new Error('A signature goal is required');
      const now = new Date().toISOString();
      return publish(ssbClient, {
        type: CAMPAIGN_TYPE, title: t, text: safeText(text), category: normalizeCategory(category), goal: g,
        deadline: toIso(deadline), tags: normalizeTags(tags), mapUrl: safeText(mapUrl), status: 'OPEN',
        author: ssbClient.id, createdAt: now, updatedAt: now
      });
    },

    async updateCampaign(id, data = {}) {
      const { ssbClient, idx } = await load();
      const cp = find(idx, id);
      if (!cp) throw new Error('Campaign not found');
      if (cp.author !== ssbClient.id) throw new Error('Only the promoter can update this campaign');
      const res = await publish(ssbClient, versionOf(cp, ssbClient.id, data));
      return { key: res.key, rootId: cp.id };
    },

    async closeCampaign(id) { return this.updateCampaign(id, { status: 'CLOSED' }); },
    async reopenCampaign(id) { return this.updateCampaign(id, { status: 'OPEN' }); },

    async deleteCampaign(id) {
      const { ssbClient, idx } = await load();
      const cp = find(idx, id);
      if (!cp) throw new Error('Campaign not found');
      if (cp.author !== ssbClient.id) throw new Error('Only the promoter can delete this campaign');
      await publish(ssbClient, { type: 'tombstone', target: cp.id, deletedAt: new Date().toISOString(), author: ssbClient.id });
      return { key: cp.id };
    },

    async sign(id, text = '') {
      const { ssbClient, idx } = await load();
      const cp = find(idx, id);
      if (!cp) throw new Error('Campaign not found');
      if (cp.closed) throw new Error('This campaign is closed');
      if (cp.signers.includes(ssbClient.id)) throw new Error('You already signed this campaign');
      return publish(ssbClient, { type: SIGNATURE_TYPE, target: cp.id, text: safeText(text).slice(0, 500), createdAt: new Date().toISOString() });
    },

    async addUpdate(id, text) {
      const { ssbClient, idx } = await load();
      const cp = find(idx, id);
      if (!cp) throw new Error('Campaign not found');
      if (cp.author !== ssbClient.id) throw new Error('Only the promoter can post updates');
      const body = safeText(text);
      if (!body) throw new Error('Text is required');
      return publish(ssbClient, { type: UPDATE_TYPE, target: cp.id, text: body, createdAt: new Date().toISOString() });
    },

    async editUpdate(updateId, text) {
      const { ssbClient, idx } = await load();
      const update = idx.updatesById.get(idx.updateRootOf(String(updateId || '')));
      if (!update) throw new Error('Update not found');
      if (String(update.author) !== String(ssbClient.id)) throw new Error('Only the promoter can edit an update');
      const body = safeText(text);
      if (!body) throw new Error('Text is required');
      const res = await publish(ssbClient, { type: UPDATE_TYPE, target: update.target, text: body, createdAt: new Date().toISOString(), replaces: update.tipId });
      return { key: res.key, rootId: update.id, campaignId: update.target };
    },

    async deleteUpdate(updateId) {
      const { ssbClient, idx } = await load();
      const update = idx.updatesById.get(idx.updateRootOf(String(updateId || '')));
      if (!update) throw new Error('Update not found');
      if (String(update.author) !== String(ssbClient.id)) throw new Error('Only the promoter can delete an update');
      await publish(ssbClient, { type: 'tombstone', target: update.id, deletedAt: new Date().toISOString(), author: ssbClient.id });
      return { key: update.id, campaignId: update.target };
    },

    async createOpinion(id, category) {
      if (!categories.includes(category)) throw new Error('Invalid voting category');
      const { ssbClient, idx } = await load();
      const cp = find(idx, id);
      if (!cp) throw new Error('Campaign not found');
      if (cp.opinions_inhabitants.includes(ssbClient.id)) throw new Error('Already voted');
      return publish(ssbClient, { type: OPINION_TYPE, target: cp.id, category, createdAt: new Date().toISOString() });
    },

    async recordProposal(id, proposalId) {
      return this.updateCampaign(id, { proposalId: safeText(proposalId) });
    },

    async getCampaignById(id, viewerId = null) {
      const { ssbClient, idx } = await load();
      const cp = find(idx, id);
      return cp ? decorate(cp, viewerId || ssbClient.id) : null;
    },

    async listAll({ filter = 'all', q = '', viewerId = null } = {}) {
      const { ssbClient, idx } = await load();
      const me = viewerId || ssbClient.id;
      const f = String(filter || 'all').toLowerCase();
      const needle = String(q || '').trim().toLowerCase();
      let out = Array.from(idx.campaigns.values()).map(cp => decorate(cp, me));
      if (f === 'mine') out = out.filter(cp => cp.isOwner);
      else if (f === 'signed') out = out.filter(cp => cp.signed);
      else if (f === 'recent') out = out.filter(cp => cp.lastActivityTs >= Date.now() - RECENT_MS);
      else if (f === 'top') out = out.filter(cp => cp.signatureCount > 0);
      else if (STATUSES.includes(f.toUpperCase())) out = out.filter(cp => cp.status === f.toUpperCase());
      else if (CATEGORIES.includes(f.toUpperCase())) out = out.filter(cp => cp.category === f.toUpperCase());
      if (needle) out = out.filter(cp => [cp.title, cp.text, cp.category, ...cp.tags].some(v => String(v || '').toLowerCase().includes(needle)));
      if (f === 'top') out.sort((a, b) => b.signatureCount - a.signatureCount || b.lastActivityTs - a.lastActivityTs);
      else out.sort((a, b) => b.lastActivityTs - a.lastActivityTs);
      return out;
    },

    async resolveRootId(id) {
      const { idx } = await load();
      const cp = find(idx, id);
      return cp ? cp.id : String(id || '');
    }
  };
};
