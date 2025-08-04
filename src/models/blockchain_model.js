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
    async listBlockchain(filter = 'all') {
      const ssbClient = await openSsb();

      const results = await new Promise((resolve, reject) => {
        pull(
          ssbClient.createLogStream({ reverse: true, limit: 1000 }),
          pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
        );
      });

      const tombstoned = new Set();
      const replaces = new Map();
      const blocks = new Map();

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
        blocks.set(k, { id: k, author, ts: msg.value.timestamp, type: c.type, content: c });
      }

      for (const oldId of replaces.keys()) blocks.delete(oldId);
      for (const t of tombstoned) blocks.delete(t);

      const blockData = await Promise.all(
        Array.from(blocks.values()).map(async (block) => {
          if (block.type === 'document') {
            const url = block.content.url;
            const validBlob = await hasBlob(ssbClient, url);
            if (!validBlob) return null;
          }
          return block;
        })
      );

      if (filter === 'RECENT') {
        const now = Date.now();
        return blockData.filter(block => now - block.ts <= 24 * 60 * 60 * 1000);
      }

      if (filter === 'MINE') {
        const userId = SSBconfig.config.keys.id;
        return blockData.filter(block => block.author === userId);
      }

      return blockData.filter(Boolean);
    },

    async getBlockById(id) {
      const ssbClient = await openSsb();
      return await new Promise((resolve, reject) => {
        pull(
          ssbClient.createLogStream({ reverse: true, limit: 1000 }),
          pull.find((msg) => msg.key === id, async (err, msg) => {
            if (err || !msg) return resolve(null);
            const c = msg.value?.content;
            if (!c?.type) return resolve(null);
            if (c.type === 'document') {
              const url = c.url;
              const validBlob = await hasBlob(ssbClient, url);
              if (!validBlob) return resolve(null);
            }

            resolve({
              id: msg.key,
              author: msg.value?.author,
              ts: msg.value?.timestamp,
              type: c.type,
              content: c
            });
          })
        );
      });
    }
  };
};

