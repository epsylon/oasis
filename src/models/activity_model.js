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
  if (c.type === 'courts_case') return 'courtsCase';
  if (c.type === 'courts_evidence') return 'courtsEvidence';
  if (c.type === 'courts_answer') return 'courtsAnswer';
  if (c.type === 'courts_verdict') return 'courtsVerdict';
  if (c.type === 'courts_settlement') return 'courtsSettlement';
  if (c.type === 'courts_nomination') return 'courtsNomination';
  if (c.type === 'courts_nom_vote') return 'courtsNominationVote';
  if (c.type === 'courts_public_pref') return 'courtsPublicPref';
  if (c.type === 'courts_mediators') return 'courtsMediators';
  if (c.type === 'vote' && c.vote && typeof c.vote.link === 'string') {
    const br = Array.isArray(c.branch) ? c.branch : [];
    if (br.includes(c.vote.link) && Number(c.vote.value) === 1) return 'spread';
  }
  return c.type || '';
}

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb };
  const hasBlob = async (ssbClient, url) => new Promise(resolve => ssbClient.blobs.has(url, (err, has) => resolve(!err && has)));
  const getMsg = async (ssbClient, key) => new Promise(resolve => ssbClient.get(key, (err, msg) => resolve(err ? null : msg)));
  const normNL = (s) => String(s || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const stripHtml = (s) => normNL(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const excerpt = (s, max = 900) => {
    const t = stripHtml(s);
    if (!t) return '';
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
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

      const replacedIds = new Set(parentOf.values());
      const spreadVoteState = new Map();

      for (const a of idToAction.values()) {
        const c = a.content || {};
        if (c.type !== 'vote' || !c.vote || typeof c.vote.link !== 'string') continue;

        const link = c.vote.link;
        const br = Array.isArray(c.branch) ? c.branch : [];
        if (!br.includes(link)) continue;

        if (tombstoned.has(a.id)) continue;
        if (replacedIds.has(a.id)) continue;
        if (tombstoned.has(link)) continue;

        const author = a.author;
        if (!author) continue;

        const value = Number(c.vote.value);
        const key = `${link}:${author}`;
        const prev = spreadVoteState.get(key);
        const curTs = a.ts || 0;

        if (!prev || curTs > prev.ts || (curTs === prev.ts && String(a.id || '').localeCompare(String(prev.id || '')) > 0)) {
          spreadVoteState.set(key, { ts: curTs, id: a.id, value, link });
        }
      }

      const spreadCountByTarget = new Map();
      for (const v of spreadVoteState.values()) {
        if (Number(v.value) !== 1) continue;
        spreadCountByTarget.set(v.link, (spreadCountByTarget.get(v.link) || 0) + 1);
      }

      const fetchedTargetCache = new Map();

      for (const a of idToAction.values()) {
        if (a.type !== 'spread') continue;
        const c = a.content || {};
        const link = c.vote?.link || '';
        const totalSpreads = link ? (spreadCountByTarget.get(link) || 0) : 0;

        let targetMsg = link ? rawById.get(link) : null;
        if (!targetMsg && link) {
          if (fetchedTargetCache.has(link)) targetMsg = fetchedTargetCache.get(link);
          else {
            const got = await getMsg(ssbClient, link);
            if (got) {
              const wrapped = { key: link, value: got };
              fetchedTargetCache.set(link, wrapped);
              targetMsg = wrapped;
            } else {
              fetchedTargetCache.set(link, null);
              targetMsg = null;
            }
          }
        }

        const targetContent = targetMsg?.value?.content || null;
        const title =
          (typeof targetContent?.title === 'string' && targetContent.title.trim())
            ? targetContent.title.trim()
            : (typeof targetContent?.name === 'string' && targetContent.name.trim())
              ? targetContent.name.trim()
              : '';
        const rawText =
          (typeof targetContent?.text === 'string' && targetContent.text.trim())
            ? targetContent.text
            : (typeof targetContent?.description === 'string' && targetContent.description.trim())
              ? targetContent.description
              : '';
        const text = rawText ? excerpt(rawText, 700) : '';
        const cw =
          (typeof targetContent?.contentWarning === 'string' && targetContent.contentWarning.trim())
            ? targetContent.contentWarning
            : '';
        a.content = {
          ...c,
          spreadTargetId: link,
          spreadTotalSpreads: totalSpreads,
          spreadOriginalAuthor: targetMsg?.value?.author || '',
          spreadTitle: title,
          spreadContentWarning: cw,
          spreadText: text
        };
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

          if (type === 'task' && tip && tip.content && tip.content.isPublic !== 'PRIVATE') {
            const uniq = (xs) => Array.from(new Set((Array.isArray(xs) ? xs : []).filter(x => typeof x === 'string' && x.trim().length)));
            const sorted = arr
              .filter(a => a.type === 'task' && a.content && typeof a.content === 'object')
              .sort((a, b) => (a.ts || 0) - (b.ts || 0));

            let prev = null;

            for (const ev of sorted) {
              const cur = uniq(ev.content.assignees);
              if (prev) {
                const prevSet = new Set(prev);
                const curSet = new Set(cur);
                const added = cur.filter(x => !prevSet.has(x));
                const removed = prev.filter(x => !curSet.has(x));

                if (added.length || removed.length) {
                  const overlayId = `${ev.id}:assignees:${added.join(',')}:${removed.join(',')}`;
                  idToAction.set(overlayId, {
                    id: overlayId,
                    author: ev.author,
                    ts: ev.ts,
                    type: 'taskAssignment',
                    content: {
                      taskId: tip.id,
                      title: tip.content.title || ev.content.title || '',
                      added,
                      removed,
                      isPublic: tip.content.isPublic
                    }
                  });
                  idToTipId.set(overlayId, overlayId);
                }
              }
              prev = cur;
            }
          }

          if (type === 'tribe') {
            const baseId = tip.id;
            const baseTitle = (tip.content && tip.content.title) || '';
            const isAnonymous = tip.content && typeof tip.content.isAnonymous === 'boolean' ? tip.content.isAnonymous : false;

            const uniq = (xs) => Array.from(new Set((Array.isArray(xs) ? xs : []).filter(x => typeof x === 'string' && x.trim().length)));
            const toSet = (xs) => new Set(uniq(xs));
            const excerpt2 = (s, max = 220) => {
              const t = String(s || '').replace(/\s+/g, ' ').trim();
              return t.length > max ? t.slice(0, max - 1) + '…' : t;
            };
            const feedMap = (feed) => {
              const m = new Map();
              for (const it of (Array.isArray(feed) ? feed : [])) {
                if (!it || typeof it !== 'object') continue;
                const id = typeof it.id === 'string' || typeof it.id === 'number' ? String(it.id) : '';
                if (!id) continue;
                m.set(id, it);
              }
              return m;
            };

            const sorted = arr
              .filter(a => a.type === 'tribe' && a.content && typeof a.content === 'object')
              .sort((a, b) => (a.ts || 0) - (b.ts || 0));

            let prev = null;

            for (const ev of sorted) {
              if (!prev) { prev = ev; continue; }

              const prevMembers = toSet(prev.content.members);
              const curMembers = toSet(ev.content.members);
              const added = Array.from(curMembers).filter(x => !prevMembers.has(x));
              const removed = Array.from(prevMembers).filter(x => !curMembers.has(x));

              for (const member of added) {
                const overlayId = `${ev.id}:tribeJoin:${member}`;
                idToAction.set(overlayId, {
                  id: overlayId,
                  author: member,
                  ts: ev.ts,
                  type: 'tribeJoin',
                  content: { type: 'tribeJoin', tribeId: baseId, tribeTitle: baseTitle, isAnonymous, member }
                });
                idToTipId.set(overlayId, overlayId);
              }

              for (const member of removed) {
                const overlayId = `${ev.id}:tribeLeave:${member}`;
                idToAction.set(overlayId, {
                  id: overlayId,
                  author: member,
                  ts: ev.ts,
                  type: 'tribeLeave',
                  content: { type: 'tribeLeave', tribeId: baseId, tribeTitle: baseTitle, isAnonymous, member }
                });
                idToTipId.set(overlayId, overlayId);
              }

              const prevFeed = feedMap(prev.content.feed);
              const curFeed = feedMap(ev.content.feed);

              for (const [fid, item] of curFeed.entries()) {
                if (prevFeed.has(fid)) continue;
                const feedAuthor = (item && typeof item.author === 'string' && item.author.trim().length) ? item.author : ev.author;
                const overlayId = `${ev.id}:tribeFeedPost:${fid}:${feedAuthor}`;
                idToAction.set(overlayId, {
                  id: overlayId,
                  author: feedAuthor,
                  ts: ev.ts,
                  type: 'tribeFeedPost',
                  content: {
                    type: 'tribeFeedPost',
                    tribeId: baseId,
                    tribeTitle: baseTitle,
                    isAnonymous,
                    feedId: fid,
                    date: item.date || ev.ts,
                    text: excerpt2(item.message || '')
                  }
                });
                idToTipId.set(overlayId, overlayId);
              }

              for (const [fid, curItem] of curFeed.entries()) {
                const prevItem = prevFeed.get(fid);
                if (!prevItem) continue;

                const pInh = toSet(prevItem.refeeds_inhabitants);
                const cInh = toSet(curItem.refeeds_inhabitants);
                const newInh = Array.from(cInh).filter(x => !pInh.has(x));

                const curRefeeds = Number(curItem.refeeds || 0);
                const prevRefeeds = Number(prevItem.refeeds || 0);

                const postText = excerpt2(curItem.message || '');

                if (newInh.length) {
                  for (const who of newInh) {
                    const overlayId = `${ev.id}:tribeFeedRefeed:${fid}:${who}`;
                    idToAction.set(overlayId, {
                      id: overlayId,
                      author: who,
                      ts: ev.ts,
                      type: 'tribeFeedRefeed',
                      content: {
                        type: 'tribeFeedRefeed',
                        tribeId: baseId,
                        tribeTitle: baseTitle,
                        isAnonymous,
                        feedId: fid,
                        text: postText
                      }
                    });
                    idToTipId.set(overlayId, overlayId);
                  }
                } else if (curRefeeds > prevRefeeds && ev.author) {
                  const who = ev.author;
                  const overlayId = `${ev.id}:tribeFeedRefeed:${fid}:${who}`;
                  idToAction.set(overlayId, {
                    id: overlayId,
                    author: who,
                    ts: ev.ts,
                    type: 'tribeFeedRefeed',
                    content: {
                      type: 'tribeFeedRefeed',
                      tribeId: baseId,
                      tribeTitle: baseTitle,
                      isAnonymous,
                      feedId: fid,
                      text: postText
                    }
                  });
                  idToTipId.set(overlayId, overlayId);
                }
              }

              prev = ev;
            }
          }

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
        if (a.type === 'tribe' && parentOf.has(a.id)) continue;
        const c = a.content || {};
        if (c.root && tombstoned.has(c.root)) continue;
        if (a.type === 'vote' && tombstoned.has(c.vote?.link)) continue;
        if (a.type === 'spread' && (c.spreadTargetId || c.vote?.link) && tombstoned.has(c.spreadTargetId || c.vote?.link)) continue;
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

      let deduped = latest.filter(a => !a.tipId || a.tipId === a.id || (a.type === 'tribe' && !parentOf.has(a.id)));

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
        } else if (a.type === 'about') {
          const target = c.about || a.author;
          const key = `about:${target}`;
          const prev = byKey.get(key);
          const prevContent = prev && (prev.content || {});
          const prevHasImage = !!(prevContent && prevContent.image);
          const newHasImage = !!c.image;

          if (!prev) {
            byKey.set(key, { ...a, __effTs: effTs, __hasImage: newHasImage });
          } else if (!prevHasImage && newHasImage) {
            byKey.set(key, { ...a, __effTs: effTs, __hasImage: newHasImage });
          } else if (prevHasImage === newHasImage && effTs > prev.__effTs) {
            byKey.set(key, { ...a, __effTs: effTs, __hasImage: newHasImage });
          }
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

      deduped = Array.from(byKey.values()).map(x => { delete x.__effTs; delete x.__hasImage; return x });

      const tribeInternalTypes = new Set(['tribeLeave', 'tribeFeedPost', 'tribeFeedRefeed', 'tribe-content']);
      const isAllowedTribeActivity = (a) => !tribeInternalTypes.has(a.type);

      let out;
      if (filter === 'mine') out = deduped.filter(a => a.author === userId && isAllowedTribeActivity(a));
      else if (filter === 'recent') { const cutoff = Date.now() - 24 * 60 * 60 * 1000; out = deduped.filter(a => (a.ts || 0) >= cutoff && isAllowedTribeActivity(a)) }
      else if (filter === 'all') out = deduped.filter(isAllowedTribeActivity);
      else if (filter === 'banking') out = deduped.filter(a => a.type === 'bankWallet' || a.type === 'bankClaim');
      else if (filter === 'karma') out = deduped.filter(a => a.type === 'karmaScore');
      else if (filter === 'tribe') out = deduped.filter(a => a.type === 'tribe' || String(a.type || '').startsWith('tribe'));
      else if (filter === 'spread') out = deduped.filter(a => a.type === 'spread');
      else if (filter === 'parliament')
        out = deduped.filter(a =>
          ['parliamentCandidature','parliamentTerm','parliamentProposal','parliamentRevocation','parliamentLaw'].includes(a.type)
        );
      else if (filter === 'courts')
        out = deduped.filter(a => {
          const t = String(a.type || '').toLowerCase();
          return t === 'courtscase' || t === 'courtsnomination' || t === 'courtsnominationvote';
        });
      else if (filter === 'task')
        out = deduped.filter(a => a.type === 'task' || a.type === 'taskAssignment');
      else out = deduped.filter(a => a.type === filter);

      out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      return out;
    }
  };
};

