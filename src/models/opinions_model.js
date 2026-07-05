const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const categories = require('../backend/opinion_categories');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { buildVoteTally } = require('../backend/vote_tally');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const hasBlob = async (ssbClient, url) => {
    return new Promise(resolve => {
      ssbClient.blobs.has(url, (err, has) => {
        resolve(!err && has);
      });
    });
  };

  const validTypes = [
    'bookmark', 'votes', 'transfer',
    'feed', 'image', 'audio', 'video', 'document', 'torrent'
  ];

  const getPreview = c => {
    if (c.type === 'bookmark' && c.bookmark) return `🔖 ${c.bookmark}`;
    return c.text || c.description || c.title || '';
  };

  const OPINION_MSG_TYPE = {
    bookmark: 'bookmarkOpinion',
    votes: 'votesOpinion',
    transfer: 'transferOpinion',
    feed: 'feedOpinion',
    image: 'imageOpinion',
    audio: 'audioOpinion',
    video: 'videoOpinion',
    document: 'documentOpinion',
    torrent: 'torrentOpinion'
  };

  const createVote = async (contentId, category) => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;
    if (!categories.includes(category)) throw new Error("Invalid voting category.");
    const msg = await new Promise((resolve, reject) =>
      ssbClient.get(contentId, (err, value) => err ? reject(err) : resolve(value))
    );
    if (!msg || !msg.content) throw new Error("Opinion not found.");
    const type = msg.content.type;
    const otype = OPINION_MSG_TYPE[type];
    if (!otype) throw new Error("Voting not allowed on this content type.");
    if (msg.content.opinions_inhabitants?.includes(userId)) throw new Error("Already voted.");
    const content = { type: otype, target: contentId, category, createdAt: new Date().toISOString() };
    return new Promise((resolve, reject) =>
      ssbClient.publish(content, (err, result) => err ? reject(err) : resolve(result))
    );
  };

  const listOpinions = async (filter = 'ALL', category = '') => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;
    const messages = await new Promise((res, rej) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => err ? rej(err) : res(msgs))
      );
    });
    const tombstoned = buildValidatedTombstoneSet(messages);
    const replaces = new Map();
    const byId = new Map();
    const opinionMsgs = [];

    for (const msg of messages) {
      const key = msg.key;
      const c = msg.value?.content;
      if (!c) continue;
      if (c.type === 'tombstone') {
        if (tombstoned.has(c.target)) byId.delete(c.target);
        continue;
      }
      if (typeof c.type === 'string' && c.type.endsWith('Opinion') && c.target) {
        opinionMsgs.push({ target: c.target, author: msg.value.author, category: c.category });
        continue;
      }
      if (c.opinions && !tombstoned.has(key) && !['task', 'event', 'report'].includes(c.type)) {
        if (c.replaces) replaces.set(c.replaces, key);
        byId.set(key, {
          key,
          value: {
            ...msg.value,
            content: c,
            preview: getPreview(c)
          }
        });
      }
      if (c.type === 'feed' && !tombstoned.has(key) && !byId.has(key)) {
        if (c.replaces) replaces.set(c.replaces, key);
        byId.set(key, { key, value: { ...msg.value, content: c, preview: getPreview(c) } });
      }
    }

    for (const [oldId, newId] of Array.from(replaces.entries())) {
      const oldM = byId.get(oldId);
      const newM = byId.get(newId);
      if (!oldM) { replaces.delete(oldId); continue; }
      if (!newM || String(newM.value.author) !== String(oldM.value.author)) {
        replaces.delete(oldId);
        byId.delete(newId);
      }
    }

    for (const replacedId of replaces.keys()) {
      byId.delete(replacedId);
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
    for (const [key, m] of byId.entries()) {
      const agg = opinionByTip.get(key);
      if (!agg) continue;
      const c = m.value.content;
      const mergedVoters = new Set([...(Array.isArray(c.opinions_inhabitants) ? c.opinions_inhabitants : [])]);
      const mergedOpinions = { ...(c.opinions || {}) };
      for (const [cat, n] of Object.entries(agg.opinions)) mergedOpinions[cat] = (mergedOpinions[cat] || 0) + n;
      for (const v of agg.voters) mergedVoters.add(v);
      m.value.content = { ...c, opinions: mergedOpinions, opinions_inhabitants: [...mergedVoters] };
    }

    let filtered = Array.from(byId.values()).filter(m => validTypes.includes(m.value?.content?.type));
    const blobTypes = ['document', 'image', 'audio', 'video'];
    const blobCheckCache = new Map();

    filtered = await Promise.all(
      filtered.map(async m => {
        const c = m.value.content;
        if (blobTypes.includes(c.type) && c.url) {
          if (!blobCheckCache.has(c.url)) {
            const valid = await hasBlob(ssbClient, c.url);
            blobCheckCache.set(c.url, valid);
          }
          if (!blobCheckCache.get(c.url)) return null;
        }
        return m;
      })
    );
    filtered = filtered.filter(Boolean);

    const signatureOf = (m) => {
      const c = m.value?.content || {};
      switch (c.type) {
        case 'document':
        case 'image':
        case 'audio':
        case 'video':
          return `${c.type}::${(c.url || '').trim()}`;
        case 'bookmark': {
          const u = (c.url || c.bookmark || '').trim().toLowerCase();
          return `bookmark::${u}`;
        }
        case 'feed': {
          const t = (c.text || '').replace(/\s+/g, ' ').trim();
          return `feed::${t}`;
        }
        case 'votes': {
          const q = (c.question || '').replace(/\s+/g, ' ').trim();
          return `votes::${q}`;
        }
        case 'transfer': {
          const concept = (c.concept || '').trim();
          const amount = c.amount || '';
          const from = c.from || '';
          const to = c.to || '';
          const deadline = c.deadline || '';
          return `transfer::${concept}|${amount}|${from}|${to}|${deadline}`;
        }
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
    filtered = filtered.map(m => {
      if (m.value?.content?.type !== 'votes') return m;
      const t = voteTally.get(resolveTallyKey(m.key));
      return t ? { ...m, value: { ...m.value, content: { ...m.value.content, ...t } } } : m;
    });

    const bySig = new Map();
    for (const m of filtered) {
      const sig = `${m.value?.author || ''}::${signatureOf(m)}`;
      const prev = bySig.get(sig);
      if (!prev || (m.value?.timestamp || 0) > (prev.value?.timestamp || 0)) {
        bySig.set(sig, m);
      }
    }
    filtered = Array.from(bySig.values());

    if (filter === 'MINE') {
      filtered = filtered.filter(m => m.value.author === userId);
    } else if (filter === 'RECENT') {
      const now = Date.now();
      filtered = filtered.filter(m => now - m.value.timestamp < 24 * 60 * 60 * 1000);
    } else if (filter === 'TOP') {
      filtered = filtered.sort((a, b) => {
        const sum = v => Object.values(v.content.opinions || {}).reduce((acc, x) => acc + x, 0);
        return sum(b.value) - sum(a.value);
      });
    } else if (categories.includes(filter)) {
      filtered = filtered
        .filter(m => m.value.content.opinions?.[filter])
        .sort((a, b) =>
          (b.value.content.opinions[filter] || 0) - (a.value.content.opinions[filter] || 0)
        );
    }

    return filtered;
  };

  const getMessageById = async id => {
    const ssbClient = await openSsb();
    return new Promise((resolve, reject) =>
      ssbClient.get(id, (err, msg) =>
        err ? reject(new Error("Error fetching opinion: " + err)) :
        !msg?.content ? reject(new Error("Opinion not found")) :
        resolve(msg)
      )
    );
  };

  return {
    createVote,
    listOpinions,
    getMessageById,
    categories
  };
};

