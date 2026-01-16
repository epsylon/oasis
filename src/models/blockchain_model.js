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

  const isClosedSold = s =>
    String(s || '').toUpperCase() === 'SOLD' || String(s || '').toUpperCase() === 'CLOSED';

  const projectRank = (status) => {
    const S = String(status || '').toUpperCase();
    if (S === 'COMPLETED') return 3;
    if (S === 'ACTIVE') return 2;
    if (S === 'PAUSED') return 1;
    if (S === 'CANCELLED') return 0;
    return -1;
  };

  const safeDecode = (s) => {
    try { return decodeURIComponent(String(s || '')); } catch { return String(s || ''); }
  };

  const parseTs = (s) => {
    const raw = String(s || '').trim();
    if (!raw) return null;
    const ts = new Date(raw).getTime();
    return Number.isFinite(ts) ? ts : null;
  };

  const matchBlockId = (blockId, q) => {
    const a = String(blockId || '');
    const b = String(q || '');
    if (!a || !b) return true;
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    if (al.includes(bl)) return true;
    const ad = safeDecode(a).toLowerCase();
    const bd = safeDecode(b).toLowerCase();
    return ad.includes(bd) || ad.includes(bl) || al.includes(bd);
  };

  const matchAuthorOrName = (authorId, authorName, query) => {
    const q0 = String(query || '').trim().toLowerCase();
    if (!q0) return true;

    const qNoAt = q0.replace(/^@/, '');
    const aid = String(authorId || '').toLowerCase();
    if (aid.includes(q0)) return true;
    if (qNoAt && aid.includes('@' + qNoAt)) return true;

    const nm0 = String(authorName || '').trim().toLowerCase();
    const nmNoAt = nm0.replace(/^@/, '');
    if (!nmNoAt) return false;

    if (nm0.includes(q0)) return true;
    if (qNoAt && nmNoAt.includes(qNoAt)) return true;

    return false;
  };

  const buildNameIndexFromAbout = async (ssbClient, minLimit = 5000) => {
    const nameByFeedId = new Map();
    if (!ssbClient?.query?.read) return nameByFeedId;

    const limit = Math.max(minLimit, logLimit);

    const source = await ssbClient.query.read({
      query: [{ $filter: { value: { content: { type: 'about' } } } }],
      reverse: true,
      limit
    });

    const aboutMsgs = await new Promise((resolve, reject) => {
      pull(
        source,
        pull.take(limit),
        pull.collect((err, msgs) => (err ? reject(err) : resolve(msgs || [])))
      );
    });

    for (const msg of aboutMsgs) {
      const c = msg?.value?.content;
      if (!c || c.type !== 'about') continue;
      const aboutId = String(c.about || msg?.value?.author || '').trim();
      const nm = typeof c.name === 'string' ? c.name.trim() : '';
      if (!aboutId || !nm) continue;
      if (!nameByFeedId.has(aboutId)) nameByFeedId.set(aboutId, nm);
    }

    return nameByFeedId;
  };

  return {
    async listBlockchain(filter = 'all', userId, search = {}) {
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

      const nameByFeedId = new Map();

      for (const msg of results) {
        const k = msg.key;
        const c = msg.value?.content;
        const author = msg.value?.author;
        if (!c?.type) continue;

        if (c.type === 'about') {
          const aboutId = String(c.about || author || '').trim();
          const nm = typeof c.name === 'string' ? c.name.trim() : '';
          if (aboutId && nm && !nameByFeedId.has(aboutId)) nameByFeedId.set(aboutId, nm);
        }

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
        filtered = filtered.filter(b => b && now - b.ts <= 24 * 60 * 60 * 1000);
      }
      if (filter === 'MINE' || filter === 'mine') {
        const me = userId || config.keys.id;
        filtered = filtered.filter(b => b && b.author === me);
      }
      if (filter === 'PARLIAMENT' || filter === 'parliament') {
        const pset = new Set(['parliamentTerm','parliamentProposal','parliamentLaw','parliamentCandidature','parliamentRevocation']);
        filtered = filtered.filter(b => b && pset.has(b.type));
      }
      if (filter === 'COURTS' || filter === 'courts') {
        const cset = new Set(['courtsCase','courtsEvidence','courtsAnswer','courtsVerdict','courtsSettlement','courtsSettlementProposal','courtsSettlementAccepted','courtsNomination','courtsNominationVote']);
        filtered = filtered.filter(b => b && cset.has(b.type));
      }

      const s = search || {};
      const authorQ = String(s.author || '').trim();
      const idQ = String(s.id || '').trim();
      const fromTs = parseTs(s.from);
      const toTs = parseTs(s.to);

      let aboutIndex = null;
      const needsNameSearch = !!authorQ && !authorQ.toLowerCase().includes('.ed25519');

      if (needsNameSearch) {
        aboutIndex = await buildNameIndexFromAbout(ssbClient, 10000);
        for (const [fid, nm] of aboutIndex.entries()) {
          if (!nameByFeedId.has(fid)) nameByFeedId.set(fid, nm);
        }
      }

      filtered = filtered.filter(b => {
        if (!b) return false;
        if (fromTs != null && b.ts < fromTs) return false;
        if (toTs != null && b.ts > toTs) return false;

        if (authorQ) {
          const nm = nameByFeedId.get(b.author) || '';
          if (!matchAuthorOrName(b.author, nm, authorQ)) return false;
        }

        if (idQ && !matchBlockId(b.id, idQ)) return false;

        return true;
      });

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

      return { ...block, isTombstoned, isReplaced };
    }
  };
};

