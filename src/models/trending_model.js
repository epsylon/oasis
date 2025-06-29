const pull = require('../server/node_modules/pull-stream');

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const types = [
    'bookmark', 'event', 'task', 'votes', 'report', 'feed',
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
        ssbClient.createLogStream(),
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
      if (c.opinions) {
        if (tombstoned.has(k)) continue;
        if (c.replaces) replaces.set(c.replaces, k);
        itemsById.set(k, m);
      }
    }

    for (const replacedId of replaces.keys()) {
      itemsById.delete(replacedId);
    }

    let items = Array.from(itemsById.values());

    if (filter === 'MINE') {
      items = items.filter(m => m.value.author === userId);
    } else if (filter === 'RECENT') {
      const now = Date.now();
      items = items.filter(m => now - m.value.timestamp < 24 * 60 * 60 * 1000);
    }

    if (types.includes(filter)) {
      items = items.filter(m => m.value.content.type === filter);
    }

    if (filter !== 'ALL') {
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
      ssbClient.get(id, (err, msg) => {
        if (err) rej(err);
        else res(msg);
      });
    });
  };

  const createVote = async (contentId, category) => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;

    if (!categories.includes(category)) throw new Error('Invalid voting category');

    const msg = await getMessageById(contentId);
    if (!msg || !msg.content) throw new Error('Content not found');

    const type = msg.content.type;
    if (!types.includes(type)) throw new Error('Invalid content type for voting');

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
      ssbClient.publish(tombstone, (err) => err ? rej(err) : res());
    });

    return new Promise((res, rej) => {
      ssbClient.publish(updated, (err, result) => err ? rej(err) : res(result));
    });
  };

  return { listTrending, getMessageById, createVote, types, categories };
};

