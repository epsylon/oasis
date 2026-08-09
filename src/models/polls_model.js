const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');

const logLimit = getConfig().ssbLogStream?.limit || 1000;

const POLL_TYPE = 'poll';
const VOTE_TYPE = 'pollVote';
const OPINION_TYPE = 'pollOpinion';

const { MAX_OPTIONS, MIN_OPTIONS, MAX_OPTION_LENGTH } = require('./polls_model_limits');

const clean = (v) => String(v == null ? '' : v).trim();

const normalizeOptions = (raw) => {
  const list = Array.isArray(raw) ? raw : String(raw || '').split('\n');
  const out = [];
  const seen = new Set();
  for (const entry of list) {
    const value = clean(entry).slice(0, MAX_OPTION_LENGTH);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_OPTIONS) break;
  }
  return out;
};

const normalizeTags = (raw) => {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(',');
  return list.map(t => clean(t)).filter(Boolean).slice(0, 20);
};

module.exports = ({ cooler, isPublic = false, tribeCrypto = null, chatsModel = null }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const getAllMessages = async (ssbClient) =>
    new Promise((resolve, reject) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => (err ? reject(err) : resolve(msgs)))
      );
    });

  const decryptField = (value, keys) => {
    if (!tribeCrypto || typeof value !== 'string' || !value) return null;
    for (const k of keys) {
      try {
        const out = tribeCrypto.decryptWithKey(value, k);
        if (typeof out === 'string' && out) return out;
      } catch (_) {}
    }
    return null;
  };

  const scopeKey = async (scope) => {
    if (!scope || !chatsModel) return null;
    if (!scope.chatId && !scope.tribeId) return null;
    try { return await chatsModel.encryptionKeyFor(scope.chatId || null, scope.tribeId || null); } catch (_) { return null; }
  };

  const buildIndex = (messages) => {
    const tomb = buildValidatedTombstoneSet(messages);
    const nodes = new Map();
    const replaced = new Map();
    const votesByRoot = new Map();
    const opinionsByRoot = new Map();
    const closedRoots = new Set();
    const commentsByRoot = new Map();
    const authorByKey = new Map();

    for (const m of messages) {
      const v = m && m.value;
      const c = v && v.content;
      if (!c || typeof c !== 'object') continue;
      authorByKey.set(m.key, v.author);

      if (c.type === POLL_TYPE) {
        nodes.set(m.key, { key: m.key, author: v.author, ts: v.timestamp || m.timestamp || 0, c });
        if (typeof c.replaces === 'string') replaced.set(c.replaces, m.key);
        continue;
      }
      if (c.type === VOTE_TYPE && typeof c.target === 'string') {
        const entry = votesByRoot.get(c.target) || new Map();
        const prev = entry.get(v.author);
        const ts = v.timestamp || m.timestamp || 0;
        if (!prev || ts >= prev.ts) {
          entry.set(v.author, {
            ts,
            choices: Array.isArray(c.choices) ? c.choices : [],
            encryptedChoices: typeof c.encryptedChoices === 'string' ? c.encryptedChoices : null
          });
        }
        votesByRoot.set(c.target, entry);
        continue;
      }
      if (c.type === OPINION_TYPE && typeof c.target === 'string') {
        const entry = opinionsByRoot.get(c.target) || { counts: {}, voters: [] };
        if (!entry.voters.includes(v.author)) {
          entry.voters.push(v.author);
          entry.counts[c.category] = (entry.counts[c.category] || 0) + 1;
        }
        opinionsByRoot.set(c.target, entry);
        continue;
      }
      if (c.type === 'pollClose' && typeof c.target === 'string') {
        closedRoots.add(`${v.author}|${c.target}`);
        continue;
      }
      if (c.type === 'post' && typeof c.root === 'string') {
        commentsByRoot.set(c.root, (commentsByRoot.get(c.root) || 0) + 1);
      }
    }

    const rootOf = (key) => {
      let cur = key;
      const seen = new Set();
      while (nodes.has(cur) && nodes.get(cur).c.replaces && !seen.has(cur)) {
        seen.add(cur);
        const next = nodes.get(cur).c.replaces;
        if (!nodes.has(next)) break;
        cur = next;
      }
      return cur;
    };

    const tipOf = (root) => {
      let cur = root;
      const seen = new Set();
      while (replaced.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        const next = replaced.get(cur);
        const node = nodes.get(next);
        if (!node || node.author !== nodes.get(cur).author) break;
        cur = next;
      }
      return cur;
    };

    return { tomb, nodes, replaced, votesByRoot, opinionsByRoot, closedRoots, commentsByRoot, rootOf, tipOf };
  };

  const isExpired = (c) => {
    if (!c.deadline) return false;
    const t = Date.parse(c.deadline);
    return Number.isFinite(t) && t <= Date.now();
  };

  const buildPoll = (idx, rootId, viewerId, keys = []) => {
    const tipId = idx.tipOf(rootId);
    const node = idx.nodes.get(tipId);
    if (!node) return null;
    const c = node.c || {};
    let question = clean(c.question);
    let rawOptions = c.options;
    let undecryptable = false;
    if (c.encryptedQuestion) {
      const q = decryptField(c.encryptedQuestion, keys);
      const o = decryptField(c.encryptedOptions, keys);
      if (q === null) undecryptable = true;
      question = q || '';
      try { rawOptions = o ? JSON.parse(o) : []; } catch (_) { rawOptions = []; }
    }
    const options = normalizeOptions(rawOptions);
    const voteMap = idx.votesByRoot.get(rootId) || new Map();

    const counts = {};
    for (const o of options) counts[o] = 0;
    let totalVoters = 0;
    const voters = [];
    let myChoices = [];
    for (const [author, entry] of voteMap.entries()) {
      let choices = Array.isArray(entry.choices) ? entry.choices : [];
      if (entry.encryptedChoices) {
        const plain = decryptField(entry.encryptedChoices, keys);
        try { choices = plain ? JSON.parse(plain) : []; } catch (_) { choices = []; }
      }
      const picked = (Array.isArray(choices) ? choices : []).filter(o => options.includes(o));
      if (!picked.length) continue;
      totalVoters += 1;
      voters.push(author);
      for (const o of picked) counts[o] += 1;
      if (viewerId && author === viewerId) myChoices = picked;
    }

    const closed = idx.closedRoots.has(`${node.author}|${rootId}`) || isExpired(c);
    const op = idx.opinionsByRoot.get(rootId) || { counts: {}, voters: [] };

    return {
      id: rootId,
      rootId,
      tipId,
      author: node.author,
      question,
      options,
      encrypted: !!c.encryptedQuestion,
      undecryptable,
      chatId: c.chatId || null,
      anonymous: c.anonymous === true,
      multiple: c.multiple === true,
      deadline: c.deadline || '',
      tags: normalizeTags(c.tags),
      tribeId: c.tribeId || null,
      houseKey: c.houseKey || null,
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      status: closed ? 'CLOSED' : 'OPEN',
      counts,
      totalVoters,
      voters: c.anonymous === true ? [] : voters,
      votersHidden: c.anonymous === true,
      myChoices,
      hasVoted: myChoices.length > 0,
      commentCount: idx.commentsByRoot.get(rootId) || 0,
      opinions: op.counts,
      opinions_inhabitants: op.voters
    };
  };

  const collect = async (viewerId) => {
    const ssbClient = await openSsb();
    const messages = await getAllMessages(ssbClient);
    const idx = buildIndex(messages);
    const roots = new Set();
    for (const key of idx.nodes.keys()) roots.add(idx.rootOf(key));

    const keyCache = new Map();
    const keysFor = async (c) => {
      if (!c || (!c.chatId && !c.tribeId)) return [];
      const cacheKey = `${c.chatId || ''}|${c.tribeId || ''}`;
      if (keyCache.has(cacheKey)) return keyCache.get(cacheKey);
      const k = await scopeKey({ chatId: c.chatId || null, tribeId: c.tribeId || null });
      const keys = k ? [k] : [];
      keyCache.set(cacheKey, keys);
      return keys;
    };

    const list = [];
    for (const rootId of roots) {
      const tipId = idx.tipOf(rootId);
      if (idx.tomb.has(tipId) || idx.tomb.has(rootId)) continue;
      const node = idx.nodes.get(tipId);
      const keys = await keysFor(node && node.c);
      const poll = buildPoll(idx, rootId, viewerId || ssbClient.id, keys);
      if (!poll) continue;
      if (poll.undecryptable) { list.push(poll); continue; }
      if (!poll.question || poll.options.length < MIN_OPTIONS) continue;
      list.push(poll);
    }
    return { list, idx, viewerId: viewerId || ssbClient.id };
  };

  return {
    POLL_TYPE,
    VOTE_TYPE,
    MAX_OPTIONS,
    MIN_OPTIONS,

    async listAll(filter = 'ALL', opts = {}) {
      const { list, viewerId } = await collect();
      const f = String(filter || 'ALL').toUpperCase();
      const scopeChat = opts.chatId || null;
      const scopeTribe = opts.tribeId || null;
      const scopeHouse = opts.houseKey || null;
      let out = list.filter(p =>
        scopeChat ? p.chatId === scopeChat
          : scopeTribe ? (p.tribeId === scopeTribe && !p.chatId)
            : scopeHouse ? p.houseKey === scopeHouse
              : (!p.tribeId && !p.chatId && !p.houseKey));

      if (f === 'MINE') out = out.filter(p => String(p.author) === String(viewerId));
      else if (f === 'OPEN') out = out.filter(p => p.status === 'OPEN');
      else if (f === 'CLOSED') out = out.filter(p => p.status === 'CLOSED');
      else if (f === 'VOTED') out = out.filter(p => p.hasVoted);
      else if (f === 'FAVORITES') {
        const fav = new Set((opts.favorites || []).map(String));
        out = out.filter(p => fav.has(String(p.id)));
      }

      const q = clean(opts.q).toLowerCase();
      if (q) out = out.filter(p =>
        p.question.toLowerCase().includes(q) ||
        p.options.some(o => o.toLowerCase().includes(q)) ||
        p.tags.some(t => t.toLowerCase().includes(q)));

      if (f === 'TOP') out.sort((a, b) => b.totalVoters - a.totalVoters || new Date(b.createdAt) - new Date(a.createdAt));
      else out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return out;
    },

    async getPollById(id, viewerId = null) {
      const { list, idx } = await collect(viewerId);
      const rootId = idx.rootOf(id);
      const poll = list.find(p => p.id === rootId || p.id === id || p.tipId === id);
      if (!poll) throw new Error('Poll not found');
      return poll;
    },

    async resolveRootId(id) {
      const { idx } = await collect();
      return idx.rootOf(id);
    },

    async createPoll(data = {}) {
      if (isPublic) throw new Error('Not available in public mode');
      const question = clean(data.question);
      if (!question) throw new Error('Question is required');
      const options = normalizeOptions(data.options);
      if (options.length < MIN_OPTIONS) throw new Error(`A poll needs at least ${MIN_OPTIONS} options`);
      const deadline = clean(data.deadline);
      if (deadline) {
        const t = Date.parse(deadline);
        if (!Number.isFinite(t)) throw new Error('Invalid deadline');
        if (t <= Date.now()) throw new Error('Deadline must be in the future');
      }
      const ssbClient = await openSsb();
      const content = {
        type: POLL_TYPE,
        anonymous: data.anonymous === true || data.anonymous === 'true' || data.anonymous === '1',
        multiple: data.multiple === true || data.multiple === 'true' || data.multiple === '1',
        deadline,
        tags: normalizeTags(data.tags),
        createdAt: new Date().toISOString(),
        ...(data.tribeId ? { tribeId: String(data.tribeId) } : {}),
        ...(data.chatId ? { chatId: String(data.chatId) } : {}),
        ...(data.houseKey ? { houseKey: String(data.houseKey) } : {})
      };
      const key = await scopeKey({ chatId: data.chatId, tribeId: data.tribeId });
      if (key && tribeCrypto) {
        content.encryptedQuestion = tribeCrypto.encryptWithKey(question, key);
        content.encryptedOptions = tribeCrypto.encryptWithKey(JSON.stringify(options), key);
      } else {
        content.question = question;
        content.options = options;
      }
      return new Promise((res, rej) => ssbClient.publish(content, (err, msg) => err ? rej(err) : res(msg)));
    },

    async updatePoll(id, data = {}) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const poll = await this.getPollById(id, userId);
      if (poll.author !== userId) throw new Error('Not the author');
      if (poll.status === 'CLOSED') throw new Error('Cannot edit a closed poll');
      if (poll.totalVoters > 0) throw new Error('Cannot edit a poll that already has votes');

      const options = data.options !== undefined ? normalizeOptions(data.options) : poll.options;
      if (options.length < MIN_OPTIONS) throw new Error(`A poll needs at least ${MIN_OPTIONS} options`);
      const deadline = data.deadline !== undefined ? clean(data.deadline) : poll.deadline;
      if (deadline) {
        const t = Date.parse(deadline);
        if (!Number.isFinite(t)) throw new Error('Invalid deadline');
      }
      const question = data.question !== undefined ? clean(data.question) : poll.question;
      const content = {
        type: POLL_TYPE,
        replaces: poll.tipId,
        anonymous: data.anonymous !== undefined
          ? (data.anonymous === true || data.anonymous === 'true' || data.anonymous === '1')
          : poll.anonymous,
        multiple: data.multiple !== undefined
          ? (data.multiple === true || data.multiple === 'true' || data.multiple === '1')
          : poll.multiple,
        deadline,
        tags: data.tags !== undefined ? normalizeTags(data.tags) : poll.tags,
        createdAt: poll.createdAt,
        updatedAt: new Date().toISOString(),
        ...(poll.tribeId ? { tribeId: poll.tribeId } : {}),
        ...(poll.chatId ? { chatId: poll.chatId } : {}),
        ...(poll.houseKey ? { houseKey: poll.houseKey } : {})
      };
      const key = await scopeKey({ chatId: poll.chatId, tribeId: poll.tribeId });
      if (key && tribeCrypto) {
        content.encryptedQuestion = tribeCrypto.encryptWithKey(question, key);
        content.encryptedOptions = tribeCrypto.encryptWithKey(JSON.stringify(options), key);
      } else {
        content.question = question;
        content.options = options;
      }
      return new Promise((res, rej) => ssbClient.publish(content, (err, msg) => err ? rej(err) : res(msg)));
    },

    async vote(id, choicesRaw) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const poll = await this.getPollById(id, userId);
      if (poll.status === 'CLOSED') throw new Error('This poll is closed');

      const wanted = (Array.isArray(choicesRaw) ? choicesRaw : [choicesRaw])
        .map(c => clean(c))
        .filter(c => poll.options.includes(c));
      const unique = [...new Set(wanted)];
      if (!unique.length) throw new Error('Pick at least one option');
      if (!poll.multiple && unique.length > 1) throw new Error('This poll only accepts one option');

      const content = {
        type: VOTE_TYPE,
        target: poll.rootId,
        createdAt: new Date().toISOString(),
        ...(poll.chatId ? { chatId: poll.chatId } : {})
      };
      const key = await scopeKey({ chatId: poll.chatId, tribeId: poll.tribeId });
      if (key && tribeCrypto) content.encryptedChoices = tribeCrypto.encryptWithKey(JSON.stringify(unique), key);
      else content.choices = unique;
      return new Promise((res, rej) => ssbClient.publish(content, (err, msg) => err ? rej(err) : res(msg)));
    },

    async closePoll(id) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const poll = await this.getPollById(id, userId);
      if (poll.author !== userId) throw new Error('Not the author');
      if (poll.status === 'CLOSED') return { status: 'already_closed' };
      const content = { type: 'pollClose', target: poll.rootId, createdAt: new Date().toISOString() };
      await new Promise((res, rej) => ssbClient.publish(content, (err, msg) => err ? rej(err) : res(msg)));
      return { status: 'ok' };
    },

    async deletePoll(id) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const poll = await this.getPollById(id, userId);
      if (poll.author !== userId) throw new Error('Not the author');
      const content = { type: 'tombstone', target: poll.tipId, deletedAt: new Date().toISOString(), author: userId };
      return new Promise((res, rej) => ssbClient.publish(content, (err, msg) => err ? rej(err) : res(msg)));
    },

    async createOpinion(id, category) {
      const categories = require('../backend/opinion_categories');
      if (!categories.includes(category)) throw new Error('Invalid opinion category');
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const poll = await this.getPollById(id, userId);
      if (poll.opinions_inhabitants.includes(userId)) throw new Error('Already opined');
      const content = { type: OPINION_TYPE, target: poll.rootId, category, createdAt: new Date().toISOString() };
      return new Promise((res, rej) => ssbClient.publish(content, (err, result) => err ? rej(err) : res(result)));
    }
  };
};
