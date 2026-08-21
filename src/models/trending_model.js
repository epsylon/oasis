const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;
const opinionCategories = require('../backend/opinion_categories');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { buildVoteTally } = require('../backend/vote_tally');

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
    'image', 'audio', 'video', 'document', 'torrent', 'transfer',
    'industry', 'project', 'report', 'task', 'event', 'shopProduct', 'housing', 'market', 'schoolCourse'
  ];

  const categories = opinionCategories;

  const listTrending = async (filter = 'ALL') => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;

    const messages = await new Promise((res, rej) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, xs) => err ? rej(err) : res(xs))
      );
    });

    const tombstoned = buildValidatedTombstoneSet(messages);
    const replaces = new Map();
    const itemsById = new Map();
    const authorOf = new Map();
    const opinionMsgs = [];

    for (const m of messages) {
      const k = m.key;
      const c = m.value?.content;
      if (!c) continue;

      if (c.type === 'tombstone' && c.target) {
        tombstoned.add(c.target);
        itemsById.delete(c.target);
        continue;
      }

      if (k) authorOf.set(k, m.value?.author);

      if (typeof c.type === 'string' && c.type.endsWith('Opinion') && c.target) {
        opinionMsgs.push({ target: c.target, author: m.value?.author, category: c.category });
        continue;
      }

      if (c.opinions && !tombstoned.has(k) && !['task', 'event', 'report'].includes(c.type)) {
        if (c.replaces) replaces.set(c.replaces, k);
        itemsById.set(k, m);
      }

      if (c.type === 'feed' && !tombstoned.has(k) && !itemsById.has(k)) {
        if (c.replaces) replaces.set(c.replaces, k);
        itemsById.set(k, m);
      }
    }

    for (const [replacedId, newId] of Array.from(replaces.entries())) {
      const oldAuthor = authorOf.get(replacedId);
      const newMsg = itemsById.get(newId);
      if (oldAuthor === undefined) { replaces.delete(replacedId); continue; }
      if (!newMsg || String(newMsg.value?.author) !== String(oldAuthor)) {
        replaces.delete(replacedId);
        itemsById.delete(newId);
        continue;
      }
      itemsById.delete(replacedId);
    }

    const tipToChain = new Map();
    for (const [oldId, newId] of replaces.entries()) {
      let tip = newId; let g = 0;
      while (replaces.has(tip) && g++ < 100000) tip = replaces.get(tip);
      if (!tipToChain.has(tip)) tipToChain.set(tip, new Set([tip]));
      tipToChain.get(tip).add(oldId); tipToChain.get(tip).add(newId);
    }
    const idToTip = new Map();
    for (const [tip, chain] of tipToChain.entries()) for (const id of chain) idToTip.set(id, tip);
    const opinionByTip = new Map();
    for (const op of opinionMsgs) {
      const tip = idToTip.get(op.target) || op.target;
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
    items = Array.from(bySig.values());

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

    const tombstone = {
      type: 'tombstone',
      target: contentId,
      deletedAt: new Date().toISOString(),
      author: userId
    };

    const updated = {
      ...msg.content,
      opinions: {
        ...(msg.content.opinions || {}),
        [category]: ((msg.content.opinions && msg.content.opinions[category]) || 0) + 1
      },
      opinions_inhabitants: inhabitants.concat(userId),
      updatedAt: new Date().toISOString(),
      replaces: contentId
    };

    await new Promise((res, rej) => {
      ssbClient.publish(tombstone, err => err ? rej(err) : res());
    });

    return new Promise((res, rej) => {
      ssbClient.publish(updated, (err, result) => err ? rej(err) : res(result));
    });
  };

  return { listTrending, getMessageById, createVote, types, categories };
};

