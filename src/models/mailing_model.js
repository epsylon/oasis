const pull = require('../server/node_modules/pull-stream');
const crypto = require('crypto');
const { readTyped } = require('./typed_log');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const LIST_TYPE = 'mailingList';
const LEAVE_TYPE = 'mailingLeave';
const LIST_TYPES = ['OPEN', 'CLOSED'];
const STATUSES = ['ACTIVE', 'ARCHIVED'];
const BATCH = 6;
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

const safeText = (v) => String(v == null ? '' : v).trim();
const normU = (v) => String(v || '').trim().toUpperCase();
const normalizeListType = (v) => (LIST_TYPES.includes(normU(v)) ? normU(v) : 'OPEN');
const normalizeStatus = (v) => (STATUSES.includes(normU(v)) ? normU(v) : 'ACTIVE');
const normalizeTags = (raw) => {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(',');
  return Array.from(new Set(arr.map(t => String(t || '').trim()).filter(Boolean)));
};
const isFeedId = (v) => typeof v === 'string' && /^@[A-Za-z0-9+/=]+\.ed25519$/.test(v.trim());
const normalizeMembers = (raw) => {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(/[\s,]+/);
  return Array.from(new Set(arr.map(t => String(t || '').trim()).filter(isFeedId)));
};
const uniq = (list) => Array.from(new Set((list || []).filter(Boolean)));
const canonicalSubject = (s) => String(s || '').replace(/^\s*(RE:\s*)+/i, '').trim();

module.exports = ({ cooler, subscriptionsModel = null }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const publish = (ssbClient, content) => new Promise((resolve, reject) => ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res)));
  const publishPrivate = (ssbClient, content, recps) => new Promise((resolve, reject) => ssbClient.private.publish(content, recps, (err, res) => err ? reject(err) : resolve(res)));

  const publishPrivateBatched = async (ssbClient, content, recipients) => {
    const me = ssbClient.id;
    const others = uniq(recipients).filter(id => id !== me);
    const out = [];
    if (!others.length) { out.push(await publishPrivate(ssbClient, content, [me])); return out; }
    for (let i = 0; i < others.length; i += BATCH) {
      out.push(await publishPrivate(ssbClient, content, uniq([me, ...others.slice(i, i + BATCH)])));
    }
    return out;
  };

  const readPrivate = async (ssbClient) => {
    const me = ssbClient.id;
    const raw = await new Promise((resolve, reject) => {
      pull(ssbClient.createLogStream({ reverse: false }), pull.collect((err, arr) => err ? reject(err) : resolve(arr)));
    });
    const lists = [];
    const leaves = [];
    const posts = [];
    const tombClaims = new Map();
    const authorByKey = new Map();
    for (const m of raw) {
      if (!m || !m.value) continue;
      const content = m.value.content;
      if (typeof content !== 'string') continue;
      let dec;
      try { dec = ssbClient.private.unbox({ key: m.key, value: m.value, timestamp: m.timestamp || m.value.timestamp }); } catch (_) { continue; }
      const v = (dec && dec.value) || {};
      const c = v.content;
      const k = (dec && dec.key) || m.key;
      if (!c || typeof c !== 'object' || !k) continue;
      const ts = v.timestamp || m.timestamp || 0;
      if (c.type === 'tombstone' && c.target) {
        const set = tombClaims.get(c.target) || new Set();
        set.add(v.author);
        tombClaims.set(c.target, set);
        continue;
      }
      authorByKey.set(k, v.author);
      if (c.type === LIST_TYPE) lists.push({ key: k, author: v.author, ts, c });
      else if (c.type === LEAVE_TYPE && c.list) leaves.push({ key: k, author: v.author, ts, list: String(c.list) });
      else if (c.type === 'post' && c.list) {
        const to = Array.isArray(c.to) ? c.to : [];
        if (v.author === me || to.includes(me)) posts.push({ key: k, author: v.author, ts, c });
      }
    }
    const tombed = new Set();
    for (const [target, authors] of tombClaims.entries()) {
      const orig = authorByKey.get(target);
      for (const a of authors) if (a === orig || a === me) { tombed.add(target); break; }
    }
    return { lists, leaves, posts: posts.filter(p => !tombed.has(p.key)), tombed };
  };

  const buildIndex = (publicMsgs, priv) => {
    const tomb = buildValidatedTombstoneSet(publicMsgs);
    const nodes = new Map();
    const parentOf = new Map();
    for (const m of publicMsgs) {
      const v = m.value || {};
      const c = v.content;
      if (!c || typeof c !== 'object' || c.type !== LIST_TYPE) continue;
      nodes.set(m.key, { key: m.key, author: v.author, ts: v.timestamp || m.timestamp || 0, c, closed: false });
      if (typeof c.replaces === 'string') parentOf.set(m.key, c.replaces);
    }
    const rootOf = (key) => {
      const seen = new Set();
      let cur = key;
      while (parentOf.has(cur) && !seen.has(cur)) { seen.add(cur); cur = parentOf.get(cur); }
      return cur;
    };
    const versionsById = new Map();
    for (const node of nodes.values()) {
      const root = rootOf(node.key);
      if (tomb.has(root)) continue;
      if (!versionsById.has(root)) versionsById.set(root, []);
      versionsById.get(root).push(node);
    }
    const closedTomb = new Set();
    for (const n of priv.lists) {
      if (!n.c.listId) continue;
      if (normU(n.c.status) === 'DELETED') closedTomb.add(String(n.c.listId));
    }
    for (const n of priv.lists) {
      const id = n.c.listId ? String(n.c.listId) : null;
      if (!id || closedTomb.has(id)) continue;
      if (!versionsById.has(id)) versionsById.set(id, []);
      versionsById.get(id).push({ ...n, closed: true });
    }
    const lists = new Map();
    for (const [id, versions] of versionsById) {
      versions.sort((a, b) => a.ts - b.ts);
      const first = versions[0];
      const own = versions.filter(v => v.author === first.author);
      const tip = own[own.length - 1];
      const c = tip.c;
      const listType = first.closed ? 'CLOSED' : normalizeListType(c.listType);
      const updatedAt = c.updatedAt || new Date(tip.ts).toISOString();
      let members = first.closed ? uniq([first.author, ...normalizeMembers(c.members)]) : [];
      if (first.closed) {
        const left = new Set(priv.leaves.filter(l => l.list === id && l.ts >= tip.ts).map(l => l.author));
        members = members.filter(m => m === first.author || !left.has(m));
      }
      lists.set(id, {
        id, rootId: id, tipId: tip.key,
        title: safeText(c.title), description: safeText(c.description),
        listType, closed: listType === 'CLOSED', status: normalizeStatus(c.status), tags: normalizeTags(c.tags),
        members, author: first.author,
        createdAt: first.c.createdAt || new Date(first.ts).toISOString(),
        updatedAt, ts: tip.ts
      });
    }
    return { lists, rootOf, nodes };
  };

  const historyFor = (priv, id, me) => {
    const seen = new Map();
    for (const p of priv.posts) {
      if (String(p.c.list) !== String(id)) continue;
      const mid = p.c.mid ? String(p.c.mid) : p.key;
      if (seen.has(mid)) continue;
      seen.set(mid, p);
    }
    const out = Array.from(seen.values()).map(p => ({
      key: p.key, mid: p.c.mid ? String(p.c.mid) : p.key, list: String(p.c.list),
      author: p.author, subject: safeText(p.c.subject), text: safeText(p.c.text),
      thread: p.c.thread ? String(p.c.thread) : (p.c.mid ? String(p.c.mid) : p.key),
      sentAt: p.c.sentAt || new Date(p.ts).toISOString(), ts: Date.parse(p.c.sentAt || '') || p.ts
    }));
    out.sort((a, b) => a.ts - b.ts);
    return out;
  };

  const load = async () => {
    const ssbClient = await openSsb();
    const [publicMsgs, priv] = await Promise.all([readTyped(ssbClient, [LIST_TYPE, 'tombstone'], { limit: logLimit }), readPrivate(ssbClient)]);
    const idx = buildIndex(publicMsgs, priv);
    return { ssbClient, idx, priv };
  };

  const find = (idx, id) => {
    const key = String(id || '');
    if (idx.lists.has(key)) return idx.lists.get(key);
    if (idx.nodes.has(key)) return idx.lists.get(idx.rootOf(key)) || null;
    return null;
  };

  const subscribersMap = async (ids) => {
    if (!subscriptionsModel || !ids.length) return new Map();
    if (typeof subscriptionsModel.subscribersMap === 'function') {
      try { return await subscriptionsModel.subscribersMap(ids); } catch (_) { return new Map(); }
    }
    const out = new Map();
    for (const id of ids) {
      try { out.set(id, await subscriptionsModel.listSubscribers(id)); } catch (_) { out.set(id, []); }
    }
    return out;
  };

  const decorate = async (ssbClient, list, priv, subs) => {
    const me = ssbClient.id;
    const history = historyFor(priv, list.id, me);
    const subscribers = list.closed ? [] : ((subs && subs.get(list.id)) || []);
    const participants = list.closed ? list.members : uniq([list.author, ...subscribers]);
    const isMember = participants.includes(me);
    const lastTs = history.length ? history[history.length - 1].ts : list.ts;
    return {
      ...list,
      subscribers, participants, participantCount: participants.length,
      isMember, isOwner: list.author === me, canWrite: isMember && list.status === 'ACTIVE',
      messageCount: history.length, threadCount: new Set(history.map(h => h.thread)).size,
      lastActivityTs: lastTs, history
    };
  };

  const visibleTo = (list, me) => !list.closed || list.members.includes(me);

  const recipientsFor = async (ssbClient, list) => {
    const me = ssbClient.id;
    const subs = list.closed ? [] : ((await subscribersMap([list.id])).get(list.id) || []);
    const all = list.closed ? list.members : uniq([list.author, ...subs]);
    return { all, others: all.filter(id => id !== me) };
  };

  const publishListVersion = async (ssbClient, content, list) => {
    if (!list || !list.closed) return publish(ssbClient, content);
    const res = await publishPrivateBatched(ssbClient, content, list.members);
    return res[0];
  };

  return {
    LIST_TYPE,
    LIST_TYPES,
    STATUSES,

    async createList({ title, description, listType, members, tags }) {
      const ssbClient = await openSsb();
      const me = ssbClient.id;
      const now = new Date().toISOString();
      const t = safeText(title);
      if (!t) throw new Error('Title is required');
      const type = normalizeListType(listType);
      const content = {
        type: LIST_TYPE,
        title: t,
        description: safeText(description),
        listType: type,
        status: 'ACTIVE',
        tags: normalizeTags(tags),
        author: me,
        createdAt: now,
        updatedAt: now
      };
      if (type === 'CLOSED') {
        const listId = crypto.randomBytes(16).toString('hex');
        const mem = uniq([me, ...normalizeMembers(members)]);
        const res = await publishPrivateBatched(ssbClient, { ...content, listId, members: mem, private: true }, mem);
        return { key: listId, rootId: listId, msgKey: res[0].key };
      }
      const res = await publish(ssbClient, content);
      return { key: res.key, rootId: res.key, msgKey: res.key };
    },

    async updateList(id, data = {}) {
      const { ssbClient, idx } = await load();
      const me = ssbClient.id;
      const list = find(idx, id);
      if (!list) throw new Error('Mailing list not found');
      if (list.author !== me) throw new Error('Only the author can update this mailing list');
      const now = new Date().toISOString();
      const nextMembers = list.closed && data.members !== undefined ? uniq([me, ...normalizeMembers(data.members)]) : list.members;
      const content = {
        type: LIST_TYPE,
        title: data.title !== undefined && safeText(data.title) ? safeText(data.title) : list.title,
        description: data.description !== undefined ? safeText(data.description) : list.description,
        listType: list.listType,
        status: data.status !== undefined ? normalizeStatus(data.status) : list.status,
        tags: data.tags !== undefined ? normalizeTags(data.tags) : list.tags,
        author: me,
        createdAt: list.createdAt,
        updatedAt: now,
        replaces: list.tipId
      };
      if (list.closed) {
        const res = await publishPrivateBatched(ssbClient, { ...content, listId: list.id, members: nextMembers, private: true }, uniq([...list.members, ...nextMembers]));
        return { key: res[0].key, rootId: list.id };
      }
      const res = await publish(ssbClient, content);
      return { key: res.key, rootId: list.id };
    },

    async setStatus(id, status) {
      return this.updateList(id, { status: normalizeStatus(status) });
    },

    async deleteList(id) {
      const { ssbClient, idx } = await load();
      const me = ssbClient.id;
      const list = find(idx, id);
      if (!list) throw new Error('Mailing list not found');
      if (list.author !== me) throw new Error('Only the author can delete this mailing list');
      if (list.closed) {
        await publishPrivateBatched(ssbClient, { type: LIST_TYPE, listId: list.id, title: list.title, status: 'DELETED', author: me, createdAt: list.createdAt, updatedAt: new Date().toISOString(), replaces: list.tipId, private: true }, list.members);
        return { key: list.id };
      }
      await publish(ssbClient, { type: 'tombstone', target: list.id, deletedAt: new Date().toISOString(), author: me });
      return { key: list.id };
    },

    async leaveList(id) {
      const { ssbClient, idx } = await load();
      const me = ssbClient.id;
      const list = find(idx, id);
      if (!list) throw new Error('Mailing list not found');
      if (!list.closed) {
        if (!subscriptionsModel) throw new Error('Subscriptions unavailable');
        return subscriptionsModel.setSubscription(list.id, 'mailing', false);
      }
      if (list.author === me) throw new Error('The author cannot leave the mailing list');
      if (!list.members.includes(me)) throw new Error('Not a member');
      return publishPrivateBatched(ssbClient, { type: LEAVE_TYPE, list: list.id, private: true, createdAt: new Date().toISOString() }, [list.author]);
    },

    async sendMessage(id, { subject, text, thread = '', replyTo = '' } = {}) {
      const { ssbClient, idx, priv } = await load();
      const me = ssbClient.id;
      const list = find(idx, id);
      if (!list || !visibleTo(list, me)) throw new Error('Mailing list not found');
      if (list.status !== 'ACTIVE') throw new Error('This mailing list is archived');
      let { all, others } = await recipientsFor(ssbClient, list);
      if (!all.includes(me) && !list.closed && subscriptionsModel) {
        await subscriptionsModel.setSubscription(list.id, 'mailing', true);
        ({ all, others } = await recipientsFor(ssbClient, list));
        if (!all.includes(me)) { all = uniq([...all, me]); others = all.filter(id => id !== me); }
      }
      if (!all.includes(me)) throw new Error('Only participants can write to this mailing list');
      const body = safeText(text);
      if (!body) throw new Error('Text is required');
      const mid = crypto.randomBytes(12).toString('hex');
      let threadId = safeText(thread);
      let subj = safeText(subject);
      if (!threadId && replyTo) {
        const parent = historyFor(priv, list.id, me).find(h => h.key === replyTo || h.mid === replyTo);
        if (parent) { threadId = parent.thread; if (!subj) subj = `RE: ${canonicalSubject(parent.subject)}`; }
      }
      const content = {
        type: 'post',
        from: me,
        to: [],
        subject: subj || list.title,
        text: body,
        sentAt: new Date().toISOString(),
        private: true,
        list: list.id,
        mid,
        thread: threadId || mid
      };
      const out = [];
      if (!others.length) out.push(await publishPrivate(ssbClient, { ...content, to: [me] }, [me]));
      for (let i = 0; i < others.length; i += BATCH) {
        const recps = uniq([me, ...others.slice(i, i + BATCH)]);
        out.push(await publishPrivate(ssbClient, { ...content, to: recps }, recps));
      }
      return { key: out[0].key, mid, thread: content.thread, batches: out.length };
    },

    async getListById(id) {
      const { ssbClient, idx, priv } = await load();
      const list = find(idx, id);
      if (!list || !visibleTo(list, ssbClient.id)) return null;
      return decorate(ssbClient, list, priv, list.closed ? null : await subscribersMap([list.id]));
    },

    async listAll({ filter = 'all', q = '' } = {}) {
      const { ssbClient, idx, priv } = await load();
      const me = ssbClient.id;
      const f = String(filter || 'all').toLowerCase();
      const needle = String(q || '').trim().toLowerCase();
      const visible = Array.from(idx.lists.values()).filter(l => visibleTo(l, me));
      const subs = await subscribersMap(visible.filter(l => !l.closed).map(l => l.id));
      let out = [];
      for (const list of visible) out.push(await decorate(ssbClient, list, priv, subs));
      if (f === 'mine') out = out.filter(l => l.author === me);
      else if (f === 'subscribed') out = out.filter(l => l.isMember && l.author !== me);
      else if (f === 'recent') out = out.filter(l => l.lastActivityTs >= Date.now() - RECENT_MS);
      else if (f === 'open') out = out.filter(l => !l.closed);
      else if (f === 'closed') out = out.filter(l => l.closed);
      else if (f === 'active') out = out.filter(l => l.status === 'ACTIVE');
      else if (f === 'archived') out = out.filter(l => l.status === 'ARCHIVED');
      if (needle) out = out.filter(l => [l.title, l.description, ...l.tags].some(v => String(v || '').toLowerCase().includes(needle)));
      out.sort((a, b) => b.lastActivityTs - a.lastActivityTs);
      return out;
    },

    async composerEntries() {
      const all = await this.listAll({ filter: 'all' });
      return all.filter(l => l.isMember && l.status === 'ACTIVE').map(l => ({ target: l.id, scope: 'mailing', title: l.title, owner: l.author, count: l.participantCount }));
    },

    async titlesFor(ids) {
      const out = new Map();
      const wanted = new Set((ids || []).map(String));
      if (!wanted.size) return out;
      const { ssbClient, idx } = await load();
      for (const list of idx.lists.values()) {
        if (wanted.has(list.id) && visibleTo(list, ssbClient.id)) out.set(list.id, { title: list.title, status: list.status, closed: list.closed });
      }
      return out;
    },

    async resolveRootId(id) {
      const { idx } = await load();
      const list = find(idx, id);
      return list ? list.id : String(id || '');
    }
  };
};
