const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const categories = require('../backend/opinion_categories');
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
    'feed', 'image', 'audio', 'video', 'document'
  ];

  const getPreview = c => {
    if (c.type === 'bookmark' && c.bookmark) return `🔖 ${c.bookmark}`;
    return c.text || c.description || c.title || '';
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
    if (!validTypes.includes(type) || ['task', 'event', 'report'].includes(type)) {
      throw new Error("Voting not allowed on this content type.");
    }
    if (msg.content.opinions_inhabitants?.includes(userId)) throw new Error("Already voted.");
    const tombstone = {
      type: 'tombstone',
      target: contentId,
      deletedAt: new Date().toISOString()
    };
    const updated = {
      ...msg.content,
      opinions: {
        ...msg.content.opinions,
        [category]: (msg.content.opinions?.[category] || 0) + 1
      },
      opinions_inhabitants: [...(msg.content.opinions_inhabitants || []), userId],
      updatedAt: new Date().toISOString(),
      replaces: contentId
    };
    await new Promise((resolve, reject) =>
      ssbClient.publish(tombstone, err => err ? reject(err) : resolve())
    );
    return new Promise((resolve, reject) =>
      ssbClient.publish(updated, (err, result) => err ? reject(err) : resolve(result))
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
    const tombstoned = new Set();
    const replaces = new Map();
    const byId = new Map();

    for (const msg of messages) {
      const key = msg.key;
      const c = msg.value?.content;
      if (!c) continue;
      if (c.type === 'tombstone' && c.target) {
        tombstoned.add(c.target);
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
    }

    for (const replacedId of replaces.keys()) {
      byId.delete(replacedId);
    }

    let filtered = Array.from(byId.values());
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

    const bySig = new Map();
    for (const m of filtered) {
      const sig = signatureOf(m);
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

