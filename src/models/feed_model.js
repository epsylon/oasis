const pull = require('../server/node_modules/pull-stream');

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const createFeed = async (text) => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;
    if (typeof text !== 'string' || text.length > 280) throw new Error("Text too long");
    const content = {
      type: 'feed',
      text,
      author: userId,
      createdAt: new Date().toISOString(),
      opinions: {},
      opinions_inhabitants: [],
      refeeds: 0,
      refeeds_inhabitants: []
    };
    return new Promise((resolve, reject) => {
      ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg));
    });
  };

  const createRefeed = async (contentId) => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;
    const msg = await new Promise((resolve, reject) => {
      ssbClient.get(contentId, (err, value) => {
        if (err) return reject(err);
        resolve(value);
      });
    });
    if (!msg || !msg.content || msg.content.type !== 'feed') throw new Error("Invalid feed");
    if (msg.content.refeeds_inhabitants?.includes(userId)) throw new Error("Already refeeded");
    const tombstone = { type: 'tombstone', target: contentId, deletedAt: new Date().toISOString() };
    const updated = {
      ...msg.content,
      refeeds: (msg.content.refeeds || 0) + 1,
      refeeds_inhabitants: [...(msg.content.refeeds_inhabitants || []), userId],
      updatedAt: new Date().toISOString(),
      replaces: contentId
    };
    await new Promise((res, rej) => ssbClient.publish(tombstone, err => err ? rej(err) : res()));
    return new Promise((resolve, reject) => {
      ssbClient.publish(updated, (err2, msg) => err2 ? reject(err2) : resolve(msg));
    });
  };

  const addOpinion = async (contentId, category) => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;
    const msg = await ssbClient.get(contentId);
    if (!msg || !msg.content || msg.content.type !== 'feed') throw new Error("Invalid feed");
    if (msg.content.opinions_inhabitants?.includes(userId)) throw new Error("Already voted");
    const tombstone = { type: 'tombstone', target: contentId, deletedAt: new Date().toISOString() };
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
    await new Promise((res, rej) => ssbClient.publish(tombstone, err => err ? rej(err) : res()));
    return new Promise((resolve, reject) => {
      ssbClient.publish(updated, (err2, result) => err2 ? reject(err2) : resolve(result));
    });
  };

  const listFeeds = async (filter = 'ALL') => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;
    const now = Date.now();
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
      const c = msg.value?.content;
      const k = msg.key;
      if (!c) continue;
      if (c.type === 'tombstone' && c.target) {
        tombstoned.add(c.target);
        continue;
      }
      if (c.type === 'feed') {
        if (tombstoned.has(k)) continue;
        if (c.replaces) replaces.set(c.replaces, k);
        byId.set(k, msg);
      }
    }

    for (const replaced of replaces.keys()) {
      byId.delete(replaced);
    }

    let feeds = Array.from(byId.values());
    const seenTexts = new Map();
	for (const feed of feeds) {
	  const text = feed.value.content.text;
	  const existing = seenTexts.get(text);
	  if (!existing || feed.value.timestamp > existing.value.timestamp) {
	    seenTexts.set(text, feed);
	  }
	}
    feeds = Array.from(seenTexts.values());

    if (filter === 'MINE') {
      feeds = feeds.filter(m => m.value.content.author === userId);
    } else if (filter === 'TODAY') {
      feeds = feeds.filter(m => now - m.value.timestamp < 86400000);
    } else if (filter === 'TOP') {
      feeds = feeds.sort((a, b) => {
        const aVotes = Object.values(a.value.content.opinions || {}).reduce((sum, x) => sum + x, 0);
        const bVotes = Object.values(b.value.content.opinions || {}).reduce((sum, x) => sum + x, 0);
        return bVotes - aVotes;
      });
    }

    return feeds;
  };

  return {
    createFeed,
    createRefeed,
    addOpinion,
    listFeeds
  };
};
