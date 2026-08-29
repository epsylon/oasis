const { getConfig } = require('../configs/config-manager.js');
const { readTyped } = require('./typed_log');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const latestByTargetAuthor = (messages) => {
    const latest = new Map();
    for (const m of messages) {
      const c = m?.value?.content;
      if (!c || c.type !== 'subscription' || typeof c.target !== 'string') continue;
      const author = m.value.author;
      const ts = m.value.timestamp || 0;
      const k = `${c.target}::${author}`;
      const prev = latest.get(k);
      if (!prev || ts >= prev.ts) latest.set(k, { ts, target: c.target, scope: String(c.scope || ''), author, on: c.on !== false });
    }
    return latest;
  };

  return {
    async setSubscription(target, scope, on) {
      const ssbClient = await openSsb();
      if (typeof target !== 'string' || !target.trim()) throw new Error('Invalid target');
      const content = {
        type: 'subscription',
        target: target.trim(),
        scope: String(scope || '').trim().slice(0, 32),
        on: on !== false,
        updatedAt: new Date().toISOString()
      };
      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => (e ? rej(e) : res(m))));
    },

    async isSubscribed(target) {
      const ssbClient = await openSsb();
      const messages = await readTyped(ssbClient, ['subscription'], { limit: logLimit });
      const latest = latestByTargetAuthor(messages);
      const mine = latest.get(`${target}::${ssbClient.id}`);
      return !!(mine && mine.on);
    },

    async listSubscribers(target) {
      const ssbClient = await openSsb();
      const messages = await readTyped(ssbClient, ['subscription'], { limit: logLimit });
      const latest = latestByTargetAuthor(messages);
      const out = [];
      for (const entry of latest.values()) {
        if (entry.target === target && entry.on) out.push(entry.author);
      }
      return Array.from(new Set(out));
    },

    async mySubscriptions() {
      const ssbClient = await openSsb();
      const messages = await readTyped(ssbClient, ['subscription'], { limit: logLimit });
      const latest = latestByTargetAuthor(messages);
      const out = [];
      for (const entry of latest.values()) {
        if (entry.author === ssbClient.id && entry.on) out.push({ target: entry.target, scope: entry.scope });
      }
      return out;
    },

    async subscriberCounts(targets) {
      const ssbClient = await openSsb();
      const messages = await readTyped(ssbClient, ['subscription'], { limit: logLimit });
      const latest = latestByTargetAuthor(messages);
      const counts = new Map();
      for (const t of targets || []) counts.set(t, 0);
      const mine = new Set();
      for (const entry of latest.values()) {
        if (!counts.has(entry.target) || !entry.on) continue;
        counts.set(entry.target, counts.get(entry.target) + 1);
        if (entry.author === ssbClient.id) mine.add(entry.target);
      }
      return { counts, mine };
    }
  };
};
