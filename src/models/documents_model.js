const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const categories = require('../backend/opinion_categories');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const extractBlobId = str => {
  if (!str || typeof str !== 'string') return null;
  const match = str.match(/\(([^)]+\.sha256)\)/);
  return match ? match[1] : str.trim();
};

const parseCSV = str => str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  return {
    type: 'document',

    async createDocument(blobMarkdown, tagsRaw, title, description) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const blobId = extractBlobId(blobMarkdown);
      const tags = parseCSV(tagsRaw);
      const content = {
        type: 'document',
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

    async updateDocumentById(id, blobMarkdown, tagsRaw, title, description) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, oldMsg) => {
          if (err || !oldMsg || oldMsg.content?.type !== 'document') return reject(new Error('Document not found'));
          if (Object.keys(oldMsg.content.opinions || {}).length > 0) return reject(new Error('Cannot edit document after it has received opinions.'));
          if (oldMsg.content.author !== userId) return reject(new Error('Not the author'));
          const tags = parseCSV(tagsRaw);
          const blobId = extractBlobId(blobMarkdown);
          const updated = {
            ...oldMsg.content,
            replaces: id,
            url: blobId || oldMsg.content.url,
            tags,
            title: title || '',
            description: description || '',
            updatedAt: new Date().toISOString()
          };
          ssbClient.publish(updated, (err3, result) => err3 ? reject(err3) : resolve(result));
        });
      });
    },

    async deleteDocumentById(id) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'document') return reject(new Error('Document not found'));
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
          ssbClient.createLogStream({ limit: logLimit }),
          pull.collect((err, msgs) => err ? rej(err) : res(msgs))
        );
      });

      const tombstoned = new Set(
        messages
          .filter(m => m.value.content?.type === 'tombstone')
          .map(m => m.value.content.target)
      );

      const replaces = new Map();
      const latest = new Map();

      for (const m of messages) {
        const k = m.key;
        const c = m.value?.content;
        if (!c || c.type !== 'document') continue;
        if (tombstoned.has(k)) continue;
        if (c.replaces) replaces.set(c.replaces, k);
        latest.set(k, {
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

      for (const oldId of replaces.keys()) latest.delete(oldId);

      let documents = Array.from(latest.values());

      if (filter === 'mine') {
        documents = documents.filter(d => d.author === userId);
      } else {
        documents = documents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      const hasBlob = (blobId) => {
        return new Promise((resolve) => {
          ssbClient.blobs.has(blobId, (err, has) => resolve(!err && has));
        });
      };

      documents = await Promise.all(
        documents.map(async (doc) => {
          const ok = await hasBlob(doc.url);
          return ok ? doc : null;
        })
      );

      return documents.filter(Boolean);
    },

    async getDocumentById(id) {
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'document') return reject(new Error('Document not found'));
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
      if (!categories.includes(category)) return Promise.reject(new Error('Invalid voting category'));
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'document') return reject(new Error('Document not found'));
          if (msg.content.opinions_inhabitants?.includes(userId)) return reject(new Error('Already voted'));
          const updated = {
            ...msg.content,
            replaces: id,
            opinions: {
              ...msg.content.opinions,
              [category]: (msg.content.opinions?.[category] || 0) + 1
            },
            opinions_inhabitants: [...(msg.content.opinions_inhabitants || []), userId],
            updatedAt: new Date().toISOString()
          };
          ssbClient.publish(updated, (err3, result) => err3 ? reject(err3) : resolve(result));
        });
      });
    }
  };
};

