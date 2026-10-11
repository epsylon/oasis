const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { readTyped } = require('./typed_log');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const PIXELIA_TYPES = ['pixelia', 'tombstone'];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const pixelCoordinate = (c) => {
  if (!Number.isInteger(c.x) || !Number.isInteger(c.y) || c.x < 0 || c.x > 49 || c.y < 0 || c.y > 199) return null;
  const key = `${c.x + 1}:${c.y + 1}`;
  if (c.coordinateKey != null && c.coordinateKey !== key) return null;
  return key;
};

const resolvePixels = (messages) => {
  const tombstoned = buildValidatedTombstoneSet(messages);
  const byKey = new Map();

  for (const m of messages) {
    const c = m.value?.content;
    if (!c || c.type !== 'pixelia' || !m.key) continue;
    const coordinateKey = pixelCoordinate(c);
    if (!coordinateKey || typeof c.color !== 'string' || !COLOR_RE.test(c.color)) continue;
    byKey.set(m.key, { m, coordinateKey });
  }

  const replaced = new Set();
  for (const { m, coordinateKey } of byKey.values()) {
    const prev = byKey.get(m.value.content.replaces);
    if (prev && prev.coordinateKey === coordinateKey) replaced.add(prev.m.key);
  }

  const latest = new Map();
  for (const [k, { m, coordinateKey }] of byKey) {
    if (replaced.has(k) || tombstoned.has(k)) continue;
    const cur = latest.get(coordinateKey);
    const ts = m.value.timestamp || 0;
    const curTs = cur ? cur.value.timestamp || 0 : 0;
    if (!cur || ts > curTs || (ts === curTs && k > cur.key)) latest.set(coordinateKey, m);
  }

  return latest;
};

module.exports = ({ cooler }) => {
  let ssb;

  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const getPixelByCoordinate = async (coordinateKey) => {
    const ssbClient = await openSsb();
    const messages = await readTyped(ssbClient, PIXELIA_TYPES, { limit: logLimit });
    return resolvePixels(messages).get(coordinateKey) || null;
  };

  const paintPixel = async (x, y, color) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || x > 50 || y < 1 || y > 200) {
      throw new Error('Coordinates out of bounds. Please use x (1-50) and y (1-200)');
    }
    if (typeof color !== 'string' || !COLOR_RE.test(color)) throw new Error('Invalid color');

    const ssbClient = await openSsb();
    const userId = ssbClient.id;
    const coordinateKey = `${x}:${y}`;
    const existingPixel = await getPixelByCoordinate(coordinateKey);

    if (existingPixel && existingPixel.value.author === userId) {
      const tombstone = {
        type: 'tombstone',
        target: existingPixel.key,
        deletedAt: new Date().toISOString()
      };
      await new Promise((resolve, reject) =>
        ssbClient.publish(tombstone, err => err ? reject(err) : resolve())
      );
    }

    const contributors = Array.isArray(existingPixel?.value?.content?.contributors_inhabitants) ? existingPixel.value.content.contributors_inhabitants : [];
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
    const messages = await readTyped(ssbClient, PIXELIA_TYPES, { limit: logLimit });

    return Array.from(resolvePixels(messages).values()).map(m => ({
      x: m.value.content.x + 1,
      y: m.value.content.y + 1,
      color: m.value.content.color,
      author: m.value.author,
      contributors_inhabitants: [...new Set([...(Array.isArray(m.value.content.contributors_inhabitants) ? m.value.content.contributors_inhabitants : []).filter(id => typeof id === 'string'), m.value.author])],
      timestamp: m.value.timestamp
    }));
  };

  return {
    paintPixel,
    listPixels
  };
};
