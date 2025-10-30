const pull = require('../server/node_modules/pull-stream');
const { config } = require('../server/SSB_server.js');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler }) => {
  let ssb;

  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const hasBlob = async (ssbClient, url) =>
    new Promise(resolve => ssbClient.blobs.has(url, (err, has) => resolve(!err && has)));

  const isClosedSold = s => String(s || '').toUpperCase() === 'SOLD' || String(s || '').toUpperCase() === 'CLOSED';

  const projectRank = (status) => {
    const S = String(status || '').toUpperCase();
    if (S === 'COMPLETED') return 3;
    if (S === 'ACTIVE')    return 2;
    if (S === 'PAUSED')    return 1;
    if (S === 'CANCELLED') return 0;
    return -1;
  };

  return {
    async listBlockchain(filter = 'all') {
      const ssbClient = await openSsb();
      const results = await new Promise((resolve, reject) =>
        pull(
          ssbClient.createLogStream({ reverse: true, limit: logLimit }),
          pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
        )
      );

      const tombstoned = new Set();
      const idToBlock = new Map();
      const referencedAsReplaces = new Set();

      for (const msg of results) {
        const k = msg.key;
        const c = msg.value?.content;
        const author = msg.value?.author;
        if (!c?.type) continue;
        if (c.type === 'tombstone' && c.target) {
          tombstoned.add(c.target);
          idToBlock.set(k, { id: k, author, ts: msg.value.timestamp, type: c.type, content: c });
          continue;
        }
        if (c.replaces) referencedAsReplaces.add(c.replaces);
        idToBlock.set(k, { id: k, author, ts: msg.value.timestamp, type: c.type, content: c });
      }

      const tipBlocks = [];
      for (const [id, block] of idToBlock.entries()) {
        if (!referencedAsReplaces.has(id) && block.content.replaces) tipBlocks.push(block);
      }
      for (const [id, block] of idToBlock.entries()) {
        if (!block.content.replaces && !referencedAsReplaces.has(id)) tipBlocks.push(block);
      }

      const groups = {};
      for (const block of tipBlocks) {
        const ancestor = block.content.replaces || block.id;
        if (!groups[ancestor]) groups[ancestor] = [];
        groups[ancestor].push(block);
      }

      const liveTipIds = new Set();
      for (const groupBlocks of Object.values(groups)) {
        let best = groupBlocks[0];
        for (const block of groupBlocks) {
          if (block.type === 'market') {
            if (isClosedSold(block.content.status) && !isClosedSold(best.content.status)) {
              best = block;
            } else if ((block.content.status === best.content.status) && block.ts > best.ts) {
              best = block;
            }
          } else if (block.type === 'project') {
            const br = projectRank(best.content.status);
            const cr = projectRank(block.content.status);
            if (cr > br || (cr === br && block.ts > best.ts)) best = block;
          } else if (block.type === 'job' || block.type === 'forum') {
            if (block.ts > best.ts) best = block;
          } else {
            if (block.ts > best.ts) best = block;
          }
        }
        liveTipIds.add(best.id);
      }

      const blockData = Array.from(idToBlock.values()).map(block => {
        const c = block.content;
        const rootDeleted = c?.type === 'forum' && c.root && tombstoned.has(c.root);
        return {
          ...block,
          isTombstoned: tombstoned.has(block.id),
          isReplaced: c.replaces
            ? (!liveTipIds.has(block.id) || tombstoned.has(block.id))
            : referencedAsReplaces.has(block.id) || tombstoned.has(block.id) || rootDeleted
        };
      });

      let filtered = blockData;
      if (filter === 'RECENT' || filter === 'recent') {
        const now = Date.now();
        filtered = blockData.filter(b => b && now - b.ts <= 24 * 60 * 60 * 1000);
      }
      if (filter === 'MINE' || filter === 'mine') {
        filtered = blockData.filter(b => b && b.author === config.keys.id);
      }
      if (filter === 'PARLIAMENT' || filter === 'parliament') {
        const pset = new Set(['parliamentTerm','parliamentProposal','parliamentLaw','parliamentCandidature','parliamentRevocation']);
        filtered = blockData.filter(b => b && pset.has(b.type));
      }

      return filtered.filter(Boolean);
    },

    async getBlockById(id) {
      const ssbClient = await openSsb();
      const results = await new Promise((resolve, reject) =>
        pull(
          ssbClient.createLogStream({ reverse: true, limit: logLimit }),
          pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
        )
      );

      const tombstoned = new Set();
      const idToBlock = new Map();
      const referencedAsReplaces = new Set();

      for (const msg of results) {
        const k = msg.key;
        const c = msg.value?.content;
        const author = msg.value?.author;
        if (!c?.type) continue;
        if (c.type === 'tombstone' && c.target) {
          tombstoned.add(c.target);
          idToBlock.set(k, { id: k, author, ts: msg.value.timestamp, type: c.type, content: c });
          continue;
        }
        if (c.replaces) referencedAsReplaces.add(c.replaces);
        idToBlock.set(k, { id: k, author, ts: msg.value.timestamp, type: c.type, content: c });
      }

      const tipBlocks = [];
      for (const [bid, block] of idToBlock.entries()) {
        if (!referencedAsReplaces.has(bid) && block.content.replaces) tipBlocks.push(block);
      }
      for (const [bid, block] of idToBlock.entries()) {
        if (!block.content.replaces && !referencedAsReplaces.has(bid)) tipBlocks.push(block);
      }

      const groups = {};
      for (const block of tipBlocks) {
        const ancestor = block.content.replaces || block.id;
        if (!groups[ancestor]) groups[ancestor] = [];
        groups[ancestor].push(block);
      }

      const liveTipIds = new Set();
      for (const groupBlocks of Object.values(groups)) {
        let best = groupBlocks[0];
        for (const block of groupBlocks) {
          if (block.type === 'market') {
            if (isClosedSold(block.content.status) && !isClosedSold(best.content.status)) {
              best = block;
            } else if ((block.content.status === best.content.status) && block.ts > best.ts) {
              best = block;
            }
          } else if (block.type === 'project') {
            const br = projectRank(best.content.status);
            const cr = projectRank(block.content.status);
            if (cr > br || (cr === br && block.ts > best.ts)) best = block;
          } else if (block.type === 'job' || block.type === 'forum') {
            if (block.ts > best.ts) best = block;
          } else {
            if (block.ts > best.ts) best = block;
          }
        }
        liveTipIds.add(best.id);
      }

      const block = idToBlock.get(id);
      if (!block) return null;
      if (block.type === 'document') {
        const valid = await hasBlob(ssbClient, block.content.url);
        if (!valid) return null;
      }

      const c = block.content;
      const rootDeleted = c?.type === 'forum' && c.root && tombstoned.has(c.root);
      const isTombstoned = tombstoned.has(block.id);
      const isReplaced = c.replaces
        ? (!liveTipIds.has(block.id) || tombstoned.has(block.id))
        : referencedAsReplaces.has(block.id) || tombstoned.has(block.id) || rootDeleted;

      return {
        ...block,
        isTombstoned,
        isReplaced
      };
    }
  };
};

