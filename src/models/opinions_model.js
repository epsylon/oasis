const pull = require('../server/node_modules/pull-stream');

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const categories = [
    "interesting", "necessary", "funny", "disgusting", "sensible",
    "propaganda", "adultOnly", "boring", "confusing", "inspiring", "spam"
  ];

  const validTypes = [
    'bookmark', 'votes', 'transfer',
    'feed', 'image', 'audio', 'video', 'document'
  ];

  const getPreview = (c) => {
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
      ssbClient.publish(tombstone, (err) => err ? reject(err) : resolve())
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
        ssbClient.createLogStream(),
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
       if (
	  c.opinions &&
	  !tombstoned.has(key) &&
	  !['task', 'event', 'report'].includes(c.type)
	) {
        if (c.replaces) replaces.set(c.replaces, key);
        byId.set(key, {
          key,
          value: {
            ...msg.value,
            preview: getPreview(c)
          }
        });
      }
    }

    for (const replacedId of replaces.keys()) {
      byId.delete(replacedId);
    }

    let filtered = Array.from(byId.values());

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

  const getMessageById = async (id) => {
    const ssbClient = await openSsb();
    return new Promise((resolve, reject) =>
      ssbClient.get(id, (err, msg) => err ? reject(new Error("Error fetching opinion: " + err)) : (!msg?.content ? reject(new Error("Opinion not found")) : resolve(msg)))
    );
  };

  return {
    createVote,
    listOpinions,
    getMessageById,
    categories
  };
};

