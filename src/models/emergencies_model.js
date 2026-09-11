const { readTyped } = require('./typed_log');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const EMERGENCY_TYPES = ['emergency', 'emergencyConfirm', 'emergencyUpdate', 'tombstone'];
const CATEGORIES = ['WEATHER', 'INFRASTRUCTURE', 'HEALTH', 'SECURITY', 'LOST', 'NEIGHBORHOOD'];
const SEVERITY_THRESHOLDS = { LOW: 2, MEDIUM: 5, HIGH: 10 };
const EXPIRES_OPTIONS = { '1d': 1, '3d': 3, '7d': 7, '30d': 30 };
const MEDIA_RE = /!?\[(image|video):[^\]]*\]\((&[^)]+)\)/;
const RECENT_MS = 24 * 60 * 60 * 1000;

const normU = (v) => String(v == null ? '' : v).trim().toUpperCase();
const safeText = (v) => String(v == null ? '' : v).trim();
const normalizeTags = (raw) => {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(',');
  return Array.from(new Set(arr.map(t => String(t || '').trim()).filter(Boolean)));
};
const normalizeCategory = (v) => (CATEGORIES.includes(normU(v)) ? normU(v) : 'NEIGHBORHOOD');
const severityOf = (confirmations) => {
  const n = Number(confirmations) || 0;
  if (n >= SEVERITY_THRESHOLDS.HIGH) return 'HIGH';
  if (n >= SEVERITY_THRESHOLDS.MEDIUM) return 'MEDIUM';
  if (n >= SEVERITY_THRESHOLDS.LOW) return 'LOW';
  return 'UNVERIFIED';
};
const expiresAtFrom = (expiresIn, from = Date.now()) => {
  const days = EXPIRES_OPTIONS[String(expiresIn || '').toLowerCase()];
  return days ? new Date(from + days * 24 * 60 * 60 * 1000).toISOString() : null;
};

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const readAll = async (ssbClient) => readTyped(ssbClient, EMERGENCY_TYPES, { limit: logLimit });

  const buildIndex = (messages) => {
    const tomb = buildValidatedTombstoneSet(messages);
    const nodes = new Map();
    const parentOf = new Map();
    const confirms = [];
    const updates = [];
    for (const m of messages) {
      const v = m.value || {};
      const c = v.content;
      if (!c || typeof c !== 'object') continue;
      if (c.type === 'emergency') {
        nodes.set(m.key, { key: m.key, author: v.author, ts: v.timestamp || m.timestamp || 0, c });
        if (typeof c.replaces === 'string') parentOf.set(m.key, c.replaces);
      } else if (c.type === 'emergencyConfirm' && typeof c.target === 'string') {
        confirms.push({ key: m.key, target: c.target, author: v.author, ts: v.timestamp || 0 });
      } else if (c.type === 'emergencyUpdate' && typeof c.target === 'string') {
        updates.push({ key: m.key, target: c.target, author: v.author, ts: v.timestamp || 0, text: safeText(c.text), createdAt: c.createdAt || new Date(v.timestamp || 0).toISOString(), replaces: typeof c.replaces === 'string' ? c.replaces : null });
      }
    }
    const rootOf = (key) => {
      const seen = new Set();
      let cur = key;
      while (parentOf.has(cur) && !seen.has(cur)) { seen.add(cur); cur = parentOf.get(cur); }
      return cur;
    };
    const updateParent = new Map(updates.filter(u => u.replaces).map(u => [u.key, u.replaces]));
    const updateRootOf = (key) => {
      const seen = new Set();
      let cur = key;
      while (updateParent.has(cur) && !seen.has(cur)) { seen.add(cur); cur = updateParent.get(cur); }
      return cur;
    };
    const updateByKey = new Map(updates.map(u => [u.key, u]));
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
      const confirmers = Array.from(new Set(confirms.filter(cf => updateByKey.has(cf.target) && updateRootOf(cf.target) === uroot && cf.author !== first.author).map(cf => cf.author)));
      updateItems.push({
        id: uroot, key: uroot, tipId: tip.key, target: first.target, author: first.author,
        ts: first.ts, editedTs: tip.ts, text: tip.text, createdAt: first.createdAt, updatedAt: tip.createdAt, edited: tip.key !== uroot,
        confirmations: confirmers, confirmationCount: confirmers.length,
        lastActivityTs: Math.max(tip.ts, ...confirms.filter(cf => updateByKey.has(cf.target) && updateRootOf(cf.target) === uroot).map(cf => cf.ts))
      });
    }
    const versionsByRoot = new Map();
    for (const node of nodes.values()) {
      const root = rootOf(node.key);
      if (tomb.has(root)) continue;
      if (!versionsByRoot.has(root)) versionsByRoot.set(root, []);
      versionsByRoot.get(root).push(node);
    }
    const emergencies = new Map();
    for (const [root, versions] of versionsByRoot) {
      versions.sort((a, b) => a.ts - b.ts);
      const first = versions[0];
      const own = versions.filter(v => v.author === first.author);
      const tip = own[own.length - 1];
      const c = tip.c;
      const thread = updateItems.filter(u => nodes.has(u.target) && rootOf(u.target) === root && u.author === first.author).sort((a, b) => a.ts - b.ts);
      const confirmers = Array.from(new Set([
        ...confirms.filter(cf => nodes.has(cf.target) && rootOf(cf.target) === root && cf.author !== first.author).map(cf => cf.author),
        ...thread.flatMap(u => u.confirmations)
      ]));
      const expiresAt = c.expiresAt || null;
      const expired = !!(expiresAt && Date.parse(expiresAt) < Date.now());
      const status = normU(c.status) === 'RESOLVED' ? 'RESOLVED' : (expired ? 'EXPIRED' : 'ACTIVE');
      emergencies.set(root, {
        id: root, rootId: root, tipId: tip.key,
        title: safeText(c.title), text: safeText(c.text),
        media: (() => { const m = safeText(c.text).match(MEDIA_RE); return m ? { kind: m[1], blobId: m[2] } : null; })(),
        category: normalizeCategory(c.category), mapUrl: safeText(c.mapUrl), tags: normalizeTags(c.tags),
        author: first.author, createdAt: first.c.createdAt || new Date(first.ts).toISOString(),
        updatedAt: c.updatedAt || new Date(tip.ts).toISOString(), ts: tip.ts, lastActivityTs: Math.max(tip.ts, ...thread.map(u => u.lastActivityTs), ...confirms.filter(cf => nodes.has(cf.target) && rootOf(cf.target) === root).map(cf => cf.ts)),
        expiresAt, expired, status, resolved: status === 'RESOLVED',
        confirmations: confirmers, confirmationCount: confirmers.length, severity: severityOf(confirmers.length),
        updates: thread
      });
    }
    const updatesById = new Map(updateItems.map(u => [u.id, u]));
    return { emergencies, rootOf, nodes, updatesById, updateRootOf };
  };

  const load = async () => {
    const ssbClient = await openSsb();
    const idx = buildIndex(await readAll(ssbClient));
    return { ssbClient, idx };
  };

  const find = (idx, id) => {
    const key = String(id || '');
    if (idx.emergencies.has(key)) return idx.emergencies.get(key);
    if (idx.nodes.has(key)) return idx.emergencies.get(idx.rootOf(key)) || null;
    return null;
  };

  const publish = (ssbClient, content) => new Promise((resolve, reject) => ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res)));

  return {
    CATEGORIES,
    SEVERITY_THRESHOLDS,
    EXPIRES_OPTIONS,
    severityOf,

    async createEmergency({ title, text, category, mapUrl, tags, expiresIn }) {
      const ssbClient = await openSsb();
      const cleanTitle = safeText(title);
      if (!cleanTitle) throw new Error('Title required');
      const now = new Date().toISOString();
      const content = {
        type: 'emergency',
        title: cleanTitle,
        text: safeText(text),
        category: normalizeCategory(category),
        mapUrl: safeText(mapUrl),
        tags: normalizeTags(tags),
        status: 'ACTIVE',
        expiresAt: expiresAtFrom(expiresIn),
        author: ssbClient.id,
        createdAt: now,
        updatedAt: now
      };
      return publish(ssbClient, content);
    },

    async updateEmergency(id, data = {}) {
      const { ssbClient, idx } = await load();
      const emergency = find(idx, id);
      if (!emergency) throw new Error('Emergency not found');
      if (String(emergency.author) !== String(ssbClient.id)) throw new Error('Only the author can update');
      const editsContent = ['title', 'text', 'category', 'mapUrl', 'tags', 'expiresIn'].some(k => data[k] !== undefined);
      if (editsContent && (emergency.confirmationCount || 0) > 0) throw new Error('Cannot edit an emergency after it has been confirmed');
      const content = {
        type: 'emergency',
        title: data.title !== undefined ? (safeText(data.title) || emergency.title) : emergency.title,
        text: data.text !== undefined ? safeText(data.text) : emergency.text,
        category: data.category !== undefined ? normalizeCategory(data.category) : emergency.category,
        mapUrl: data.mapUrl !== undefined ? safeText(data.mapUrl) : emergency.mapUrl,
        tags: data.tags !== undefined ? normalizeTags(data.tags) : emergency.tags,
        status: data.status !== undefined ? (normU(data.status) === 'RESOLVED' ? 'RESOLVED' : 'ACTIVE') : (emergency.resolved ? 'RESOLVED' : 'ACTIVE'),
        expiresAt: data.expiresIn !== undefined && data.expiresIn !== 'keep' ? expiresAtFrom(data.expiresIn) : emergency.expiresAt,
        author: ssbClient.id,
        createdAt: emergency.createdAt,
        updatedAt: new Date().toISOString(),
        replaces: emergency.tipId
      };
      const res = await publish(ssbClient, content);
      return { key: res.key, rootId: emergency.id };
    },

    async resolveEmergency(id) {
      return this.updateEmergency(id, { status: 'RESOLVED' });
    },

    async confirmEmergency(id) {
      const { ssbClient, idx } = await load();
      const emergency = find(idx, id);
      if (!emergency) throw new Error('Emergency not found');
      if (String(emergency.author) === String(ssbClient.id)) throw new Error('Cannot confirm own emergency');
      if (emergency.confirmations.includes(ssbClient.id)) throw new Error('Already confirmed');
      return publish(ssbClient, { type: 'emergencyConfirm', target: emergency.id, createdAt: new Date().toISOString() });
    },

    async confirmUpdate(updateId) {
      const { ssbClient, idx } = await load();
      const update = idx.updatesById.get(idx.updateRootOf(String(updateId || '')));
      if (!update) throw new Error('Update not found');
      if (String(update.author) === String(ssbClient.id)) throw new Error('Cannot confirm own update');
      if (update.confirmations.includes(ssbClient.id)) throw new Error('Already confirmed');
      return publish(ssbClient, { type: 'emergencyConfirm', target: update.id, createdAt: new Date().toISOString() });
    },

    async editUpdate(updateId, text) {
      const { ssbClient, idx } = await load();
      const update = idx.updatesById.get(idx.updateRootOf(String(updateId || '')));
      if (!update) throw new Error('Update not found');
      if (String(update.author) !== String(ssbClient.id)) throw new Error('Only the author can edit an update');
      if (update.confirmationCount > 0) throw new Error('Cannot edit an update after it has been confirmed');
      const clean = safeText(text);
      if (!clean) throw new Error('Text required');
      const res = await publish(ssbClient, { type: 'emergencyUpdate', target: update.target, text: clean, createdAt: new Date().toISOString(), replaces: update.tipId });
      return { key: res.key, rootId: update.id, emergencyId: update.target };
    },

    async deleteUpdate(updateId) {
      const { ssbClient, idx } = await load();
      const update = idx.updatesById.get(idx.updateRootOf(String(updateId || '')));
      if (!update) throw new Error('Update not found');
      if (String(update.author) !== String(ssbClient.id)) throw new Error('Only the author can delete an update');
      await publish(ssbClient, { type: 'tombstone', target: update.id, deletedAt: new Date().toISOString(), author: ssbClient.id });
      return { key: update.id, emergencyId: update.target };
    },

    async addUpdate(id, text) {
      const { ssbClient, idx } = await load();
      const emergency = find(idx, id);
      if (!emergency) throw new Error('Emergency not found');
      if (String(emergency.author) !== String(ssbClient.id)) throw new Error('Only the author can post updates');
      const clean = safeText(text);
      if (!clean) throw new Error('Text required');
      return publish(ssbClient, { type: 'emergencyUpdate', target: emergency.id, text: clean, createdAt: new Date().toISOString() });
    },

    async deleteEmergency(id) {
      const { ssbClient, idx } = await load();
      const emergency = find(idx, id);
      if (!emergency) throw new Error('Emergency not found');
      if (String(emergency.author) !== String(ssbClient.id)) throw new Error('Only the author can delete');
      return publish(ssbClient, { type: 'tombstone', target: emergency.id, deletedAt: new Date().toISOString(), author: ssbClient.id });
    },

    async getEmergencyById(id) {
      const { idx } = await load();
      return find(idx, id);
    },

    async listAll({ filter = 'all', q = '', viewerId } = {}) {
      const { ssbClient, idx } = await load();
      const me = viewerId || ssbClient.id;
      let list = Array.from(idx.emergencies.values());
      const f = normU(filter || 'all');
      if (f === 'MINE') list = list.filter(a => String(a.author) === String(me));
      else if (f === 'RECENT') list = list.filter(a => a.lastActivityTs >= Date.now() - RECENT_MS);
      else if (f === 'ACTIVE') list = list.filter(a => a.status === 'ACTIVE');
      else if (f === 'RESOLVED') list = list.filter(a => a.status === 'RESOLVED');
      else if (f === 'EXPIRED') list = list.filter(a => a.status === 'EXPIRED');
      else if (['UNVERIFIED', 'LOW', 'MEDIUM', 'HIGH'].includes(f)) list = list.filter(a => a.severity === f);
      else if (CATEGORIES.includes(f)) list = list.filter(a => a.category === f);
      const needle = safeText(q).toLowerCase();
      if (needle) list = list.filter(a => a.title.toLowerCase().includes(needle) || a.text.toLowerCase().includes(needle) || a.tags.some(t => t.toLowerCase().includes(needle)));
      return list.sort((a, b) => b.lastActivityTs - a.lastActivityTs);
    },

    async featured() {
      const { idx } = await load();
      const rank = { HIGH: 3, MEDIUM: 2, LOW: 1, UNVERIFIED: 0 };
      const candidates = Array.from(idx.emergencies.values()).filter(a => a.status === 'ACTIVE' && a.severity === 'HIGH');
      candidates.sort((a, b) => (rank[b.severity] - rank[a.severity]) || (b.confirmationCount - a.confirmationCount) || (b.lastActivityTs - a.lastActivityTs));
      const top = candidates[0];
      return top ? { id: top.id, title: top.title, severity: top.severity, category: top.category, confirmationCount: top.confirmationCount, href: `/emergencies/${encodeURIComponent(top.id)}` } : null;
    },

    async resolveRootId(id) {
      const { idx } = await load();
      const emergency = find(idx, id);
      if (!emergency) throw new Error('Not found');
      return emergency.id;
    }
  };
};
