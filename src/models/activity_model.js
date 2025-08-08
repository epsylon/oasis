const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const N = s => String(s || '').toUpperCase().replace(/\s+/g, '_');
const ORDER_MARKET = ['FOR_SALE','OPEN','RESERVED','CLOSED','SOLD'];
const SCORE_MARKET = s => {
  const i = ORDER_MARKET.indexOf(N(s));
  return i < 0 ? -1 : i;
};

module.exports = ({ cooler }) => {
  let ssb;

  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const hasBlob = async (ssbClient, url) => {
    return new Promise((resolve) => {
      ssbClient.blobs.has(url, (err, has) => {
        resolve(!err && has);
      });
    });
  };

  return {
    async listFeed(filter = 'all') {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      const results = await new Promise((resolve, reject) => {
        pull(
          ssbClient.createLogStream({ reverse: true, limit: logLimit }),
          pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
        );
      });

      const tombstoned = new Set();
      const parentOf = new Map();
      const idToAction = new Map();

      for (const msg of results) {
        const k = msg.key;
        const v = msg.value;
        const c = v?.content;
        if (!c?.type) continue;
        if (c.type === 'tombstone' && c.target) {
          tombstoned.add(c.target);
          continue;
        }
        idToAction.set(k, {
          id: k,
          author: v?.author,
          ts: v?.timestamp || 0,
          type: c.type,
          content: c
        });
        if (c.replaces) parentOf.set(k, c.replaces);
      }

      const rootOf = (id) => {
        let cur = id;
        while (parentOf.has(cur)) cur = parentOf.get(cur);
        return cur;
      };

      const groups = new Map();
      for (const [id, action] of idToAction.entries()) {
        const root = rootOf(id);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(action);
      }

      const idToTipId = new Map();

      for (const [root, arr] of groups.entries()) {
        if (!arr.length) continue;
        const type = arr[0].type;

        let tip;
        if (type === 'market') {
          tip = arr[0];
          let bestScore = SCORE_MARKET(tip.content.status);
          for (const a of arr) {
            const s = SCORE_MARKET(a.content.status);
            if (s > bestScore || (s === bestScore && a.ts > tip.ts)) {
              tip = a;
              bestScore = s;
            }
          }
        } else {
          tip = arr.reduce((best, a) => (a.ts > best.ts ? a : best), arr[0]);
        }

        if (tombstoned.has(tip.id)) {
          const nonTomb = arr.filter(a => !tombstoned.has(a.id));
          if (!nonTomb.length) continue;
          tip = nonTomb.reduce((best, a) => (a.ts > best.ts ? a : best), nonTomb[0]);
        }

        for (const a of arr) idToTipId.set(a.id, tip.id);
      }

    const latest = [];
    for (const a of idToAction.values()) {
      if (tombstoned.has(a.id)) continue;
      const c = a.content || {};
      if (c.root && tombstoned.has(c.root)) continue;
      if (a.type === 'vote' && tombstoned.has(c.vote?.link)) continue;
      if (c.key && tombstoned.has(c.key)) continue;
      if (c.branch && tombstoned.has(c.branch)) continue;
      if (c.target && tombstoned.has(c.target)) continue;

      if (a.type === 'document') {
        const url = c.url;
        const ok = await hasBlob(ssbClient, url);
        if (!ok) continue;
      }
      latest.push({ ...a, tipId: idToTipId.get(a.id) || a.id });
    }

      let out;
      if (filter === 'mine') {
        out = latest.filter(a => a.author === userId);
      } else if (filter === 'recent') {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        out = latest.filter(a => (a.ts || 0) >= cutoff);
      } else if (filter === 'all') {
        out = latest;
      } else {
        out = latest.filter(a => a.type === filter);
      }

      out.sort((a, b) => (b.ts || 0) - (a.ts || 0));

      return out;
    }
  };
};

