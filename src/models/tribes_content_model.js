const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;
const tribeLogLimit = Math.max(logLimit, 100000);

const VALID_CONTENT_TYPES = ['event', 'task', 'report', 'votation', 'forum', 'forum-reply', 'market', 'job', 'project', 'media', 'feed', 'pixelia'];
const categories = require('../backend/opinion_categories');
const VALID_STATUSES = ['OPEN', 'CLOSED', 'IN-PROGRESS'];
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

module.exports = ({ cooler, tribeCrypto, tribesModel }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const readLog = async () => {
    const client = await openSsb();
    return new Promise((resolve, reject) =>
      pull(
        client.createLogStream({ limit: tribeLogLimit }),
        pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
      )
    );
  };

  const fingerprintsForRoot = (rootId) => {
    const fps = new Set();
    for (const k of tribeCrypto.getKeys(rootId)) fps.add(tribeCrypto.fingerprint(k));
    return fps;
  };

  const wrapAndPublishContent = async (rootId, body) => {
    const client = await openSsb();
    const key = tribeCrypto.getKey(rootId);
    if (!key) throw new Error('Missing tribe key for ' + rootId);
    const envelope = tribeCrypto.wrapMsg(body, key);
    return new Promise((resolve, reject) =>
      client.publish(envelope, (err, r) => err ? reject(err) : resolve(r))
    );
  };

  const decodeContentMsgs = async (msgs, opts) => {
    const fpIdx = tribeCrypto.buildFingerprintIndex();
    const targetRootId = opts && opts.rootId ? opts.rootId : null;
    const allowedFps = targetRootId ? fingerprintsForRoot(targetRootId) : null;

    const items = new Map();
    const replacedBy = new Map();
    const tombstoned = new Set();
    const authorByKey = new Map();
    const tombRequests = [];

    for (const m of msgs) {
      const c = m.value && m.value.content;
      if (!c) continue;
      if (!tribeCrypto.isTribeMsg(c)) continue;
      if (allowedFps && !allowedFps.has(c.fp)) continue;

      const r = tribeCrypto.unwrapMsg(c, fpIdx);
      if (!r || !r.body) continue;
      const b = r.body;

      if (b.k === 'tombstone') {
        tombRequests.push({ target: b.target, author: m.value.author, rootId: r.rootId });
        continue;
      }
      if (b.k !== 'tribe-content') continue;
      if (targetRootId && b.rootId !== targetRootId) continue;
      if (opts && opts.contentType && b.contentType !== opts.contentType) continue;

      authorByKey.set(m.key, m.value.author);
      if (b.replaces) replacedBy.set(b.replaces, m.key);
      items.set(m.key, { id: m.key, ...b, _ts: m.value.timestamp });
    }

    for (const t of tombRequests) {
      const targetAuthor = authorByKey.get(t.target);
      if (targetAuthor && t.author === targetAuthor) tombstoned.add(t.target);
    }

    return { items, replacedBy, tombstoned };
  };

  return {
    async create(tribeId, contentType, data) {
      if (!VALID_CONTENT_TYPES.includes(contentType)) throw new Error('Invalid content type');
      if (data.status && !VALID_STATUSES.includes(data.status)) throw new Error('Invalid status. Must be OPEN, CLOSED, or IN-PROGRESS');
      if (data.priority && !VALID_PRIORITIES.includes(data.priority)) throw new Error('Invalid priority. Must be LOW, MEDIUM, HIGH, or CRITICAL');

      const client = await openSsb();
      const rootId = await tribesModel.getRootId(tribeId);
      const now = new Date().toISOString();
      const body = {
        k: 'tribe-content',
        rootId,
        contentType,
        replaces: null,
        title: data.title || '',
        description: data.description || '',
        status: data.status || 'OPEN',
        date: data.date || null,
        location: data.location || null,
        price: data.price || null,
        salary: data.salary || null,
        priority: data.priority || null,
        assignees: data.assignees || [],
        options: data.options || [],
        votes: data.votes || {},
        category: data.category || null,
        parentId: data.parentId || null,
        tags: data.tags || [],
        image: data.image || null,
        mediaType: data.mediaType || null,
        url: data.url || null,
        attendees: data.attendees || [],
        deadline: data.deadline || null,
        goal: data.goal || null,
        funded: data.funded || 0,
        refeeds: data.refeeds || 0,
        refeeds_inhabitants: data.refeeds_inhabitants || [],
        opinions: data.opinions || {},
        opinions_inhabitants: data.opinions_inhabitants || [],
        author: client.id,
        createdAt: now,
        updatedAt: now
      };
      return wrapAndPublishContent(rootId, body);
    },

    async update(contentId, data, existing) {
      if (!existing) existing = await this.getById(contentId);
      if (!existing) throw new Error('Content not found');
      if (data.status && !VALID_STATUSES.includes(data.status)) throw new Error('Invalid status. Must be OPEN, CLOSED, or IN-PROGRESS');
      if (data.priority && !VALID_PRIORITIES.includes(data.priority)) throw new Error('Invalid priority. Must be LOW, MEDIUM, HIGH, or CRITICAL');

      const rootId = existing.rootId || (await tribesModel.getRootId(existing.tribeId || existing.rootId));
      const now = new Date().toISOString();
      const body = {
        k: 'tribe-content',
        rootId,
        contentType: existing.contentType,
        replaces: contentId,
        title: data.title !== undefined ? data.title : existing.title,
        description: data.description !== undefined ? data.description : existing.description,
        status: data.status !== undefined ? data.status : existing.status,
        date: data.date !== undefined ? data.date : existing.date,
        location: data.location !== undefined ? data.location : existing.location,
        price: data.price !== undefined ? data.price : existing.price,
        salary: data.salary !== undefined ? data.salary : existing.salary,
        priority: data.priority !== undefined ? data.priority : existing.priority,
        assignees: data.assignees !== undefined ? data.assignees : existing.assignees,
        options: data.options !== undefined ? data.options : existing.options,
        votes: data.votes !== undefined ? data.votes : existing.votes,
        category: data.category !== undefined ? data.category : existing.category,
        parentId: data.parentId !== undefined ? data.parentId : existing.parentId,
        tags: data.tags !== undefined ? data.tags : existing.tags,
        image: data.image !== undefined ? data.image : existing.image,
        mediaType: data.mediaType !== undefined ? data.mediaType : existing.mediaType,
        url: data.url !== undefined ? data.url : existing.url,
        attendees: data.attendees !== undefined ? data.attendees : existing.attendees,
        deadline: data.deadline !== undefined ? data.deadline : existing.deadline,
        goal: data.goal !== undefined ? data.goal : existing.goal,
        funded: data.funded !== undefined ? data.funded : existing.funded,
        refeeds: data.refeeds !== undefined ? data.refeeds : existing.refeeds,
        refeeds_inhabitants: data.refeeds_inhabitants !== undefined ? data.refeeds_inhabitants : existing.refeeds_inhabitants,
        opinions: data.opinions !== undefined ? data.opinions : existing.opinions,
        opinions_inhabitants: data.opinions_inhabitants !== undefined ? data.opinions_inhabitants : existing.opinions_inhabitants,
        author: existing.author,
        createdAt: existing.createdAt,
        updatedAt: now
      };
      return wrapAndPublishContent(rootId, body);
    },

    async deleteById(contentId) {
      const existing = await this.getById(contentId);
      if (!existing) throw new Error('Content not found');
      const rootId = existing.rootId || (await tribesModel.getRootId(existing.tribeId || existing.rootId));
      const client = await openSsb();
      const body = {
        k: 'tombstone',
        rootId,
        target: contentId,
        author: client.id,
        deletedAt: new Date().toISOString()
      };
      return wrapAndPublishContent(rootId, body);
    },

    async getById(contentId) {
      const msgs = await readLog();
      const { items, replacedBy, tombstoned } = await decodeContentMsgs(msgs, {});
      let latestId = contentId;
      while (replacedBy.has(latestId)) latestId = replacedBy.get(latestId);
      if (tombstoned.has(latestId)) return null;
      return items.get(latestId) || null;
    },

    async listByTribe(tribeId, contentType, filter) {
      const rootId = await tribesModel.getRootId(tribeId).catch(() => tribeId);
      const msgs = await readLog();
      const { items, replacedBy, tombstoned } = await decodeContentMsgs(msgs, { rootId, contentType });
      for (const id of tombstoned) items.delete(id);
      for (const oldId of replacedBy.keys()) items.delete(oldId);

      let result = [...items.values()];
      if (filter === 'open') result = result.filter(i => i.status === 'OPEN');
      else if (filter === 'closed') result = result.filter(i => i.status === 'CLOSED');
      else if (filter === 'in-progress') result = result.filter(i => i.status === 'IN-PROGRESS');

      return result.sort((a, b) => {
        const ta = Date.parse(a.updatedAt || a.createdAt) || a._ts || 0;
        const tb = Date.parse(b.updatedAt || b.createdAt) || b._ts || 0;
        return tb - ta;
      });
    },

    async toggleAttendee(contentId) {
      const client = await openSsb();
      const userId = client.id;
      const item = await this.getById(contentId);
      if (!item) throw new Error('Content not found');
      const attendees = Array.isArray(item.attendees) ? [...item.attendees] : [];
      const idx = attendees.indexOf(userId);
      if (idx === -1) attendees.push(userId);
      else attendees.splice(idx, 1);
      return this.update(contentId, { attendees }, item);
    },

    async toggleAssignee(contentId) {
      const client = await openSsb();
      const userId = client.id;
      const item = await this.getById(contentId);
      if (!item) throw new Error('Content not found');
      const assignees = Array.isArray(item.assignees) ? [...item.assignees] : [];
      const idx = assignees.indexOf(userId);
      if (idx === -1) assignees.push(userId);
      else assignees.splice(idx, 1);
      return this.update(contentId, { assignees }, item);
    },

    async updateStatus(contentId, status) {
      if (!VALID_STATUSES.includes(status)) throw new Error('Invalid status. Must be OPEN, CLOSED, or IN-PROGRESS');
      return this.update(contentId, { status });
    },

    async castVote(votationId, optionIndex) {
      const client = await openSsb();
      const userId = client.id;
      const item = await this.getById(votationId);
      if (!item) throw new Error('Votation not found');
      if (item.status === 'CLOSED') throw new Error('Votation is closed');
      const options = item.options || [];
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) {
        throw new Error('Invalid option index');
      }
      const votes = item.votes || {};
      for (const key of Object.keys(votes)) {
        const arr = Array.isArray(votes[key]) ? votes[key] : [];
        if (arr.includes(userId)) throw new Error('Already voted');
      }
      const key = String(optionIndex);
      if (!votes[key]) votes[key] = [];
      votes[key].push(userId);
      return this.update(votationId, { votes }, item);
    },

    async toggleRefeed(contentId) {
      const client = await openSsb();
      const userId = client.id;
      const item = await this.getById(contentId);
      if (!item) throw new Error('Content not found');
      const inhabitants = Array.isArray(item.refeeds_inhabitants) ? [...item.refeeds_inhabitants] : [];
      if (inhabitants.includes(userId)) return item;
      inhabitants.push(userId);
      return this.update(contentId, { refeeds: (item.refeeds || 0) + 1, refeeds_inhabitants: inhabitants }, item);
    },

    async castOpinion(contentId, category) {
      if (!categories.includes(category)) throw new Error('Invalid opinion category');
      const client = await openSsb();
      const userId = client.id;
      const item = await this.getById(contentId);
      if (!item) throw new Error('Content not found');
      const inhabitants = Array.isArray(item.opinions_inhabitants) ? [...item.opinions_inhabitants] : [];
      if (inhabitants.includes(userId)) throw new Error('Already voted');
      inhabitants.push(userId);
      const opinions = { ...(item.opinions || {}), [category]: (item.opinions?.[category] || 0) + 1 };
      return this.update(contentId, { opinions, opinions_inhabitants: inhabitants }, item);
    },

    async getThread(forumId) {
      const msgs = await readLog();
      const { items, replacedBy, tombstoned } = await decodeContentMsgs(msgs, {});
      for (const id of tombstoned) items.delete(id);
      for (const oldId of replacedBy.keys()) items.delete(oldId);
      const all = [...items.values()];
      const parent = all.find(i => i.id === forumId);
      if (!parent) return { parent: null, replies: [] };
      const replies = all
        .filter(i => i.parentId === forumId && i.contentType === 'forum-reply')
        .sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
      return { parent, replies };
    }
  };
};
