const pull = require('../server/node_modules/pull-stream');

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  return {
    async createVideo(blobMarkdown, tagsRaw, title, description) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const match = blobMarkdown?.match(/\(([^)]+)\)/);
      const blobId = match ? match[1] : blobMarkdown;
      const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
      const content = {
        type: 'video',
        url: blobId,
        createdAt: new Date().toISOString(),
        author: userId,
        tags,
        title: title || '',
        description: description || '',
        opinions: {},
        opinions_inhabitants: []
      };
      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res));
      });
    },

    async updateVideoById(id, blobMarkdown, tagsRaw, title, description) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, oldMsg) => {
          if (err || !oldMsg || oldMsg.content?.type !== 'video') return reject(new Error('Video not found'));
          if (Object.keys(oldMsg.content.opinions || {}).length > 0) return reject(new Error('Cannot edit video after it has received opinions.'));
          if (oldMsg.content.author !== userId) return reject(new Error('Not the author'));
          const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : oldMsg.content.tags;
          const match = blobMarkdown?.match(/\(([^)]+)\)/);
          const blobId = match ? match[1] : blobMarkdown;
          const tombstone = {
            type: 'tombstone',
            target: id,
            deletedAt: new Date().toISOString(),
            author: userId
          };
          const updated = {
            ...oldMsg.content,
            url: blobId || oldMsg.content.url,
            tags,
            title: title || '',
            description: description || '',
            updatedAt: new Date().toISOString(),
            replaces: id
          };
          ssbClient.publish(tombstone, err => {
            if (err) return reject(err);
            ssbClient.publish(updated, (err2, result) => err2 ? reject(err2) : resolve(result));
          });
        });
      });
    },

    async deleteVideoById(id) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'video') return reject(new Error('Video not found'));
          if (msg.content.author !== userId) return reject(new Error('Not the author'));
          const tombstone = {
            type: 'tombstone',
            target: id,
            deletedAt: new Date().toISOString(),
            author: userId
          };
          ssbClient.publish(tombstone, (err2, res) => err2 ? reject(err2) : resolve(res));
        });
      });
    },

    async listAll(filter = 'all') {
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
      const videos = new Map();
      for (const m of messages) {
        const k = m.key;
        const c = m.value.content;
        if (!c) continue;
        if (c.type === 'tombstone' && c.target) {
          tombstoned.add(c.target);
          continue;
        }
        if (c.type !== 'video') continue;
        if (tombstoned.has(k)) continue;
        if (c.replaces) replaces.set(c.replaces, k);
        videos.set(k, {
          key: k,
          url: c.url,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt || null,
          tags: c.tags || [],
          author: c.author,
          title: c.title || '',
          description: c.description || '',
          opinions: c.opinions || {},
          opinions_inhabitants: c.opinions_inhabitants || []
        });
      }
      for (const replaced of replaces.keys()) {
        videos.delete(replaced);
      }
      let out = Array.from(videos.values());
      if (filter === 'mine') {
        out = out.filter(v => v.author === userId);
      } else if (filter === 'recent') {
        const now = Date.now();
        out = out.filter(v => new Date(v.createdAt).getTime() >= now - 86400000);
      } else if (filter === 'top') {
        out = out.sort((a, b) => {
          const sumA = Object.values(a.opinions).reduce((s, v) => s + v, 0);
          const sumB = Object.values(b.opinions).reduce((s, v) => s + v, 0);
          return sumB - sumA;
        });
      } else {
        out = out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      return out;
    },

    async getVideoById(id) {
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'video') return reject(new Error('Video not found'));
          resolve({
            key: id,
            url: msg.content.url,
            createdAt: msg.content.createdAt,
            updatedAt: msg.content.updatedAt || null,
            tags: msg.content.tags || [],
            author: msg.content.author,
            title: msg.content.title || '',
            description: msg.content.description || '',
            opinions: msg.content.opinions || {},
            opinions_inhabitants: msg.content.opinions_inhabitants || []
          });
        });
      });
    },

    async createOpinion(id, category) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'video') return reject(new Error('Video not found'));
          if (msg.content.opinions_inhabitants?.includes(userId)) return reject(new Error('Already voted'));
          const tombstone = {
            type: 'tombstone',
            target: id,
            deletedAt: new Date().toISOString(),
            author: userId
          };
          const updated = {
            ...msg.content,
            opinions: {
              ...msg.content.opinions,
              [category]: (msg.content.opinions?.[category] || 0) + 1
            },
            opinions_inhabitants: [...(msg.content.opinions_inhabitants || []), userId],
            updatedAt: new Date().toISOString(),
            replaces: id
          };
          ssbClient.publish(tombstone, err => {
            if (err) return reject(err);
            ssbClient.publish(updated, (err2, result) => err2 ? reject(err2) : resolve(result));
          });
        });
      });
    }
  };
};

