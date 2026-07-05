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
    const wantType = opts && opts.contentType ? opts.contentType : null;
    const allowedFps = targetRootId ? fingerprintsForRoot(targetRootId) : null;

    const content = new Map();
    const tombRequests = [];
    const collabMsgs = [];

    for (const m of msgs) {
      const c = m.value && m.value.content;
      if (!c) continue;
      if (!tribeCrypto.isTribeMsg(c)) continue;
      if (allowedFps && !allowedFps.has(c.fp)) continue;

      const r = tribeCrypto.unwrapMsg(c, fpIdx);
      if (!r || !r.body) continue;
      const b = r.body;

      if (b.k === 'tombstone') {
        tombRequests.push({ target: b.target, author: m.value.author });
        continue;
      }
      if (b.k === 'tc-collab') {
        collabMsgs.push({ sub: b.sub, target: b.target, author: m.value.author, ts: m.value.timestamp || 0, option: b.option, on: b.on, category: b.category });
        continue;
      }
      if (b.k !== 'tribe-content') continue;
      content.set(m.key, { author: m.value.author, body: b, ts: m.value.timestamp });
    }

    const naiveNext = new Map();
    const strictNext = new Map();
    for (const [key, node] of content) {
      const t = node.body.replaces;
      if (!t) continue;
      naiveNext.set(t, key);
      const orig = content.get(t);
      if (orig && orig.author === node.author) strictNext.set(t, key);
    }
    for (const [t, key] of Array.from(naiveNext.entries())) {
      const orig = content.get(t);
      if (!orig) { naiveNext.delete(t); continue; }
      const node = content.get(key);
      if (!node || node.author !== orig.author) { naiveNext.delete(t); content.delete(key); }
    }
    const naivePrev = new Map();
    for (const [t, key] of naiveNext) naivePrev.set(key, t);
    const followTo = (start, nextMap) => { let x = start, g = 0; while (nextMap.has(x) && g++ < 100000) x = nextMap.get(x); return x; };
    const rootOf = (key) => { let x = key, g = 0; while (naivePrev.has(x) && content.has(naivePrev.get(x)) && g++ < 100000) x = naivePrev.get(x); return x; };

    const roots = new Set();
    for (const [key, node] of content) { const t = node.body.replaces; if (!t || !content.has(t)) roots.add(key); }

    const tombstoned = new Set();
    for (const t of tombRequests) { const orig = content.get(t.target); if (orig && t.author === orig.author) tombstoned.add(t.target); }

    const collabByRoot = new Map();
    const getCB = (root) => { if (!collabByRoot.has(root)) collabByRoot.set(root, { vote: new Map(), attend: new Map(), assign: new Map(), refeed: new Set(), opinion: new Map() }); return collabByRoot.get(root); };
    for (const cm of collabMsgs) {
      if (!content.has(cm.target)) continue;
      const a = getCB(rootOf(cm.target));
      if (cm.sub === 'vote' && Number.isInteger(cm.option)) { if (!a.vote.has(cm.author)) a.vote.set(cm.author, cm.option); }
      else if (cm.sub === 'attend') { const p = a.attend.get(cm.author); if (!p || cm.ts >= p.ts) a.attend.set(cm.author, { on: cm.on !== false, ts: cm.ts }); }
      else if (cm.sub === 'assign') { const p = a.assign.get(cm.author); if (!p || cm.ts >= p.ts) a.assign.set(cm.author, { on: cm.on !== false, ts: cm.ts }); }
      else if (cm.sub === 'refeed') { a.refeed.add(cm.author); }
      else if (cm.sub === 'opinion' && cm.category) { if (!a.opinion.has(cm.author)) a.opinion.set(cm.author, cm.category); }
    }

    const items = new Map();
    const tipOf = new Map();
    const EMPTY = { vote: new Map(), attend: new Map(), assign: new Map(), refeed: new Set(), opinion: new Map() };

    for (const root of roots) {
      const contentTip = followTo(root, strictNext);
      const tipNode = content.get(contentTip);
      if (!tipNode) continue;
      const body = tipNode.body;
      const lb = tipNode.body;
      const a = collabByRoot.get(root) || EMPTY;

      const item = { id: contentTip, ...body, author: tipNode.author, _ts: tipNode.ts };

      const voteAuthors = new Set(); const votes = {};
      const legacyVotes = lb.votes && typeof lb.votes === 'object' ? lb.votes : {};
      for (const k of Object.keys(legacyVotes)) { const arr = Array.isArray(legacyVotes[k]) ? legacyVotes[k] : []; for (const au of arr) if (!voteAuthors.has(au)) { voteAuthors.add(au); (votes[k] = votes[k] || []).push(au); } }
      for (const [au, opt] of a.vote) if (!voteAuthors.has(au)) { voteAuthors.add(au); const k = String(opt); (votes[k] = votes[k] || []).push(au); }
      item.votes = votes;

      const att = new Set(Array.isArray(lb.attendees) ? lb.attendees : []);
      for (const [au, st] of a.attend) { if (st.on) att.add(au); else att.delete(au); }
      item.attendees = [...att];

      const asg = new Set(Array.isArray(lb.assignees) ? lb.assignees : []);
      for (const [au, st] of a.assign) { if (st.on) asg.add(au); else asg.delete(au); }
      item.assignees = [...asg];

      const rf = new Set(Array.isArray(lb.refeeds_inhabitants) ? lb.refeeds_inhabitants : []);
      for (const au of a.refeed) rf.add(au);
      item.refeeds_inhabitants = [...rf]; item.refeeds = rf.size;

      const opInh = new Set(Array.isArray(lb.opinions_inhabitants) ? lb.opinions_inhabitants : []);
      const opinions = { ...(lb.opinions && typeof lb.opinions === 'object' ? lb.opinions : {}) };
      for (const [au, cat] of a.opinion) if (!opInh.has(au)) { opInh.add(au); opinions[cat] = (opinions[cat] || 0) + 1; }
      item.opinions_inhabitants = [...opInh]; item.opinions = opinions;

      let cur = root, g = 0; tipOf.set(root, contentTip);
      while (naiveNext.has(cur) && g++ < 100000) { cur = naiveNext.get(cur); tipOf.set(cur, contentTip); }

      if (tombstoned.has(contentTip)) continue;
      if (targetRootId && body.rootId !== targetRootId) continue;
      if (wantType && body.contentType !== wantType) continue;
      items.set(contentTip, item);
    }

    return { items, tipOf, tombstoned };
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
      const { items, tipOf } = await decodeContentMsgs(msgs, {});
      const tip = tipOf.get(contentId) || contentId;
      return items.get(tip) || null;
    },

    async listByTribe(tribeId, contentType, filter) {
      const rootId = await tribesModel.getRootId(tribeId).catch(() => tribeId);
      const msgs = await readLog();
      const { items } = await decodeContentMsgs(msgs, { rootId, contentType });

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
      const on = !(Array.isArray(item.attendees) && item.attendees.includes(userId));
      return wrapAndPublishContent(item.rootId, { k: 'tc-collab', sub: 'attend', rootId: item.rootId, target: item.id, on });
    },

    async toggleAssignee(contentId) {
      const client = await openSsb();
      const userId = client.id;
      const item = await this.getById(contentId);
      if (!item) throw new Error('Content not found');
      const on = !(Array.isArray(item.assignees) && item.assignees.includes(userId));
      return wrapAndPublishContent(item.rootId, { k: 'tc-collab', sub: 'assign', rootId: item.rootId, target: item.id, on });
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
      return wrapAndPublishContent(item.rootId, { k: 'tc-collab', sub: 'vote', rootId: item.rootId, target: item.id, option: optionIndex });
    },

    async toggleRefeed(contentId) {
      const client = await openSsb();
      const userId = client.id;
      const item = await this.getById(contentId);
      if (!item) throw new Error('Content not found');
      if (Array.isArray(item.refeeds_inhabitants) && item.refeeds_inhabitants.includes(userId)) return item;
      return wrapAndPublishContent(item.rootId, { k: 'tc-collab', sub: 'refeed', rootId: item.rootId, target: item.id });
    },

    async castOpinion(contentId, category) {
      if (!categories.includes(category)) throw new Error('Invalid opinion category');
      const client = await openSsb();
      const userId = client.id;
      const item = await this.getById(contentId);
      if (!item) throw new Error('Content not found');
      if (Array.isArray(item.opinions_inhabitants) && item.opinions_inhabitants.includes(userId)) throw new Error('Already voted');
      return wrapAndPublishContent(item.rootId, { k: 'tc-collab', sub: 'opinion', rootId: item.rootId, target: item.id, category });
    },

    async getThread(forumId) {
      const msgs = await readLog();
      const { items } = await decodeContentMsgs(msgs, {});
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
