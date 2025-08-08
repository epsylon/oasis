const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
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

  const types = [
    'bookmark', 'votes', 'feed',
    'image', 'audio', 'video', 'document', 'transfer'
  ];

  const categories = [
    'interesting', 'necessary', 'funny', 'disgusting', 'sensible',
    'propaganda', 'adultOnly', 'boring', 'confusing', 'inspiring', 'spam'
  ];

  const listTrending = async (filter = 'ALL') => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;
    const messages = await new Promise((res, rej) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, xs) => err ? rej(err) : res(xs))
      );
    });

    const tombstoned = new Set();
    const replaces = new Map();
    const itemsById = new Map();

    for (const m of messages) {
      const k = m.key;
      const c = m.value?.content;
      if (!c) continue;
      if (c.type === 'tombstone' && c.target) {
        tombstoned.add(c.target);
        continue;
      }
      if (c.opinions && !tombstoned.has(k) && !['task', 'event', 'report'].includes(c.type)) {
        if (c.replaces) replaces.set(c.replaces, k);
        itemsById.set(k, m);
      }
    }

    for (const replacedId of replaces.keys()) {
      itemsById.delete(replacedId);
    }

    let rawItems = Array.from(itemsById.values());
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
       return `votes::${(c.question || '').replace(/\s+/g, ' ').trim()}`;
      case 'transfer':
        return `transfer::${(c.concept || '')}|${c.amount || ''}|${c.from || ''}|${c.to || ''}|${c.deadline || ''}`;
      default:
        return `key::${m.key}`;
    }
    };
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

    if (filter !== 'ALL' && !types.includes(filter)) {
      items = items.filter(m => (m.value.content.opinions_inhabitants || []).length > 0);
    }

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

  const getMessageById = async id => {
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
    if (msg.content.opinions_inhabitants?.includes(userId)) throw new Error('Already voted');

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

    await new Promise((res, rej) => {
      ssbClient.publish(tombstone, err => err ? rej(err) : res());
    });

    return new Promise((res, rej) => {
      ssbClient.publish(updated, (err, result) => err ? rej(err) : res(result));
    });
  };

  return { listTrending, getMessageById, createVote, types, categories };
};

