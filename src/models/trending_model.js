const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;
const opinionCategories = require('../backend/opinion_categories');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { readTyped, CONTENT_TYPES, requestScope } = require('./typed_log');
const { buildVoteTally } = require('../backend/vote_tally');
const { versionGroups, versionEntry } = require('../backend/dedupe');

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const hasBlob = async (ssbClient, url) => {
    return new Promise(resolve => {
      ssbClient.blobs.has(url, (err, has) => resolve(!err && has));
    });
  };

  const types = [
    'bookmark', 'votes', 'poll', 'feed',
    'image', 'audio', 'video', 'document', 'torrent', 'file', 'transfer',
    'industry', 'project', 'report', 'task', 'event', 'shopProduct', 'housing', 'market', 'schoolCourse',
    'podcast', 'podcastEpisode', 'campaign', 'logisticsRoute'
  ];

  const categories = opinionCategories;

  const computeBase = async () => {
    const ssbClient = await openSsb();
    const messages = await readTyped(ssbClient, CONTENT_TYPES, { limit: logLimit, withWindow: true });

    const tombstoned = buildValidatedTombstoneSet(messages);
    const itemsById = new Map();
    const opinionMsgs = [];

    for (const m of messages) {
      const k = m.key;
      const c = m.value?.content;
      if (!c) continue;

      if (c.type === 'tombstone') continue;

      if (typeof c.type === 'string' && c.type.endsWith('Opinion') && c.target) {
        opinionMsgs.push({ target: c.target, author: m.value?.author, category: c.category });
        continue;
      }

      if (c.opinions && !['task', 'event', 'report'].includes(c.type)) itemsById.set(k, m);

      if (c.type === 'feed' && !itemsById.has(k)) itemsById.set(k, m);
    }

    const vg = versionGroups(Array.from(itemsById.values()).map(versionEntry));
    for (const k of Array.from(itemsById.keys())) {
      if (!vg.roots.has(vg.rootOf(k)) || vg.tipOf(k) !== k || tombstoned.has(k)) itemsById.delete(k);
    }

    const opinionByTip = new Map();
    for (const op of opinionMsgs) {
      const tip = vg.tipOf(op.target);
      if (!opinionByTip.has(tip)) opinionByTip.set(tip, { opinions: {}, voters: new Set() });
      const agg = opinionByTip.get(tip);
      if (agg.voters.has(op.author)) continue;
      agg.voters.add(op.author);
      if (op.category) agg.opinions[op.category] = (agg.opinions[op.category] || 0) + 1;
    }
    for (const [k, m] of Array.from(itemsById.entries())) {
      const agg = opinionByTip.get(k);
      if (!agg) continue;
      const c = m.value?.content || {};
      const mergedVoters = new Set([...(Array.isArray(c.opinions_inhabitants) ? c.opinions_inhabitants : [])]);
      const mergedOpinions = { ...(c.opinions || {}) };
      for (const [cat, n] of Object.entries(agg.opinions)) mergedOpinions[cat] = (mergedOpinions[cat] || 0) + n;
      for (const v of agg.voters) mergedVoters.add(v);
      itemsById.set(k, { ...m, value: { ...m.value, content: { ...c, opinions: mergedOpinions, opinions_inhabitants: [...mergedVoters] } } });
    }

    let rawItems = Array.from(itemsById.values()).filter(m => types.includes(m.value?.content?.type));
    rawItems = rawItems.filter(m => {
      const c = m.value?.content;
      if (c?.type !== 'schoolCourse') return true;
      if (c.encryptedPayload) return false;
      return String(c.visibility || 'PUBLIC').toUpperCase() !== 'INVITE';
    });
    const blobTypes = ['document', 'image', 'audio', 'video'];

    let items = await Promise.all(
      rawItems.map(async m => {
        const c = m.value?.content;
        if (blobTypes.includes(c.type) && c.url) {
          const valid = await hasBlob(ssbClient, c.url);
          if (!valid) return null;
        }
        return m;
      })
    );
    items = items.filter(Boolean);

    const signatureOf = (m) => {
      const c = m.value?.content || {};
      switch (c.type) {
        case 'document':
        case 'image':
        case 'audio':
        case 'video':
          return `${c.type}::${(c.url || '').trim()}`;
        case 'bookmark':
          return `bookmark::${(c.url || '').trim().toLowerCase()}`;
        case 'feed':
          return `feed::${(c.text || '').replace(/\s+/g, ' ').trim()}`;
        case 'votes':
        case 'poll':
          return `${c.type}::${(c.question || '').replace(/\s+/g, ' ').trim()}`;
        case 'transfer':
          return `transfer::${(c.concept || '')}|${c.amount || ''}|${c.from || ''}|${c.to || ''}|${c.deadline || ''}`;
        default:
          return `key::${m.key}`;
      }
    };

    const voteTally = buildVoteTally(messages);
    const votesPrev = new Map();
    for (const m of messages) {
      const c = m.value?.content;
      if (c && c.type === 'votes' && typeof c.replaces === 'string') votesPrev.set(m.key, c.replaces);
    }
    const resolveTallyKey = (k) => {
      let cur = k;
      let g = 0;
      while (g++ < 1000 && !voteTally.has(cur) && votesPrev.has(cur)) cur = votesPrev.get(cur);
      return cur;
    };
    items = items.map(m => {
      if (m.value?.content?.type !== 'votes') return m;
      const t = voteTally.get(resolveTallyKey(m.key));
      return t ? { ...m, value: { ...m.value, content: { ...m.value.content, ...t } } } : m;
    });

    const bySig = new Map();
    for (const m of items) {
      const sig = signatureOf(m);
      const prev = bySig.get(sig);
      if (!prev || (m.value?.timestamp || 0) > (prev.value?.timestamp || 0)) {
        bySig.set(sig, m);
      }
    }
    return Array.from(bySig.values());
  };

  const baseItems = () => {
    const store = requestScope.getStore();
    if (store && store.trendingBase) return store.trendingBase;
    const pending = computeBase();
    if (store) store.trendingBase = pending;
    return pending;
  };

  const listTrending = async (filter = 'ALL') => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;
    let items = (await baseItems()).slice();

    if (filter === 'MINE') {
      items = items.filter(m => m.value.author === userId);
    } else if (filter === 'RECENT') {
      const now = Date.now();
      items = items.filter(m => now - m.value.timestamp < 24 * 60 * 60 * 1000);
    }

    if (types.includes(filter)) {
      items = items.filter(m => m.value.content.type === filter);
    }

    items = items.filter(m => (m.value.content.opinions_inhabitants || []).length > 0);

    if (filter === 'TOP') {
      items.sort((a, b) => {
        const aLen = (a.value.content.opinions_inhabitants || []).length;
        const bLen = (b.value.content.opinions_inhabitants || []).length;
        if (bLen !== aLen) return bLen - aLen;
        return b.value.timestamp - a.value.timestamp;
      });
    } else {
      items.sort((a, b) => {
        const aLen = (a.value.content.opinions_inhabitants || []).length;
        const bLen = (b.value.content.opinions_inhabitants || []).length;
        return bLen - aLen;
      });
    }

    return { filtered: items };
  };

  const getMessageById = async (id) => {
    const ssbClient = await openSsb();
    return new Promise((res, rej) => {
      ssbClient.get(id, (err, msg) => err ? rej(err) : res(msg));
    });
  };

  const createVote = async (contentId, category) => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;

    if (!categories.includes(category)) throw new Error('Invalid voting category');

    const msg = await getMessageById(contentId);
    if (!msg || !msg.content) throw new Error('Content not found');

    const type = msg.content.type;
    if (!types.includes(type) || ['task', 'event', 'report'].includes(type)) {
      throw new Error('Voting not allowed on this content type');
    }

    const inhabitants = Array.isArray(msg.content.opinions_inhabitants) ? msg.content.opinions_inhabitants : [];
    if (inhabitants.includes(userId)) throw new Error('Already voted');
    const otype = categories.messageTypes[type];
    if (!otype) throw new Error('Voting not allowed on this content type');

    const content = { type: otype, target: contentId, category, createdAt: new Date().toISOString() };
    return new Promise((res, rej) => {
      ssbClient.publish(content, (err, result) => err ? rej(err) : res(result));
    });
  };

  return { listTrending, getMessageById, createVote, types, categories };
};

