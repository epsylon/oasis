const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler }) => {
  let ssb;

  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const getPixelByCoordinate = async (coordinateKey) => {
    const ssbClient = await openSsb();
    const messages = await new Promise((res, rej) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => err ? rej(err) : res(msgs))
      );
    });

    const tombstoned = new Set(
      messages
        .filter(m => m.value?.content?.type === 'tombstone' && m.value?.content?.target)
        .map(m => m.value.content.target)
    );

    const replaces = new Map();
    const byId = new Map();

    for (const m of messages) {
      const c = m.value?.content;
      const k = m.key;
      if (!c || c.type !== 'pixelia' || c.coordinateKey !== coordinateKey) continue;
      if (tombstoned.has(k)) continue;
      if (c.replaces) replaces.set(c.replaces, k);
      byId.set(k, m);
    }

    for (const r of replaces.keys()) {
      byId.delete(r);
    }

    return [...byId.values()][0] || null;
  };

  const paintPixel = async (x, y, color) => {
    if (x < 1 || x > 50 || y < 1 || y > 200) {
      throw new Error('Coordinates out of bounds. Please use x (1-50) and y (1-200)');
    }

    const ssbClient = await openSsb();
    const userId = ssbClient.id;
    const coordinateKey = `${x}:${y}`;
    const existingPixel = await getPixelByCoordinate(coordinateKey);

    if (existingPixel) {
      const tombstone = {
        type: 'tombstone',
        target: existingPixel.key,
        deletedAt: new Date().toISOString()
      };
      await new Promise((resolve, reject) =>
        ssbClient.publish(tombstone, err => err ? reject(err) : resolve())
      );
    }

    const contributors = existingPixel?.value?.content?.contributors_inhabitants || [];
    const contributors_inhabitants = contributors.includes(userId)
      ? contributors
      : [...contributors, userId];

    const content = {
      type: 'pixelia',
      x: x - 1,
      y: y - 1,
      color,
      author: userId,
      contributors_inhabitants,
      timestamp: Date.now(),
      coordinateKey,
      replaces: existingPixel?.key || null
    };

    await new Promise((resolve, reject) => {
      ssbClient.publish(content, (err) => err ? reject(err) : resolve());
    });
  };

  const listPixels = async () => {
    const ssbClient = await openSsb();
    const messages = await new Promise((res, rej) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => err ? rej(err) : res(msgs))
      );
    });

    const tombstoned = new Set();
    const replaces = new Map();
    const byKey = new Map();

    for (const m of messages) {
      const c = m.value?.content;
      const k = m.key;
      if (!c) continue;
      if (c.type === 'tombstone' && c.target) {
        tombstoned.add(c.target);
        continue;
      }
      if (c.type === 'pixelia') {
        if (tombstoned.has(k)) continue;
        if (c.replaces) replaces.set(c.replaces, k);
        byKey.set(k, m);
      }
    }

    for (const replaced of replaces.keys()) {
      byKey.delete(replaced);
    }

    return Array.from(byKey.values()).map(m => ({
      x: m.value.content.x + 1,
      y: m.value.content.y + 1,
      color: m.value.content.color,
      author: m.value.content.author,
      contributors_inhabitants: m.value.content.contributors_inhabitants || [],
      timestamp: m.value.timestamp
    }));
  };

  return {
    paintPixel,
    listPixels
  };
};
