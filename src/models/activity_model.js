const pull = require('../server/node_modules/pull-stream');

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
          ssbClient.createLogStream({ reverse: true, limit: 1000 }),
          pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
        );
      });

      const tombstoned = new Set();
      const replaces = new Map();
      const latest = new Map();

      for (const msg of results) {
        const k = msg.key;
        const c = msg.value?.content;
        const author = msg.value?.author;
        if (!c?.type) continue;
        if (c.type === 'tombstone' && c.target) {
          tombstoned.add(c.target);
          continue;
        }
        if (c.replaces) replaces.set(c.replaces, k);
        latest.set(k, { id: k, author, ts: msg.value.timestamp, type: c.type, content: c });
      }

      for (const oldId of replaces.keys()) latest.delete(oldId);
      for (const t of tombstoned) latest.delete(t);

      const actions = await Promise.all(
        Array.from(latest.values()).map(async (a) => {
          if (a.type === 'document') {
            const url = a.content.url;
            const validBlob = await hasBlob(ssbClient, url);
            if (!validBlob) return null;
          }
          if (
            a.type !== 'tombstone' &&
            !tombstoned.has(a.id) &&
            !(a.content?.root && tombstoned.has(a.content.root)) &&
            !(a.type === 'vote' && tombstoned.has(a.content.vote.link))
          ) {
            return a;
          }
          return null;
        })
      );
      const validActions = actions.filter(Boolean);
      if (filter === 'mine')
        return validActions
          .filter(a => a.author === userId)
          .sort((a, b) => b.ts - a.ts);

      return validActions.sort((a, b) => b.ts - a.ts);
    }
  };
};
