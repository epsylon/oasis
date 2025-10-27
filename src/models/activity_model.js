const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const N = s => String(s || '').toUpperCase().replace(/\s+/g, '_');
const ORDER_MARKET = ['FOR_SALE','OPEN','RESERVED','CLOSED','SOLD'];
const ORDER_PROJECT = ['CANCELLED','PAUSED','ACTIVE','COMPLETED'];
const SCORE_MARKET = s => { const i = ORDER_MARKET.indexOf(N(s)); return i < 0 ? -1 : i };
const SCORE_PROJECT = s => { const i = ORDER_PROJECT.indexOf(N(s)); return i < 0 ? -1 : i };

function inferType(c = {}) {
  if (c.type === 'wallet' && c.coin === 'ECO' && typeof c.address === 'string') return 'bankWallet';
  if (c.type === 'bankClaim') return 'bankClaim';
  if (c.type === 'karmaScore') return 'karmaScore';
  return c.type || '';
}

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb };
  const hasBlob = async (ssbClient, url) => new Promise(resolve => ssbClient.blobs.has(url, (err, has) => resolve(!err && has)));

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
      const rawById = new Map();

      for (const msg of results) {
        const k = msg.key;
        const v = msg.value;
        const c = v?.content;
        if (!c?.type) continue;
        if (c.type === 'tombstone' && c.target) { tombstoned.add(c.target); continue }
        const ts = v?.timestamp || Number(c?.timestamp || 0) || (c?.updatedAt ? Date.parse(c.updatedAt) : 0) || 0;
        idToAction.set(k, { id: k, author: v?.author, ts, type: inferType(c), content: c });
        rawById.set(k, msg);
        if (c.replaces) parentOf.set(k, c.replaces);
      }

      const rootOf = (id) => { let cur = id; while (parentOf.has(cur)) cur = parentOf.get(cur); return cur };

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

        if (type !== 'project') {
          const tip = arr.reduce((best, a) => (a.ts > best.ts ? a : best), arr[0]);
          for (const a of arr) idToTipId.set(a.id, tip.id);
          continue;
        }

        let tip = arr[0];
        let bestScore = SCORE_PROJECT(tip.content.status);
        for (const a of arr) {
          const s = SCORE_PROJECT(a.content.status);
          if (s > bestScore || (s === bestScore && a.ts > tip.ts)) { tip = a; bestScore = s }
        }
        for (const a of arr) idToTipId.set(a.id, tip.id);

        const baseTitle = (tip.content && tip.content.title) || '';
        const overlays = arr
          .filter(a => a.type === 'project' && (a.content.followersOp || a.content.backerPledge))
          .sort((a, b) => (a.ts || 0) - (b.ts || 0));

        for (const ev of overlays) {
          if (tombstoned.has(ev.id)) continue;

          let kind = null;
          let amount = null;

          if (ev.content.followersOp === 'follow') kind = 'follow';
          else if (ev.content.followersOp === 'unfollow') kind = 'unfollow';

          if (ev.content.backerPledge && typeof ev.content.backerPledge.amount !== 'undefined') {
            const amt = Math.max(0, parseFloat(ev.content.backerPledge.amount || 0) || 0);
            if (amt > 0) { kind = kind || 'pledge'; amount = amt }
          }

          if (!kind) continue;

          const augmented = {
            ...ev,
            type: 'project',
            content: {
              ...ev.content,
              title: baseTitle,
              projectId: tip.id,
              activity: { kind, amount },
              activityActor: ev.author
            }
          };
          idToAction.set(ev.id, augmented);
          idToTipId.set(ev.id, ev.id);
        }
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
        if (a.type === 'forum' && c.root) {
          const rootId = typeof c.root === 'string' ? c.root : (c.root?.key || c.root?.id || '');
          const rootAction = idToAction.get(rootId);
          a.content.rootTitle = rootAction?.content?.title || a.content.rootTitle || '';
          a.content.rootKey = rootId || a.content.rootKey || '';
        }
        latest.push({ ...a, tipId: idToTipId.get(a.id) || a.id });
      }

      let deduped = latest.filter(a => !a.tipId || a.tipId === a.id);

      const mediaTypes = new Set(['image','video','audio','document','bookmark']);
      const perAuthorUnique = new Set(['karmaScore']);
      const byKey = new Map();
      const norm = s => String(s || '').trim().toLowerCase();

      for (const a of deduped) {
        const c = a.content || {};
        const effTs =
          (c.updatedAt && Date.parse(c.updatedAt)) ||
          (c.createdAt && Date.parse(c.createdAt)) ||
          (a.ts || 0);

        if (mediaTypes.has(a.type)) {
          const u = c.url || c.title || `${a.type}:${a.id}`;
          const key = `${a.type}:${u}`;
          const prev = byKey.get(key);
          if (!prev || effTs > prev.__effTs) byKey.set(key, { ...a, __effTs: effTs });
        } else if (perAuthorUnique.has(a.type)) {
          const key = `${a.type}:${a.author}`;
          const prev = byKey.get(key);
          if (!prev || effTs > prev.__effTs) byKey.set(key, { ...a, __effTs: effTs });
        } else if (a.type === 'tribe') {
          const t = norm(c.title);
          if (t) {
            const key = `tribe:${t}::${a.author}`;
            const prev = byKey.get(key);
            if (!prev || effTs > prev.__effTs) byKey.set(key, { ...a, __effTs: effTs });
          } else {
            const key = `id:${a.id}`;
            byKey.set(key, { ...a, __effTs: effTs });
          }
        } else {
          const key = `id:${a.id}`;
          byKey.set(key, { ...a, __effTs: effTs });
        }
      }
      deduped = Array.from(byKey.values()).map(x => { delete x.__effTs; return x });

      let out;
      if (filter === 'mine') out = deduped.filter(a => a.author === userId);
      else if (filter === 'recent') { const cutoff = Date.now() - 24 * 60 * 60 * 1000; out = deduped.filter(a => (a.ts || 0) >= cutoff) }
      else if (filter === 'all') out = deduped;
      else if (filter === 'banking') out = deduped.filter(a => a.type === 'bankWallet' || a.type === 'bankClaim');
      else if (filter === 'karma') out = deduped.filter(a => a.type === 'karmaScore');
      else if (filter === 'parliament')
      out = deduped.filter(a =>
        ['parliamentCandidature','parliamentTerm','parliamentProposal','parliamentRevocation','parliamentLaw'].includes(a.type)
      );
      else out = deduped.filter(a => a.type === filter);

      out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      return out;
    }
  };
};

