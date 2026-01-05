const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { getConfig } = require('../configs/config-manager.js');

const logLimit = getConfig().ssbLogStream?.limit || 1000;
const TERM_DAYS = 60;
const PROPOSAL_DAYS = 7;
const REVOCATION_DAYS = 15;
const METHODS = ['DEMOCRACY', 'MAJORITY', 'MINORITY', 'DICTATORSHIP', 'KARMATOCRACY'];
const FEED_ID_RE = /^@.+\.ed25519$/;

module.exports = ({ cooler, services = {} }) => {
  let ssb;
  let userId;

  const CACHE_MS = 250;
  let logCache = { at: 0, arr: null };
  let myCache = new Map();

  let electionInFlight = null;
  let sweepInFlight = null;

  const openSsb = async () => {
    if (!ssb) {
      ssb = await cooler.open();
      userId = ssb.id;
    }
    return ssb;
  };

  const nowISO = () => new Date().toISOString();
  const parseISO = (s) => moment(s, moment.ISO_8601, true);
  const ensureArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  const stripId = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const { id, ...rest } = obj;
    return rest;
  };
  const normMs = (t) => (t && t < 1e12 ? t * 1000 : t || 0);

  const isExpiredTerm = (t) => {
    const end = t && t.endAt ? parseISO(t.endAt) : null;
    if (!end || !end.isValid()) return false;
    return moment().isSameOrAfter(end);
  };

  async function publishMsg(content) {
    const ssbClient = await openSsb();
    const res = await new Promise((resolve, reject) =>
      ssbClient.publish(content, (e, r) => (e ? reject(e) : resolve(r)))
    );
    logCache = { at: 0, arr: null };
    myCache.clear();
    return res;
  }

  async function readLog() {
    const now = Date.now();
    if (logCache.arr && now - logCache.at < CACHE_MS) return logCache.arr;
    const ssbClient = await openSsb();
    const arr = await new Promise((res, rej) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, out) => (err ? rej(err) : res(out || [])))
      );
    });
    logCache = { at: now, arr };
    return arr;
  }

  async function readMyByTypes(types = [], limit = logLimit) {
    const ssbClient = await openSsb();
    const key = `${String(userId)}|${String(limit)}|${types.slice().sort().join(',')}`;
    const now = Date.now();
    const hit = myCache.get(key);
    if (hit && hit.arr && now - hit.at < CACHE_MS) return hit.arr;
    const set = new Set(types);
    const arr = await new Promise((res, rej) => {
      pull(
        ssbClient.createUserStream({ id: userId, reverse: true }),
        pull.filter(m => {
          const c = m && m.value && m.value.content;
          return c && set.has(c.type);
        }),
        pull.take(Number(limit) || logLimit),
        pull.collect((err, out) => (err ? rej(err) : res(out || [])))
      );
    });
    myCache.set(key, { at: now, arr });
    return arr;
  }

  function listByTypeFromMsgs(msgs, type) {
    const tomb = new Set();
    const rep = new Map();
    const children = new Map();
    const map = new Map();

    for (const m of msgs || []) {
      const k = m.key;
      const v = m.value || {};
      const c = v.content;
      if (!c) continue;

      if (c.type === 'tombstone' && c.target) tomb.add(c.target);

      if (c.type === type) {
        if (c.replaces) {
          const oldId = c.replaces;
          const ts = normMs(v.timestamp || m.timestamp || Date.now());
          const prev = rep.get(oldId);
          if (!prev || ts > prev.ts) rep.set(oldId, { id: k, ts });
          if (!children.has(oldId)) children.set(oldId, new Set());
          children.get(oldId).add(k);
        }
        map.set(k, { ...c, id: k });
      }
    }

    for (const oldId of rep.keys()) map.delete(oldId);
    for (const [oldId, kids] of children.entries()) {
      const winner = rep.get(oldId)?.id || null;
      for (const kid of kids) {
        if (kid !== winner) map.delete(kid);
      }
    }
    for (const tId of tomb) map.delete(tId);
    return [...map.values()];
  }

  async function listByType(type) {
    const isParl = String(type || '').startsWith('parliament') || type === 'tombstone';
    const msgs = isParl ? await readMyByTypes([type, 'tombstone'], logLimit) : await readLog();
    return listByTypeFromMsgs(msgs, type);
  }

  async function listTribesAny() {
    if (services.tribes?.listAll) return await services.tribes.listAll();
    return await listByType('tribe');
  }

  async function getLatestAboutFromLog(feedId) {
    const msgs = await readLog();
    let latest = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const v = msgs[i].value || {};
      const c = v.content || {};
      if (!c || c.type !== 'about') continue;
      const bySelf = v.author === feedId && typeof c.name === 'string';
      const aboutTarget = c.about === feedId && (typeof c.name === 'string' || typeof c.description === 'string' || typeof c.image === 'string');
      if (bySelf || aboutTarget) {
        const ts = normMs(v.timestamp || msgs[i].timestamp || Date.now());
        if (!latest || ts > latest.ts) latest = { ts, content: c };
      }
    }
    return latest ? latest.content : null;
  }

  async function getTribeMetaById(tribeId) {
    let tribe = null;
    if (services.tribes?.getTribeById) {
      try { tribe = await services.tribes.getTribeById(tribeId); } catch {}
    }
    if (!tribe) return { isTribe: true, name: tribeId, avatarUrl: '/assets/images/default-tribe.png', bio: '' };
    const imgId = tribe.image || null;
    const avatarUrl = imgId ? `/image/256/${encodeURIComponent(imgId)}` : '/assets/images/default-tribe.png';
    return { isTribe: true, name: tribe.title || tribe.name || tribeId, avatarUrl, bio: tribe.description || '' };
  }

  async function getInhabitantMetaById(feedId) {
    let aboutRec = null;
    if (services.inhabitants?.getLatestAboutById) {
      try { aboutRec = await services.inhabitants.getLatestAboutById(feedId); } catch {}
    }
    if (!aboutRec) {
      try { aboutRec = await getLatestAboutFromLog(feedId); } catch {}
    }
    const name = (aboutRec && typeof aboutRec.name === 'string' && aboutRec.name.trim()) ? aboutRec.name.trim() : feedId;
    const imgField = aboutRec && aboutRec.image;
    const imgId = typeof imgField === 'string' ? imgField : (imgField && (imgField.link || imgField.url)) ? (imgField.link || imgField.url) : null;
    const avatarUrl = imgId ? `/image/256/${encodeURIComponent(imgId)}` : '/assets/images/default-avatar.png';
    const bio = (aboutRec && typeof aboutRec.description === 'string') ? aboutRec.description : '';
    return { isTribe: false, name, avatarUrl, bio };
  }

  async function actorMeta({ targetType, targetId }) {
    const t = String(targetType || '').toLowerCase();
    if (t === 'tribe') return await getTribeMetaById(targetId);
    return await getInhabitantMetaById(targetId);
  }

  async function getInhabitantTitleSSB(feedId) {
    const msgs = await readLog();
    for (let i = msgs.length - 1; i >= 0; i--) {
      const v = msgs[i].value || {};
      const c = v.content || {};
      if (!c || c.type !== 'about') continue;
      if (c.about === feedId && typeof c.name === 'string' && c.name.trim()) return c.name.trim();
      if (v.author === feedId && typeof c.name === 'string' && c.name.trim()) return c.name.trim();
    }
    return null;
  }

  async function findFeedIdByName(name) {
    const q = String(name || '').trim().toLowerCase();
    if (!q) return null;
    const msgs = await readLog();
    let best = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const v = msgs[i].value || {};
      const c = v.content || {};
      if (!c || c.type !== 'about' || typeof c.name !== 'string') continue;
      if (c.name.trim().toLowerCase() !== q) continue;
      const fid = typeof c.about === 'string' && FEED_ID_RE.test(c.about) ? c.about : v.author;
      const ts = normMs(v.timestamp || msgs[i].timestamp || Date.now());
      if (!best || ts > best.ts) best = { id: fid, ts };
    }
    return best ? best.id : null;
  }

  async function resolveTarget(candidateInput) {
    const s = String(candidateInput || '').trim();
    if (!s) return null;
    const tribes = await listTribesAny();
    const t = tribes.find(tr =>
      tr.id === s ||
      (tr.title && tr.title.toLowerCase() === s.toLowerCase()) ||
      (tr.name && tr.name.toLowerCase() === s.toLowerCase())
    );
    if (t) {
      return { type: 'tribe', id: t.id, title: t.title || t.name || t.id, members: ensureArray(t.members) };
    }
    if (FEED_ID_RE.test(s)) {
      const title = await getInhabitantTitleSSB(s);
      return { type: 'inhabitant', id: s, title: title || s, members: [] };
    }
    const fid = await findFeedIdByName(s);
    if (fid) {
      const title = await getInhabitantTitleSSB(fid);
      return { type: 'inhabitant', id: fid, title: title || s, members: [] };
    }
    return null;
  }

  function majorityThreshold(total) { return Math.ceil(Number(total || 0) * 0.8); }
  function minorityThreshold(total) { return Math.ceil(Number(total || 0) * 0.2); }
  function democracyThreshold(total) { return Math.floor(Number(total || 0) / 2) + 1; }
  function passesThreshold(method, total, yes) {
    const m = String(method || '').toUpperCase();
    if (m === 'DEMOCRACY' || m === 'ANARCHY') return yes >= democracyThreshold(total);
    if (m === 'MAJORITY') return yes >= majorityThreshold(total);
    if (m === 'MINORITY') return yes >= minorityThreshold(total);
    return false;
  }
  function requiredVotes(method, total) {
    const m = String(method || '').toUpperCase();
    if (m === 'DEMOCRACY' || m === 'ANARCHY') return democracyThreshold(total);
    if (m === 'MAJORITY') return majorityThreshold(total);
    if (m === 'MINORITY') return minorityThreshold(total);
    return 0;
  }

  async function listCandidaturesOpenRaw() {
    const all = await listByType('parliamentCandidature');
    const filtered = all.filter(c => (c.status || 'OPEN') === 'OPEN');
    return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async function getFirstUserTimestamp(feedId) {
    const ssbClient = await openSsb();
    return new Promise((resolve) => {
      pull(
        ssbClient.createUserStream({ id: feedId, reverse: false }),
        pull.filter(m => m && m.value && m.value.content && m.value.content.type !== 'tombstone'),
        pull.take(1),
        pull.collect((err, arr) => {
          if (err || !arr || !arr.length) return resolve(Date.now());
          const m = arr[0];
          const ts = normMs((m.value && m.value.timestamp) || m.timestamp);
          resolve(ts || Date.now());
        })
      );
    });
  }

  async function getInhabitantKarma(feedId) {
    if (services.banking?.getUserEngagementScore) {
      try { return Number(await services.banking.getUserEngagementScore(feedId)) || 0; } catch { return 0; }
    }
    return 0;
  }

  async function getTribeSince(tribeId) {
    if (services.tribes?.getTribeById) {
      try {
        const t = await services.tribes.getTribeById(tribeId);
        if (t?.createdAt) return new Date(t.createdAt).getTime();
      } catch {}
    }
    return Date.now();
  }

  async function listCandidaturesOpen() {
    const rows = await listCandidaturesOpenRaw();
    const enriched = await Promise.all(rows.map(async c => {
      if (c.targetType === 'inhabitant') {
        const karma = await getInhabitantKarma(c.targetId);
        const since = await getFirstUserTimestamp(c.targetId);
        return { ...c, karma, profileSince: since };
      } else {
        const since = await getTribeSince(c.targetId);
        return { ...c, karma: 0, profileSince: since };
      }
    }));
    return enriched;
  }

  async function listTermsBase(filter = 'all') {
    const all = await listByType('parliamentTerm');
    const collapsed = collapseOverlappingTerms(all);
    let arr = collapsed.map(t => ({ ...t, status: isExpiredTerm(t) ? 'EXPIRED' : 'ACTIVE' }));
    if (filter === 'active') arr = arr.filter(t => t.status === 'ACTIVE');
    if (filter === 'expired') arr = arr.filter(t => t.status === 'EXPIRED');
    return arr.sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
  }

  async function getLatestTermAny() {
    const msgs = await readMyByTypes(['parliamentTerm', 'tombstone'], Math.max(50, Math.min(500, logLimit)));
    const terms = listByTypeFromMsgs(msgs, 'parliamentTerm');
    const collapsed = collapseOverlappingTerms(terms);
    return collapsed[0] || null;
  }

  async function getCurrentTermBase() {
    const t = await getLatestTermAny();
    if (!t) return null;
    return isExpiredTerm(t) ? null : t;
  }

  function currentCycleStart(term) {
    return term ? term.startAt : moment().subtract(TERM_DAYS, 'days').toISOString();
  }

  async function archiveAllCandidatures() {
    const all = await listCandidaturesOpenRaw();
    for (const c of all) {
      const tomb = { type: 'tombstone', target: c.id, deletedAt: nowISO(), author: userId };
      await publishMsg(tomb);
    }
  }

  async function chooseWinnerFromCandidaturesAsync(cands) {
    if (!cands.length) return null;
    const norm = cands.map(c => ({
      ...c,
      votes: Number(c.votes || 0),
      karma: Number(c.karma || 0),
      since: Number(c.profileSince || 0),
      createdAtMs: new Date(c.createdAt).getTime() || 0
    }));
    const totalVotes = norm.reduce((s, c) => s + c.votes, 0);
    if (totalVotes > 0) {
      const maxVotes = Math.max(...norm.map(c => c.votes));
      let tied = norm.filter(c => c.votes === maxVotes);
      if (tied.length === 1) return { chosen: tied[0], totalVotes, winnerVotes: maxVotes };
      const maxKarma = Math.max(...tied.map(c => c.karma));
      tied = tied.filter(c => c.karma === maxKarma);
      if (tied.length === 1) return { chosen: tied[0], totalVotes, winnerVotes: maxVotes };
      tied.sort((a, b) => (a.since || 0) - (b.since || 0));
      const oldestSince = tied[0].since || 0;
      tied = tied.filter(c => c.since === oldestSince);
      if (tied.length === 1) return { chosen: tied[0], totalVotes, winnerVotes: maxVotes };
      tied.sort((a, b) => a.createdAtMs - b.createdAtMs);
      const earliest = tied[0].createdAtMs;
      tied = tied.filter(c => c.createdAtMs === earliest);
      if (tied.length === 1) return { chosen: tied[0], totalVotes, winnerVotes: maxVotes };
      tied.sort((a, b) => String(a.targetId).localeCompare(String(b.targetId)));
      return { chosen: tied[0], totalVotes, winnerVotes: maxVotes };
    }
    const latest = norm.sort((a, b) => b.createdAtMs - a.createdAtMs)[0];
    return { chosen: latest, totalVotes: 0, winnerVotes: 0 };
  }

  async function summarizePoliciesForTerm(termOrId) {
    let termId = null;
    if (termOrId && typeof termOrId === 'object') {
      termId = termOrId.id || termOrId.startAt;
    } else {
      termId = termOrId;
    }
    const proposals = await listByType('parliamentProposal');
    const mine = termId ? proposals.filter(p => p.termId === termId) : [];
    const proposed = mine.length;
    let approved = 0;
    let declined = 0;
    let discarded = 0;
    for (const p of mine) {
      const baseStatus = String(p.status || 'OPEN').toUpperCase();
      let finalStatus = baseStatus;
      let isDiscarded = false;
      if (p.voteId && services.votes?.getVoteById) {
        try {
          const v = await services.votes.getVoteById(p.voteId);
          const votesMap = v.votes || {};
          const sum = Object.values(votesMap).reduce((s, n) => s + Number(n || 0), 0);
          const total = Number(v.totalVotes ?? v.total ?? sum);
          const yes = Number(votesMap.YES ?? votesMap.Yes ?? votesMap.yes ?? 0);
          const dl = v.deadline || v.endAt || v.expiresAt || null;
          const closed = v.status === 'CLOSED' || (dl && moment(dl).isBefore(moment()));
          const reached = passesThreshold(p.method, total, yes);
          if (!closed) {
            if (dl && moment(dl).isBefore(moment()) && !reached) isDiscarded = true;
            else finalStatus = 'OPEN';
          } else {
            finalStatus = reached ? 'APPROVED' : 'REJECTED';
          }
        } catch {}
      } else {
        if (baseStatus === 'OPEN' && p.deadline && moment(p.deadline).isBefore(moment())) isDiscarded = true;
      }
      if (isDiscarded) {
        discarded++;
        continue;
      }
      if (finalStatus === 'ENACTED' || finalStatus === 'APPROVED') {
        approved++;
        continue;
      }
      if (finalStatus === 'REJECTED') {
        declined++;
        continue;
      }
    }
    const revs = await listByType('parliamentRevocation');
    const revocated = termId
      ? revs.filter(r => r.status === 'ENACTED' && r.termId === termId).length
      : 0;
    return { proposed, approved, declined, discarded, revocated };
  }

  async function computeGovernmentCard(term) {
    if (!term) return null;
    const method = term.method || 'DEMOCRACY';
    const isTribe = term.powerType === 'tribe';
    let members = 1;
    if (isTribe && term.powerId) {
      const tribe = services.tribes ? await services.tribes.getTribeById(term.powerId) : null;
      members = tribe && Array.isArray(tribe.members) ? tribe.members.length : 0;
    }
    const pol = await summarizePoliciesForTerm({ ...term });
    const eff = pol.proposed > 0 ? Math.round((pol.approved / pol.proposed) * 100) : 0;
    return {
      method,
      powerType: term.powerType,
      powerId: term.powerId,
      powerTitle: term.powerTitle,
      votesReceived: term.winnerVotes || 0,
      totalVotes: term.totalVotes || 0,
      members,
      since: term.startAt,
      end: term.endAt,
      proposed: pol.proposed,
      approved: pol.approved,
      declined: pol.declined,
      discarded: pol.discarded,
      revocated: pol.revocated,
      efficiency: eff
    };
  }

  async function countMyProposalsThisTerm(term) {
    const termId = term.id || term.startAt;
    const proposals = await listByType('parliamentProposal');
    const laws = await listByType('parliamentLaw');
    const nProp = proposals.filter(p => p.termId === termId && p.proposer === userId).length;
    const nLaw = laws.filter(l => l.termId === termId && l.proposer === userId).length;
    return nProp + nLaw;
  }

  async function closeExpiredKarmatocracy(term) {
    const termId = term.id || term.startAt;
    const all = await listByType('parliamentProposal');
    const pending = all.filter(p =>
      p.termId === termId &&
      String(p.method).toUpperCase() === 'KARMATOCRACY' &&
      (p.status || 'OPEN') !== 'ENACTED' &&
      p.deadline && moment().isAfter(parseISO(p.deadline))
    );
    if (!pending.length) return;
    const withKarma = await Promise.all(pending.map(async p => ({
      ...p,
      karma: await getInhabitantKarma(p.proposer),
      createdAtMs: new Date(p.createdAt).getTime() || 0
    })));
    withKarma.sort((a, b) => {
      if (b.karma !== a.karma) return b.karma - a.karma;
      if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
      return String(a.proposer).localeCompare(String(b.proposer));
    });
    const winner = withKarma[0];
    const losers = withKarma.slice(1);
    const approve = { ...stripId(winner), replaces: winner.id, status: 'APPROVED', updatedAt: nowISO() };
    await publishMsg(approve);
    for (const lo of losers) {
      const rej = { ...stripId(lo), replaces: lo.id, status: 'REJECTED', updatedAt: nowISO() };
      await publishMsg(rej);
    }
  }

  async function closeExpiredDictatorship(term) {
    const termId = term.id || term.startAt;
    const all = await listByType('parliamentProposal');
    const pending = all.filter(p =>
      p.termId === termId &&
      String(p.method).toUpperCase() === 'DICTATORSHIP' &&
      (p.status || 'OPEN') !== 'ENACTED' &&
      p.deadline && moment().isAfter(parseISO(p.deadline))
    );
    if (!pending.length) return;
    for (const p of pending) {
      const updated = { ...stripId(p), replaces: p.id, status: 'APPROVED', updatedAt: nowISO() };
      await publishMsg(updated);
    }
  }

  async function closeExpiredRevocationKarmatocracy(term) {
    const termId = term.id || term.startAt;
    const all = await listByType('parliamentRevocation');
    const pending = all.filter(p =>
      p.termId === termId &&
      String(p.method).toUpperCase() === 'KARMATOCRACY' &&
      (p.status || 'OPEN') !== 'ENACTED' &&
      p.deadline && moment().isAfter(parseISO(p.deadline))
    );
    if (!pending.length) return;
    for (const p of pending) {
      const updated = { ...stripId(p), replaces: p.id, status: 'APPROVED', updatedAt: nowISO() };
      await publishMsg(updated);
    }
  }

  async function closeExpiredRevocationDictatorship(term) {
    const termId = term.id || term.startAt;
    const all = await listByType('parliamentRevocation');
    const pending = all.filter(p =>
      p.termId === termId &&
      String(p.method).toUpperCase() === 'DICTATORSHIP' &&
      (p.status || 'OPEN') !== 'ENACTED' &&
      p.deadline && moment().isAfter(parseISO(p.deadline))
    );
    if (!pending.length) return;
    for (const p of pending) {
      const updated = { ...stripId(p), replaces: p.id, status: 'APPROVED', updatedAt: nowISO() };
      await publishMsg(updated);
    }
  }

  async function createRevocation({ lawId, title, reasons }) {
    const term = await getCurrentTermBase();
    if (!term) throw new Error('No active government');
    const allowed = await canPropose();
    if (!allowed) throw new Error('You are not in the goverment, yet.');
    const lawIdStr = String(lawId || '').trim();
    if (!lawIdStr) throw new Error('Law required');
    const laws = await listByType('parliamentLaw');
    const law = laws.find(l => l.id === lawIdStr);
    if (!law) throw new Error('Law not found');
    const method = String(term.method || 'DEMOCRACY').toUpperCase();
    const deadline = moment().add(REVOCATION_DAYS, 'days').toISOString();
    if (method === 'DICTATORSHIP' || method === 'KARMATOCRACY') {
      const rev = {
        type: 'parliamentRevocation',
        lawId: lawIdStr,
        title: title || law.question || '',
        reasons: reasons || '',
        method,
        termId: term.id || term.startAt,
        proposer: userId,
        status: 'OPEN',
        deadline,
        createdAt: nowISO()
      };
      return await publishMsg(rev);
    }
    const voteMsg = await services.votes.createVote(
      `Revoke: ${title || law.question || ''}`,
      deadline,
      ['YES', 'NO', 'ABSTENTION'],
      [`gov:${term.id || term.startAt}`, `govMethod:${method}`, 'revocation']
    );
    const rev = {
      type: 'parliamentRevocation',
      lawId: lawIdStr,
      title: title || law.question || '',
      reasons: reasons || '',
      method,
      voteId: voteMsg.key || voteMsg.id,
      termId: term.id || term.startAt,
      proposer: userId,
      status: 'OPEN',
      createdAt: nowISO()
    };
    return await publishMsg(rev);
  }

  async function closeRevocation(revId) {
    const ssbClient = await openSsb();
    const msg = await new Promise((resolve, reject) =>
      ssbClient.get(revId, (e, m) => (e || !m) ? reject(new Error('Revocation not found')) : resolve(m))
    );
    if (msg.content?.type !== 'parliamentRevocation') throw new Error('Revocation not found');
    const p = msg.content;
    const currentStatus = String(p.status || 'OPEN').toUpperCase();
    if (currentStatus === 'ENACTED' || currentStatus === 'REJECTED' || currentStatus === 'DISCARDED') return p;
    const method = String(p.method || '').toUpperCase();
    if (method === 'DICTATORSHIP') {
      if (currentStatus === 'APPROVED') return p;
      const updated = { ...p, replaces: revId, status: 'APPROVED', updatedAt: nowISO() };
      await publishMsg(updated);
      return updated;
    }
    if (method === 'KARMATOCRACY') return p;
    const v = await services.votes.getVoteById(p.voteId);
    const votesMap = v.votes || {};
    const sum = Object.values(votesMap).reduce((s, n) => s + Number(n || 0), 0);
    const total = Number(v.totalVotes ?? v.total ?? sum);
    const yes = Number(votesMap.YES ?? votesMap.Yes ?? votesMap.yes ?? 0);
    let ok = false;
    if (method === 'DEMOCRACY' || method === 'ANARCHY') ok = yes >= democracyThreshold(total);
    else if (method === 'MAJORITY') ok = yes >= majorityThreshold(total);
    else if (method === 'MINORITY') ok = yes >= minorityThreshold(total);
    const desiredStatus = ok ? 'APPROVED' : 'REJECTED';
    if (currentStatus === desiredStatus) return p;
    const updated = { ...p, replaces: revId, status: desiredStatus, updatedAt: nowISO() };
    await publishMsg(updated);
    return updated;
  }

  async function proposeCandidature({ candidateId, method }) {
    const m = String(method || '').toUpperCase();
    if (!METHODS.includes(m)) throw new Error('Invalid method');
    const target = await resolveTarget(candidateId);
    if (!target) throw new Error('Candidate not found');
    const term = await getCurrentTermBase();
    const since = currentCycleStart(term);
    const myAll = await listByType('parliamentCandidature');
    const mineThisCycle = myAll.filter(c => c.proposer === userId && new Date(c.createdAt) >= new Date(since));
    if (mineThisCycle.length >= 3) throw new Error('Candidate limit reached');
    const open = await listCandidaturesOpenRaw();
    const duplicate = open.find(c => c.targetType === target.type && c.targetId === target.id && new Date(c.createdAt) >= new Date(since));
    if (duplicate) throw new Error('Candidate already proposed this cycle');
    const content = {
      type: 'parliamentCandidature',
      targetType: target.type,
      targetId: target.id,
      targetTitle: target.title,
      method: m,
      votes: 0,
      voters: [],
      proposer: userId,
      status: 'OPEN',
      createdAt: nowISO()
    };
    return await publishMsg(content);
  }

  async function voteCandidature(candidatureMsgId) {
    const ssbClient = await openSsb();
    const open = await listCandidaturesOpenRaw();
    const already = open.some(c => ensureArray(c.voters).includes(userId));
    if (already) throw new Error('Already voted this cycle');
    const msg = await new Promise((resolve, reject) =>
      ssbClient.get(candidatureMsgId, (e, m) => (e || !m) ? reject(new Error('Candidate not found')) : resolve(m))
    );
    if (msg.content?.type !== 'parliamentCandidature') throw new Error('Candidate not found');
    const c = msg.content;
    if ((c.status || 'OPEN') !== 'OPEN') throw new Error('Closed');
    const updated = { ...c, replaces: candidatureMsgId, votes: Number(c.votes || 0) + 1, voters: [...ensureArray(c.voters), userId], updatedAt: nowISO() };
    return await publishMsg(updated);
  }

  async function createProposal({ title, description }) {
    let term = await getCurrentTermBase();
    if (!term) {
      await resolveElection();
      term = await getCurrentTermBase();
    }
    if (!term) throw new Error('No active government');
    const allowed = await canPropose();
    if (!allowed) throw new Error('You are not in the goverment, yet.');
    if (!title || !title.trim()) throw new Error('Title required');
    if (String(description || '').length > 1000) throw new Error('Description too long');
    const used = await countMyProposalsThisTerm(term);
    if (used >= 3) throw new Error('Proposal limit reached');
    const method = String(term.method || 'DEMOCRACY').toUpperCase();
    const deadline = moment().add(PROPOSAL_DAYS, 'days').toISOString();
    if (method === 'DICTATORSHIP' || method === 'KARMATOCRACY') {
      const proposal = { type: 'parliamentProposal', title, description: description || '', method, termId: term.id || term.startAt, proposer: userId, status: 'OPEN', deadline, createdAt: nowISO() };
      return await publishMsg(proposal);
    }
    const voteMsg = await services.votes.createVote(title, deadline, ['YES', 'NO', 'ABSTENTION'], [`gov:${term.id || term.startAt}`, `govMethod:${method}`, 'proposal']);
    const proposal = { type: 'parliamentProposal', title, description: description || '', method, voteId: voteMsg.key || voteMsg.id, termId: term.id || term.startAt, proposer: userId, status: 'OPEN', createdAt: nowISO() };
    return await publishMsg(proposal);
  }

  async function closeProposal(proposalId) {
    const ssbClient = await openSsb();
    const msg = await new Promise((resolve, reject) =>
      ssbClient.get(proposalId, (e, m) => (e || !m) ? reject(new Error('Proposal not found')) : resolve(m))
    );
    if (msg.content?.type !== 'parliamentProposal') throw new Error('Proposal not found');
    const p = msg.content;
    const currentStatus = String(p.status || 'OPEN').toUpperCase();
    if (currentStatus === 'ENACTED' || currentStatus === 'REJECTED' || currentStatus === 'DISCARDED') return p;
    const method = String(p.method || '').toUpperCase();
    if (method === 'DICTATORSHIP') {
      if (currentStatus === 'APPROVED') return p;
      const updated = { ...p, replaces: proposalId, status: 'APPROVED', updatedAt: nowISO() };
      await publishMsg(updated);
      return updated;
    }
    if (method === 'KARMATOCRACY') return p;
    const v = await services.votes.getVoteById(p.voteId);
    const votesMap = v.votes || {};
    const sum = Object.values(votesMap).reduce((s, n) => s + Number(n || 0), 0);
    const total = Number(v.totalVotes ?? v.total ?? sum);
    const yes = Number(votesMap.YES ?? votesMap.Yes ?? votesMap.yes ?? 0);
    let ok = false;
    if (method === 'DEMOCRACY' || method === 'ANARCHY') ok = yes >= democracyThreshold(total);
    else if (method === 'MAJORITY') ok = yes >= majorityThreshold(total);
    else if (method === 'MINORITY') ok = yes >= minorityThreshold(total);
    const desiredStatus = ok ? 'APPROVED' : 'REJECTED';
    if (currentStatus === desiredStatus) return p;
    const updated = { ...p, replaces: proposalId, status: desiredStatus, updatedAt: nowISO() };
    await publishMsg(updated);
    return updated;
  }

  async function sweepProposals() {
    if (sweepInFlight) return sweepInFlight;
    sweepInFlight = (async () => {
      const term = await getCurrentTermBase();
      if (!term) return;
      await closeExpiredKarmatocracy(term);
      await closeExpiredDictatorship(term);

      const allProps = await listByType('parliamentProposal');
      const voteProps = allProps.filter(p => {
        const m = String(p.method || '').toUpperCase();
        return (m === 'DEMOCRACY' || m === 'ANARCHY' || m === 'MAJORITY' || m === 'MINORITY') && p.voteId;
      });

      for (const p of voteProps) {
        try {
          const v = await services.votes.getVoteById(p.voteId);
          const votesMap = v.votes || {};
          const sum = Object.values(votesMap).reduce((s, n) => s + Number(n || 0), 0);
          const total = Number(v.totalVotes ?? v.total ?? sum);
          const yes = Number(votesMap.YES ?? votesMap.Yes ?? votesMap.yes ?? 0);
          const deadline = v.deadline || v.endAt || v.expiresAt || null;
          const closed = v.status === 'CLOSED' || (deadline && moment(deadline).isBefore(moment()));
          if (closed) { try { await closeProposal(p.id); } catch {} ; continue; }
          if ((p.status || 'OPEN') === 'OPEN' && passesThreshold(p.method, total, yes)) {
            const updated = { ...stripId(p), replaces: p.id, status: 'APPROVED', updatedAt: nowISO() };
            await publishMsg(updated);
          }
        } catch {}
      }

      await closeExpiredRevocationKarmatocracy(term);
      await closeExpiredRevocationDictatorship(term);

      const revs = await listByType('parliamentRevocation');
      const voteRevs = revs.filter(p => {
        const m = String(p.method || '').toUpperCase();
        return (m === 'DEMOCRACY' || m === 'ANARCHY' || m === 'MAJORITY' || m === 'MINORITY') && p.voteId;
      });

      for (const p of voteRevs) {
        try {
          const v = await services.votes.getVoteById(p.voteId);
          const votesMap = v.votes || {};
          const sum = Object.values(votesMap).reduce((s, n) => s + Number(n || 0), 0);
          const total = Number(v.totalVotes ?? v.total ?? sum);
          const yes = Number(votesMap.YES ?? votesMap.Yes ?? votesMap.yes ?? 0);
          const deadline = v.deadline || v.endAt || v.expiresAt || null;
          const closed = v.status === 'CLOSED' || (deadline && moment(deadline).isBefore(moment()));
          if (closed) { try { await closeRevocation(p.id); } catch {} ; continue; }
          if ((p.status || 'OPEN') === 'OPEN' && passesThreshold(p.method, total, yes)) {
            const updated = { ...stripId(p), replaces: p.id, status: 'APPROVED', updatedAt: nowISO() };
            await publishMsg(updated);
          }
        } catch {}
      }
    })().finally(() => { sweepInFlight = null; });

    return sweepInFlight;
  }

  async function getActorMeta({ targetType, targetId }) {
    return await actorMeta({ targetType, targetId });
  }

  async function listCandidatures(filter = 'OPEN') {
    if (filter === 'OPEN') return await listCandidaturesOpen();
    const all = await listByType('parliamentCandidature');
    return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async function listTerms(filter = 'all') {
    return await listTermsBase(filter);
  }

  async function getCurrentTerm() {
    return await getCurrentTermBase();
  }

  async function listLeaders() {
    const terms = await listTermsBase('all');
    const map = new Map();
    for (const t of terms) {
      if (!(t.powerType === 'tribe' || t.powerType === 'inhabitant')) continue;
      const k = `${t.powerType}:${t.powerId}`;
      if (!map.has(k)) map.set(k, { powerType: t.powerType, powerId: t.powerId, powerTitle: t.powerTitle, inPower: 0, presented: 0, proposed: 0, approved: 0, declined: 0, discarded: 0, revocated: 0 });
      const rec = map.get(k);
      rec.inPower += 1;
      const sum = await summarizePoliciesForTerm(t);
      rec.proposed += sum.proposed;
      rec.approved += sum.approved;
      rec.declined += sum.declined;
      rec.discarded += sum.discarded;
      rec.revocated += sum.revocated;
    }
    const cands = await listByType('parliamentCandidature');
    for (const c of cands) {
      const k = `${c.targetType}:${c.targetId}`;
      if (!map.has(k)) map.set(k, { powerType: c.targetType, powerId: c.targetId, powerTitle: c.targetTitle, inPower: 0, presented: 0, proposed: 0, approved: 0, declined: 0, discarded: 0, revocated: 0 });
      const rec = map.get(k);
      rec.presented = (rec.presented || 0) + 1;
    }
    const rows = [...map.values()].map(r => ({ ...r, presented: r.presented || 0, efficiency: (r.proposed > 0 ? r.approved / r.proposed : 0) }));
    rows.sort((a, b) => {
      if (b.approved !== a.approved) return b.approved - a.approved;
      if ((b.efficiency || 0) !== (a.efficiency || 0)) return (b.efficiency || 0) - (a.efficiency || 0);
      if (b.inPower !== a.inPower) return b.inPower - a.inPower;
      if (b.proposed !== a.proposed) return b.proposed - a.proposed;
      return String(a.powerId).localeCompare(String(b.powerId));
    });
    return rows;
  }

  async function listProposalsCurrent() {
    const all = await listByType('parliamentProposal');
    const rows = all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const out = [];
    for (const p of rows) {
      let deadline = p.deadline || null;
      let yes = 0;
      let total = 0;
      const baseStatus = String(p.status || 'OPEN').toUpperCase();
      let derivedStatus = baseStatus;
      if (p.voteId && services.votes?.getVoteById) {
        try {
          const v = await services.votes.getVoteById(p.voteId);
          const votesMap = v.votes || {};
          const sum = Object.values(votesMap).reduce((s, n) => s + Number(n || 0), 0);
          total = Number(v.totalVotes ?? v.total ?? sum);
          yes = Number(votesMap.YES ?? votesMap.Yes ?? votesMap.yes ?? 0);
          deadline = deadline || v.deadline || v.endAt || v.expiresAt || null;
          const closed = v.status === 'CLOSED' || (deadline && moment(deadline).isBefore(moment()));
          const reached = passesThreshold(p.method, total, yes);
          if (closed) derivedStatus = reached ? 'APPROVED' : 'REJECTED';
          else derivedStatus = 'OPEN';
        } catch {
          derivedStatus = baseStatus;
        }
      } else {
        if (baseStatus === 'OPEN' && p.deadline && moment(p.deadline).isBefore(moment())) derivedStatus = 'DISCARDED';
      }
      if (derivedStatus === 'ENACTED' || derivedStatus === 'REJECTED' || derivedStatus === 'DISCARDED') continue;
      const needed = requiredVotes(p.method, total);
      const onTrack = passesThreshold(p.method, total, yes);
      out.push({ ...p, deadline, yes, total, needed, onTrack, derivedStatus });
    }
    return out;
  }

  async function listFutureLawsCurrent() {
    const term = await getCurrentTermBase();
    if (!term) return [];
    const termId = term.id || term.startAt;
    const all = await listByType('parliamentProposal');
    const rows = all
      .filter(p => p.termId === termId)
      .filter(p => p.status === 'APPROVED')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const out = [];
    for (const p of rows) {
      let yes = 0;
      let total = 0;
      let deadline = p.deadline || null;
      let voteClosed = true;
      if (p.voteId && services.votes?.getVoteById) {
        try {
          const v = await services.votes.getVoteById(p.voteId);
          const votesMap = v.votes || {};
          const sum = Object.values(votesMap).reduce((s, n) => s + Number(n || 0), 0);
          total = Number(v.totalVotes ?? v.total ?? sum);
          yes = Number(votesMap.YES ?? votesMap.Yes ?? votesMap.yes ?? 0);
          deadline = deadline || v.deadline || v.endAt || v.expiresAt || null;
          voteClosed = v.status === 'CLOSED' || (deadline && moment(deadline).isBefore(moment()));
          if (!voteClosed) continue;
        } catch {}
      }
      const needed = requiredVotes(p.method, total);
      out.push({ ...p, deadline, yes, total, needed });
    }
    return out;
  }

  async function listRevocationsCurrent() {
    const all = await listByType('parliamentRevocation');
    const rows = all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const out = [];
    for (const p of rows) {
      let deadline = p.deadline || null;
      let yes = 0;
      let total = 0;
      const baseStatus = String(p.status || 'OPEN').toUpperCase();
      let derivedStatus = baseStatus;
      if (p.voteId && services.votes?.getVoteById) {
        try {
          const v = await services.votes.getVoteById(p.voteId);
          const votesMap = v.votes || {};
          const sum = Object.values(votesMap).reduce((s, n) => s + Number(n || 0), 0);
          total = Number(v.totalVotes ?? v.total ?? sum);
          yes = Number(votesMap.YES ?? votesMap.Yes ?? votesMap.yes ?? 0);
          deadline = deadline || v.deadline || v.endAt || v.expiresAt || null;
          const closed = v.status === 'CLOSED' || (deadline && moment(deadline).isBefore(moment()));
          const reached = passesThreshold(p.method, total, yes);
          if (closed) derivedStatus = reached ? 'APPROVED' : 'REJECTED';
          else derivedStatus = 'OPEN';
        } catch {
          derivedStatus = baseStatus;
        }
      } else {
        if (baseStatus === 'OPEN' && p.deadline && moment(p.deadline).isBefore(moment())) derivedStatus = 'DISCARDED';
      }
      if (derivedStatus === 'ENACTED' || derivedStatus === 'REJECTED' || derivedStatus === 'DISCARDED') continue;
      const needed = requiredVotes(p.method, total);
      const onTrack = passesThreshold(p.method, total, yes);
      out.push({ ...p, deadline, yes, total, needed, onTrack, derivedStatus });
    }
    return out;
  }

  async function listFutureRevocationsCurrent() {
    const term = await getCurrentTermBase();
    if (!term) return [];
    const termId = term.id || term.startAt;
    const all = await listByType('parliamentRevocation');
    const rows = all
      .filter(p => p.termId === termId)
      .filter(p => p.status === 'APPROVED')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const out = [];
    for (const p of rows) {
      let yes = 0;
      let total = 0;
      let deadline = p.deadline || null;
      let voteClosed = true;
      if (p.voteId && services.votes?.getVoteById) {
        try {
          const v = await services.votes.getVoteById(p.voteId);
          const votesMap = v.votes || {};
          const sum = Object.values(votesMap).reduce((s, n) => s + Number(n || 0), 0);
          total = Number(v.totalVotes ?? v.total ?? sum);
          yes = Number(votesMap.YES ?? votesMap.Yes ?? votesMap.yes ?? 0);
          deadline = deadline || v.deadline || v.endAt || v.expiresAt || null;
          voteClosed = v.status === 'CLOSED' || (deadline && moment(deadline).isBefore(moment()));
          if (!voteClosed) continue;
        } catch {}
      }
      const needed = requiredVotes(p.method, total);
      out.push({ ...p, deadline, yes, total, needed });
    }
    return out;
  }

  async function countRevocationsEnacted() {
    const all = await listByType('parliamentRevocation');
    return all.filter(r => r.status === 'ENACTED').length;
  }

  async function voteSnapshot(voteId) {
    if (!voteId || !services.votes?.getVoteById) return null;
    try {
      const v = await services.votes.getVoteById(voteId);
      const vm = v?.votes || {};
      const sum = Object.values(vm).reduce((s, n) => s + Number(n || 0), 0);
      const total = Number(v.totalVotes ?? v.total ?? sum);
      return {
        YES: Number(vm.YES ?? vm.Yes ?? vm.yes ?? 0),
        NO: Number(vm.NO ?? vm.No ?? vm.no ?? 0),
        ABSTENTION: Number(vm.ABSTENTION ?? vm.Abstention ?? vm.abstention ?? 0),
        total
      };
    } catch {
      return null;
    }
  }

  async function enactApprovedChanges(expiringTerm) {
    if (!expiringTerm) return;
    const termId = expiringTerm.id || expiringTerm.startAt;

    const proposals = await listByType('parliamentProposal');
    const revocations = await listByType('parliamentRevocation');

    const approvedProps = proposals.filter(p => p.termId === termId && p.status === 'APPROVED');
    for (const p of approvedProps) {
      const snap = await voteSnapshot(p.voteId);
      const votesFinal =
        (p.votes && Object.keys(p.votes).length ? p.votes : null) ||
        snap ||
        { YES: 1, NO: 0, ABSTENTION: 0, total: 1 };

      const law = {
        type: 'parliamentLaw',
        question: p.title,
        description: p.description || '',
        method: p.method,
        proposer: p.proposer,
        termId: p.termId,
        voteId: p.voteId || null,
        votes: votesFinal,
        proposedAt: p.createdAt,
        proposalId: p.id,
        enactedAt: nowISO()
      };

      await publishMsg(law);
      const updated = { ...stripId(p), replaces: p.id, status: 'ENACTED', updatedAt: nowISO() };
      await publishMsg(updated);
    }

    const approvedRevs = revocations.filter(r => r.termId === termId && r.status === 'APPROVED');
    for (const r of approvedRevs) {
      const tomb = { type: 'tombstone', target: r.lawId, deletedAt: nowISO(), author: userId };
      await publishMsg(tomb);

      const snap = await voteSnapshot(r.voteId);
      const updated = {
        ...stripId(r),
        replaces: r.id,
        status: 'ENACTED',
        votes: (r.votes && Object.keys(r.votes).length ? r.votes : null) || snap || undefined,
        updatedAt: nowISO()
      };
      await publishMsg(updated);
    }
  }

  async function resolveElectionImpl() {
    const now = moment();
    const latestAny = await getLatestTermAny();
    if (latestAny && !isExpiredTerm(latestAny)) return latestAny;

    if (latestAny && isExpiredTerm(latestAny)) {
      try { await enactApprovedChanges(latestAny); } catch {}
    }

    const open = await listCandidaturesOpen();
    let chosen = null;
    let totalVotes = 0;
    let winnerVotes = 0;

    if (open.length) {
      const pick = await chooseWinnerFromCandidaturesAsync(open);
      chosen = pick && pick.chosen;
      totalVotes = (pick && pick.totalVotes) || 0;
      winnerVotes = (pick && pick.winnerVotes) || 0;
    }

    const startAt = now.toISOString();
    const endAt = moment(startAt).add(TERM_DAYS, 'days').toISOString();

    if (!chosen) {
      const termAnarchy = {
        type: 'parliamentTerm',
        method: 'ANARCHY',
        powerType: 'none',
        powerId: null,
        powerTitle: 'ANARCHY',
        winnerTribeId: null,
        winnerInhabitantId: null,
        winnerVotes: 0,
        totalVotes: 0,
        startAt,
        endAt,
        createdBy: userId,
        createdAt: nowISO()
      };

      const resAnarchy = await publishMsg(termAnarchy);
      try {
        await sleep(250);
        const canonical = await getCurrentTermBase();
        const myId = resAnarchy.key || resAnarchy.id;
        if (canonical && canonical.id && myId && canonical.id !== myId) {
          const tomb = { type: 'tombstone', target: myId, deletedAt: nowISO(), author: userId };
          await publishMsg(tomb);
          await archiveAllCandidatures();
          return canonical;
        }
      } catch {}
      await archiveAllCandidatures();
      return resAnarchy;
    }

    const term = {
      type: 'parliamentTerm',
      method: chosen.method,
      powerType: chosen.targetType,
      powerId: chosen.targetId,
      powerTitle: chosen.targetTitle,
      winnerTribeId: chosen.targetType === 'tribe' ? chosen.targetId : null,
      winnerInhabitantId: chosen.targetType === 'inhabitant' ? chosen.targetId : null,
      winnerVotes,
      totalVotes,
      startAt,
      endAt,
      createdBy: userId,
      createdAt: nowISO()
    };

    const res = await publishMsg(term);
    try {
      await sleep(250);
      const canonical = await getCurrentTermBase();
      const myId = res.key || res.id;
      if (canonical && canonical.id && myId && canonical.id !== myId) {
        const tomb = { type: 'tombstone', target: myId, deletedAt: nowISO(), author: userId };
        await publishMsg(tomb);
        await archiveAllCandidatures();
        return canonical;
      }
    } catch {}
    await archiveAllCandidatures();
    return res;
  }

  async function resolveElection() {
    if (electionInFlight) return electionInFlight;
    electionInFlight = resolveElectionImpl().finally(() => { electionInFlight = null; });
    return electionInFlight;
  }

  async function getGovernmentCard() {
    const term = await getCurrentTermBase();
    if (!term) return null;
    return await computeGovernmentCard({ ...term, id: term.id || term.startAt });
  }

  async function listLaws() {
    const items = await listByType('parliamentLaw');
    return items.sort((a, b) => new Date(b.enactedAt) - new Date(a.enactedAt));
  }

  async function listHistorical() {
    const list = await listTermsBase('expired');
    const out = [];
    for (const t of list) {
      const card = await computeGovernmentCard({ ...t, id: t.id || t.startAt });
      if (card) out.push(card);
    }
    return out;
  }

  async function canPropose() {
    const term = await getCurrentTermBase();
    if (!term) return true;
    if (String(term.method || '').toUpperCase() === 'ANARCHY') return true;
    if (term.powerType === 'inhabitant') return term.powerId === userId;
    if (term.powerType === 'tribe') {
      const tribe = services.tribes ? await services.tribes.getTribeById(term.powerId) : null;
      const members = ensureArray(tribe?.members);
      return members.includes(userId);
    }
    return false;
  }

  return {
    proposeCandidature,
    voteCandidature,
    resolveElection,
    getGovernmentCard,
    listLaws,
    listHistorical,
    canPropose,
    listProposalsCurrent,
    listFutureLawsCurrent,
    createProposal,
    closeProposal,
    listCandidatures,
    listTerms,
    getCurrentTerm,
    listLeaders,
    sweepProposals,
    getActorMeta,
    createRevocation,
    listRevocationsCurrent,
    listFutureRevocationsCurrent,
    closeRevocation,
    countRevocationsEnacted
  };
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function collapseOverlappingTerms(terms = []) {
  if (!terms.length) return [];
  const sorted = [...terms].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  const groups = [];
  for (const t of sorted) {
    const tStart = new Date(t.startAt).getTime();
    const tEnd = new Date(t.endAt).getTime();
    let placed = false;
    for (const g of groups) {
      if (tStart < g.maxEnd && tEnd > g.minStart) {
        g.items.push(t);
        if (tStart < g.minStart) g.minStart = tStart;
        if (tEnd > g.maxEnd) g.maxEnd = tEnd;
        placed = true;
        break;
      }
    }
    if (!placed) groups.push({ items: [t], minStart: tStart, maxEnd: tEnd });
  }
  const winners = groups.map(g => {
    g.items.sort((a, b) => {
      const aAn = String(a.method || '').toUpperCase() === 'ANARCHY' ? 1 : 0;
      const bAn = String(b.method || '').toUpperCase() === 'ANARCHY' ? 1 : 0;
      if (aAn !== bAn) return aAn - bAn;
      const aC = new Date(a.createdAt || a.startAt).getTime();
      const bC = new Date(b.createdAt || b.startAt).getTime();
      if (aC !== bC) return aC - bC;
      const aS = new Date(a.startAt).getTime();
      const bS = new Date(b.startAt).getTime();
      if (aS !== bS) return aS - bS;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
    return g.items[0];
  });
  return winners.sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
}

