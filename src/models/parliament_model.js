const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { getConfig } = require('../configs/config-manager.js');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { readTyped } = require('./typed_log');
const { buildVoteResults } = require('../backend/vote_tally');

const logLimit = getConfig().ssbLogStream?.limit || 1000;
const PARLIAMENT_TYPES = [
  'parliamentCandidature', 'parliamentCandidatureVote', 'parliamentTerm',
  'parliamentProposal', 'parliamentRevocation', 'parliamentLaw',
  'tribe', 'about', 'tombstone'
];
const VOTE_LOG_TYPES = ['votes', 'votesVote', 'tombstone'];
const PROPOSER_TYPES = new Set(['parliamentCandidature', 'parliamentProposal', 'parliamentRevocation']);
const TRIBE_PARLIAMENT_TYPES = [
  'tribeParliamentTerm', 'tribeParliamentCandidature', 'tribeParliamentRule',
  'parliamentCandidature', 'tombstone'
];
const TERM_DAYS = 60;
const PROPOSAL_DAYS = 7;
const REVOCATION_DAYS = 15;
const PROPOSAL_QUORUM = 2;
const QUORUM_RATIO = 0.25;
const VOTE_METHODS = new Set(['DEMOCRACY', 'ANARCHY', 'MAJORITY', 'MINORITY']);
const METHODS = ['DEMOCRACY', 'MAJORITY', 'MINORITY', 'DICTATORSHIP', 'KARMATOCRACY'];
const FEED_ID_RE = /^@.+\.ed25519$/;
const TERM_EPOCH = Date.UTC(2020, 0, 1);
const TERM_SPAN_MS = TERM_DAYS * 86400000;

const termWindowFor = (at = Date.now()) => {
  const ms = at instanceof Date ? at.getTime() : Number(at);
  const base = Number.isFinite(ms) ? ms : Date.now();
  const index = Math.floor((base - TERM_EPOCH) / TERM_SPAN_MS);
  const startMs = TERM_EPOCH + index * TERM_SPAN_MS;
  return {
    cycle: index,
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(startMs + TERM_SPAN_MS).toISOString()
  };
};

const HEMICYCLE_MAX_SEATS = 400;

const hemicycleQuorum = (n) => Math.max(PROPOSAL_QUORUM, Math.ceil(Number(n || 0) * QUORUM_RATIO));

const passThreshold = (method, n) => {
  const m = String(method || '').toUpperCase();
  const total = Number(n || 0);
  if (m === 'DEMOCRACY' || m === 'ANARCHY') return Math.floor(total / 2) + 1;
  if (m === 'MAJORITY') return Math.ceil(total * 0.8);
  if (m === 'MINORITY') return Math.ceil(total * 0.2);
  return null;
};

const buildHemicycle = ({ census = [], candidatures = [], powerType = 'none', powerId = null, leaderId = null, method = 'ANARCHY', powerMembers = [], houses = {} } = {}) => {
  const people = [];
  const seen = new Set();
  for (const p of census) {
    const id = typeof p === 'string' ? p : (p && p.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    people.push({ id, name: (p && typeof p === 'object' && p.name) ? String(p.name) : '' });
  }
  const n = people.length;
  const m = String(method || 'ANARCHY').toUpperCase();
  const power = new Set((Array.isArray(powerMembers) ? powerMembers : []).map(String));
  const leader = leaderId || (powerType === 'inhabitant' ? powerId : null);

  const cands = (Array.isArray(candidatures) ? candidatures : []).map(c => ({
    id: String(c.id || ''),
    label: String(c.label || c.targetTitle || c.targetId || c.candidateId || ''),
    href: c.href || null,
    targetType: c.targetType || (c.candidateId ? 'inhabitant' : 'inhabitant'),
    targetId: String(c.targetId || c.candidateId || ''),
    method: String(c.method || '').toUpperCase(),
    voters: Array.from(new Set((Array.isArray(c.voters) ? c.voters : []).map(String))).filter(v => v !== String(c.targetId || c.candidateId || ''))
  }));
  const isGovernment = (c) => powerType !== 'none' && powerId && c.targetId === String(powerId);
  const government = cands.find(isGovernment) || null;
  const opposition = cands.filter(c => c !== government && c.voters.some(v => seen.has(v)));
  opposition.sort((a, b) => b.voters.length - a.voters.length || a.label.localeCompare(b.label));

  const blocOf = new Map();
  if (leader && seen.has(String(leader)) && powerType !== 'none') blocOf.set(String(leader), 'gov');
  if (powerType === 'tribe') for (const id of power) if (seen.has(id)) blocOf.set(id, 'gov');
  if (government) for (const v of government.voters) if (seen.has(v) && !blocOf.has(v)) blocOf.set(v, 'gov');
  opposition.forEach((c, i) => { for (const v of c.voters) if (seen.has(v) && !blocOf.has(v)) blocOf.set(v, `opp${i}`); });

  const seats = people.map(p => ({
    id: p.id,
    name: p.name,
    bloc: blocOf.get(p.id) || 'none',
    leader: !!leader && p.id === String(leader),
    inPower: power.has(p.id),
    house: houses && houses[p.id] ? String(houses[p.id]) : null
  }));
  const order = { gov: 0 };
  opposition.forEach((c, i) => { order[`opp${i}`] = i + 1; });
  order.none = opposition.length + 1;
  seats.sort((a, b) => (order[a.bloc] - order[b.bloc]) || (b.leader - a.leader) || a.id.localeCompare(b.id));

  const count = (key) => seats.filter(s => s.bloc === key).length;
  const blocs = [];
  if (government) blocs.push({ key: 'gov', kind: 'government', label: government.label, href: government.href, targetId: government.targetId, method: government.method, count: count('gov') });
  opposition.forEach((c, i) => blocs.push({ key: `opp${i}`, kind: 'opposition', label: c.label, href: c.href, targetId: c.targetId, method: c.method, count: count(`opp${i}`) }));
  blocs.push({ key: 'none', kind: 'abstention', label: '', href: null, count: count('none') });

  const houseCounts = {};
  for (const s of seats) if (s.house) houseCounts[s.house] = (houseCounts[s.house] || 0) + 1;

  return {
    population: n,
    method: m,
    powerType,
    powerId: powerId || null,
    leaderId: leader || null,
    seats,
    blocs: blocs.filter(b => b.count > 0 || b.kind === 'government'),
    houses: houseCounts,
    thresholds: { quorum: hemicycleQuorum(n), pass: passThreshold(m, n) },
    seatUnit: n > HEMICYCLE_MAX_SEATS ? Math.ceil(n / HEMICYCLE_MAX_SEATS) : 1
  };
};

const seatPositions = (n, { width = 720, height = 380 } = {}) => {
  if (n <= 0) return [];
  const cx = width / 2;
  const cy = height - 20;
  const outer = Math.min(width / 2 - 16, height - 60);
  let rows = 1;
  const rowGap = () => outer / (rows + 1.5);
  const capacity = (r) => {
    let total = 0;
    for (let i = 0; i < r; i++) { const radius = outer - i * rowGap(); total += Math.max(1, Math.floor((Math.PI * radius) / (rowGap() * 0.95))); }
    return total;
  };
  while (capacity(rows) < n && rows < 30) rows += 1;
  const gap = rowGap();
  const radii = [];
  for (let i = 0; i < rows; i++) radii.push(outer - i * gap);
  const per = radii.map(r => Math.max(1, Math.floor((Math.PI * r) / (gap * 0.95))));
  const totalCap = per.reduce((a, b) => a + b, 0);
  const alloc = per.map(c => Math.floor((c / totalCap) * n));
  let left = n - alloc.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % rows) { if (alloc[i] < per[i]) { alloc[i] += 1; left -= 1; } }
  const pts = [];
  radii.forEach((r, row) => {
    const k = alloc[row];
    for (let j = 0; j < k; j++) {
      const angle = k === 1 ? Math.PI / 2 : Math.PI - (Math.PI * (j + 0.5)) / k;
      pts.push({ angle, x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle), row });
    }
  });
  pts.sort((a, b) => b.angle - a.angle || a.row - b.row);
  const radius = Math.max(3, Math.min(11, gap * 0.4));
  return pts.map(p => ({ x: Number(p.x.toFixed(1)), y: Number(p.y.toFixed(1)), angle: p.angle, r: Number(radius.toFixed(1)) }));
};


module.exports = ({ cooler, services = {} }) => {
  let ssb;
  let userId;

  const CACHE_MS = 250;
  let logCache = { at: 0, arr: null };
  let voteCache = { at: 0, results: null, tomb: null };

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
    voteCache = { at: 0, results: null, tomb: null };
    return res;
  }

  async function readLog() {
    const now = Date.now();
    if (logCache.arr && now - logCache.at < CACHE_MS) return logCache.arr;
    const ssbClient = await openSsb();
    const arr = await readTyped(ssbClient, PARLIAMENT_TYPES, { limit: logLimit });
    logCache = { at: now, arr };
    return arr;
  }

  function chainIndex(msgs, type) {
    const tomb = buildValidatedTombstoneSet(msgs);
    const nodes = new Map();
    for (const m of msgs || []) {
      const v = m.value || {};
      const c = v.content;
      if (!c || c.type !== type) continue;
      nodes.set(m.key, { key: m.key, author: v.author, ts: normMs(v.timestamp || m.timestamp || Date.now()), c });
    }
    const consistent = (n) => {
      if (PROPOSER_TYPES.has(type)) return n.c.proposer === n.author;
      if (type === 'parliamentTerm') return !n.c.createdBy || n.c.createdBy === n.author;
      return true;
    };
    const valid = new Map();
    const settle = (key) => {
      const path = [];
      const seen = new Set();
      let cur = key;
      while (!valid.has(cur)) {
        const n = nodes.get(cur);
        if (!n || !consistent(n)) { valid.set(cur, false); break; }
        const parent = n.c.replaces ? nodes.get(n.c.replaces) : null;
        if (!parent) { valid.set(cur, true); break; }
        if (parent.author !== n.author || seen.has(cur)) { valid.set(cur, false); break; }
        seen.add(cur);
        path.push(cur);
        cur = parent.key;
      }
      for (let i = path.length - 1; i >= 0; i--) {
        if (!valid.has(path[i])) valid.set(path[i], valid.get(nodes.get(path[i]).c.replaces) === true);
      }
      return valid.get(key) === true;
    };
    const next = new Map();
    for (const n of nodes.values()) {
      if (!n.c.replaces || !nodes.has(n.c.replaces) || !settle(n.key)) continue;
      const prev = next.get(n.c.replaces);
      if (!prev || n.ts > nodes.get(prev).ts) next.set(n.c.replaces, n.key);
    }
    const tipOf = (k) => { let x = k, g = 0; while (next.has(x) && g++ < 100000) x = next.get(x); return x; };
    const rootOf = (k) => { let x = k, g = 0; while (nodes.has(x) && nodes.has(nodes.get(x).c.replaces) && g++ < 100000) x = nodes.get(x).c.replaces; return x; };
    const items = [];
    for (const n of nodes.values()) {
      if ((n.c.replaces && nodes.has(n.c.replaces)) || !settle(n.key)) continue;
      const tip = tipOf(n.key);
      if (tomb.has(tip)) continue;
      items.push({ ...nodes.get(tip).c, id: tip });
    }
    const resolve = (k) => (nodes.has(k) && settle(k) ? tipOf(rootOf(k)) : null);
    const authorOf = (k) => (nodes.has(k) ? nodes.get(k).author : null);
    return { items, resolve, authorOf };
  }

  function listByTypeFromMsgs(msgs, type) {
    const items = chainIndex(msgs, type).items;
    return type === 'parliamentProposal' ? items.map(withCampaignRef) : items;
  }

  function withCampaignRef(p) {
    if (!p || p.campaignId) return p;
    const m = String(p.description || '').match(/\n*\s*(\d+) signatures: \/campaigns\/(%[^\s]+\.sha256)\s*$/);
    if (!m) return p;
    return { ...p, campaignId: m[2], signatures: Number(m[1]) || 0, description: String(p.description || '').slice(0, m.index).trim() };
  }

  async function listByType(type) {
    const msgs = await readLog();
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
    let t = tribes.find(tr =>
      tr.id === s ||
      (tr.title && tr.title.toLowerCase() === s.toLowerCase()) ||
      (tr.name && tr.name.toLowerCase() === s.toLowerCase())
    );
    if (!t && s.startsWith('%') && services.tribes && services.tribes.getTribeById) {
      try { t = await services.tribes.getTribeById(s); } catch (_) { t = null; }
    }
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
  let _inhCache = { at: 0, n: 0 };
  async function inhabitantsCount() {
    const now = Date.now();
    if (_inhCache.at && now - _inhCache.at < 30000) return _inhCache.n;
    let n = 0;
    try {
      if (services.inhabitants?.listInhabitants) {
        n = typeof services.inhabitants.countInhabitants === 'function'
          ? Number(await services.inhabitants.countInhabitants()) || 0
          : ((await services.inhabitants.listInhabitants({ filter: 'all', includeInactive: true })) || []).length;
      }
    } catch {}
    _inhCache = { at: now, n };
    return n;
  }
  async function proposalQuorum() {
    const n = await inhabitantsCount();
    return Math.max(PROPOSAL_QUORUM, Math.ceil(n * QUORUM_RATIO));
  }
  async function passesThreshold(method, total, yes) {
    const m = String(method || '').toUpperCase();
    const quorum = await proposalQuorum();
    if (Number(total || 0) < quorum) return false;
    if (m === 'DEMOCRACY' || m === 'ANARCHY') return yes >= democracyThreshold(total);
    if (m === 'MAJORITY') return yes >= majorityThreshold(total);
    if (m === 'MINORITY') return yes >= minorityThreshold(total);
    return false;
  }

  async function listCandidaturesOpenRaw() {
    const all = await listByType('parliamentCandidature');
    const window = termWindowFor(Date.now());
    const from = new Date(window.startAt).getTime();
    const filtered = all.filter(c => {
      if ((c.status || 'OPEN') !== 'OPEN') return false;
      const created = new Date(c.createdAt).getTime();
      return Number.isFinite(created) ? created >= from : true;
    });
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

  async function getCandidatureVotesMap() {
    const msgs = await readLog();
    const byTarget = new Map();
    for (const m of msgs || []) {
      const c = m.value && m.value.content;
      if (!c || c.type !== 'parliamentCandidatureVote' || !c.target) continue;
      if (!byTarget.has(c.target)) byTarget.set(c.target, new Set());
      byTarget.get(c.target).add(m.value.author);
    }
    return byTarget;
  }

  async function listCandidaturesOpen() {
    const rows = await listCandidaturesOpenRaw();
    const votesMap = await getCandidatureVotesMap();
    const enriched = await Promise.all(rows.map(async c => {
      const signedVoters = [...(votesMap.get(c.id) || [])];
      const cleanVoters = signedVoters.filter(v => !(c.targetType === 'inhabitant' && String(v) === String(c.targetId)));
      const base = { ...c, voters: cleanVoters, votes: cleanVoters.length };
      if (c.targetType === 'inhabitant') {
        const karma = await getInhabitantKarma(c.targetId);
        const since = await getFirstUserTimestamp(c.targetId);
        return { ...base, karma, profileSince: since };
      } else {
        const since = await getTribeSince(c.targetId);
        return { ...base, karma: 0, profileSince: since };
      }
    }));
    return enriched;
  }

  function supportFor(msgs) {
    const cands = chainIndex(msgs, 'parliamentCandidature');
    const byId = new Map(cands.items.map(c => [c.id, c]));
    const votes = [];
    for (const m of msgs || []) {
      const v = m.value || {};
      const c = v.content;
      if (!c || c.type !== 'parliamentCandidatureVote' || typeof c.target !== 'string' || !v.author) continue;
      const id = cands.resolve(c.target);
      const cand = id ? byId.get(id) : null;
      if (!cand) continue;
      if (cand.targetType === 'inhabitant' && String(cand.targetId) === String(v.author)) continue;
      votes.push({ cand, voter: v.author, ts: normMs(v.timestamp || m.timestamp || 0), seq: Number(v.sequence) || 0 });
    }
    votes.sort((a, b) => (a.ts - b.ts) || (a.seq - b.seq));
    return (term) => {
      const from = new Date(term.startAt).getTime();
      const to = new Date(term.endAt).getTime();
      const counted = new Map();
      for (const x of votes) {
        if (counted.has(x.voter)) continue;
        const created = new Date(x.cand.createdAt).getTime();
        if (!Number.isFinite(created) || created < from || created >= to) continue;
        counted.set(x.voter, x.cand);
      }
      const perCand = new Map();
      for (const cand of counted.values()) perCand.set(cand, (perCand.get(cand) || 0) + 1);
      let best = 0;
      for (const [cand, n] of perCand) {
        if (cand.targetType !== term.powerType || String(cand.targetId) !== String(term.powerId)) continue;
        if (String(cand.method || '').toUpperCase() !== String(term.method || '').toUpperCase()) continue;
        if (n > best) best = n;
      }
      return { votes: best, total: counted.size };
    };
  }

  function termShapeOk(t) {
    const s = new Date(t && t.startAt).getTime();
    const e = new Date(t && t.endAt).getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s || s > Date.now()) return false;
    const window = termWindowFor(s);
    if (new Date(window.startAt).getTime() === s && new Date(window.endAt).getTime() === e) return true;
    return e <= Date.now() && Math.abs(e - s - TERM_SPAN_MS) <= 86400000;
  }

  function validTermsFrom(msgs) {
    const supportOf = supportFor(msgs);
    const out = [];
    for (const t of chainIndex(msgs, 'parliamentTerm').items) {
      const method = String(t.method || '').toUpperCase();
      if (!METHODS.includes(method) || !termShapeOk(t)) continue;
      const inhabitant = t.powerType === 'inhabitant' && FEED_ID_RE.test(String(t.powerId || ''));
      const tribe = t.powerType === 'tribe' && !!t.powerId;
      if (!inhabitant && !tribe) continue;
      const support = supportOf({ ...t, method });
      if (support.votes < PROPOSAL_QUORUM) continue;
      out.push({ ...t, method, winnerVotes: support.votes, totalVotes: support.total });
    }
    return collapseOverlappingTerms(out, (t) => t.winnerVotes);
  }

  async function listValidTerms() {
    return validTermsFrom(await readLog());
  }

  async function readVoteResults() {
    const now = Date.now();
    if (voteCache.results && now - voteCache.at < CACHE_MS) return voteCache;
    const ssbClient = await openSsb();
    const arr = await readTyped(ssbClient, VOTE_LOG_TYPES, { limit: logLimit });
    voteCache = { at: now, results: buildVoteResults(arr), tomb: buildValidatedTombstoneSet(arr) };
    return voteCache;
  }

  async function voteResult(voteId, creator) {
    if (!voteId) return null;
    const { results, tomb } = await readVoteResults();
    const r = results.get(voteId);
    if (!r || tomb.has(r.rootId) || tomb.has(voteId)) return null;
    if (creator && r.creator !== creator) return null;
    const vm = r.votes || {};
    const due = r.deadline ? new Date(r.deadline).getTime() : NaN;
    return {
      YES: Number(vm.YES ?? vm.Yes ?? vm.yes ?? 0),
      NO: Number(vm.NO ?? vm.No ?? vm.no ?? 0),
      ABSTENTION: Number(vm.ABSTENTION ?? vm.Abstention ?? vm.abstention ?? 0),
      total: Number(r.totalVotes || 0),
      deadline: r.deadline || null,
      closed: Number.isFinite(due) && due <= Date.now()
    };
  }

  function termForId(termId, terms) {
    const id = String(termId || '');
    const found = terms.find(t => t.id === id || t.startAt === id);
    if (found) return found;
    const m = id.match(/^anarchy:(-?\d+)$/);
    return m ? virtualAnarchyTerm(termWindowFor(TERM_EPOCH + Number(m[1]) * TERM_SPAN_MS)) : null;
  }

  async function outcomeContext() {
    const msgs = await readLog();
    const terms = validTermsFrom(msgs);
    const proposals = chainIndex(msgs, 'parliamentProposal');
    const revocations = chainIndex(msgs, 'parliamentRevocation');
    const voteOwner = new Map();
    const byAge = [...proposals.items, ...revocations.items].sort((a, b) =>
      ((new Date(a.createdAt).getTime() || 0) - (new Date(b.createdAt).getTime() || 0)) || String(a.id).localeCompare(String(b.id))
    );
    for (const x of byAge) if (x.voteId && !voteOwner.has(x.voteId)) voteOwner.set(x.voteId, x.id);
    return { msgs, terms, proposals, revocations, voteOwner, members: new Map(), karma: new Map() };
  }

  async function mayPropose(term, feedId, ctx) {
    if (!term || !feedId) return false;
    if (term.virtual) return true;
    if (term.powerType === 'inhabitant') return String(term.powerId) === String(feedId);
    if (term.powerType === 'tribe') {
      if (!ctx.members.has(term.powerId)) {
        let members = [];
        if (services.tribes) {
          try { const tribe = await services.tribes.getTribeById(term.powerId); members = ensureArray(tribe && tribe.members); } catch {}
        }
        ctx.members.set(term.powerId, members);
      }
      return ctx.members.get(term.powerId).includes(feedId);
    }
    return false;
  }

  async function karmaOf(feedId, ctx) {
    if (!ctx.karma.has(feedId)) ctx.karma.set(feedId, await getInhabitantKarma(feedId));
    return ctx.karma.get(feedId);
  }

  async function wonKarmatocracy(p, term, ctx) {
    const spanOf = (x) => [new Date(x.createdAt).getTime() || 0, new Date(x.deadline).getTime()];
    const [ps, pe] = spanOf(p);
    const rivals = [];
    for (const q of ctx.proposals.items) {
      if (q.termId !== p.termId || String(q.method || '').toUpperCase() !== 'KARMATOCRACY') continue;
      const [qs, qe] = spanOf(q);
      if (!Number.isFinite(qe) || qe > Date.now() || qs > pe || ps > qe) continue;
      if (!(await mayPropose(term, q.proposer, ctx))) continue;
      rivals.push({ id: q.id, proposer: q.proposer, karma: await karmaOf(q.proposer, ctx), createdAtMs: qs });
    }
    rivals.sort((a, b) => (b.karma - a.karma) || (a.createdAtMs - b.createdAtMs) || String(a.proposer).localeCompare(String(b.proposer)) || String(a.id).localeCompare(String(b.id)));
    return rivals.length > 0 && rivals[0].id === p.id;
  }

  async function deriveOutcome(p, ctx, kind = 'proposal') {
    if (!p || !p.proposer) return null;
    const term = termForId(p.termId, ctx.terms);
    if (!term) return null;
    const method = String(p.method || '').toUpperCase();
    if (method !== String(term.method || '').toUpperCase()) return null;
    if (!(await mayPropose(term, p.proposer, ctx))) return null;
    const status = String(p.status || 'OPEN').toUpperCase();
    if (status === 'REJECTED' || status === 'DISCARDED') return status;
    if (VOTE_METHODS.has(method)) {
      if (!p.voteId || ctx.voteOwner.get(p.voteId) !== p.id) return null;
      const v = await voteResult(p.voteId, p.proposer);
      if (!v) return null;
      if (!v.closed) return 'OPEN';
      return (await passesThreshold(method, v.total, v.YES)) ? 'APPROVED' : 'REJECTED';
    }
    const due = new Date(p.deadline).getTime();
    const expired = Number.isFinite(due) && due <= Date.now();
    if (method === 'DICTATORSHIP') return (expired || status === 'APPROVED' || status === 'ENACTED') ? 'APPROVED' : 'OPEN';
    if (method === 'KARMATOCRACY') {
      if (!expired) return 'OPEN';
      if (kind === 'revocation') return 'APPROVED';
      return (await wonKarmatocracy(p, term, ctx)) ? 'APPROVED' : 'REJECTED';
    }
    return null;
  }

  async function listTermsBase(filter = 'all') {
    const collapsed = await listValidTerms();
    const latestStart = collapsed.reduce((mx, t) => Math.max(mx, new Date(t.startAt).getTime() || 0), 0);
    let arr = collapsed.map(t => {
      const superseded = (new Date(t.startAt).getTime() || 0) < latestStart;
      return { ...t, status: (isExpiredTerm(t) || superseded) ? 'EXPIRED' : 'ACTIVE' };
    });
    if (filter === 'active') arr = arr.filter(t => t.status === 'ACTIVE');
    if (filter === 'expired') arr = arr.filter(t => t.status === 'EXPIRED');
    return arr.sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
  }

  async function getLatestTermAny() {
    const collapsed = await listValidTerms();
    return collapsed[0] || null;
  }

  async function getCurrentTermBase() {
    const t = await getLatestTermAny();
    if (!t) return null;
    return isExpiredTerm(t) ? null : t;
  }

  function virtualAnarchyTerm(window = termWindowFor(Date.now())) {
    return {
      id: `anarchy:${window.cycle}`,
      virtual: true,
      type: 'parliamentTerm',
      cycle: window.cycle,
      method: 'ANARCHY',
      powerType: 'none',
      powerId: null,
      powerTitle: 'ANARCHY',
      winnerTribeId: null,
      winnerInhabitantId: null,
      winnerVotes: 0,
      totalVotes: 0,
      population: 0,
      startAt: window.startAt,
      endAt: window.endAt,
      createdBy: null,
      createdAt: window.startAt
    };
  }

  function currentCycleStart(term) {
    return term ? term.startAt : moment().subtract(TERM_DAYS, 'days').toISOString();
  }

  async function archiveAllCandidatures() {
    const all = await listCandidaturesOpenRaw();
    for (const c of all) {
      if (String(c.proposer || '') !== String(userId)) continue;
      const updated = { ...stripId(c), replaces: c.id, status: 'DISCARDED', updatedAt: nowISO() };
      await publishMsg(updated);
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
    let termStart = null;
    let termStartMs = null;
    let termEndMs = Infinity;
    if (termOrId && typeof termOrId === 'object') {
      termId = termOrId.id || termOrId.startAt;
      termStart = termOrId.startAt || null;
      termStartMs = termStart ? new Date(termStart).getTime() : null;
      termEndMs = termOrId.endAt ? new Date(termOrId.endAt).getTime() : (termStartMs != null ? termStartMs + TERM_DAYS * 86400000 : Infinity);
    } else {
      termId = termOrId;
    }
    const matchesTerm = (x) => {
      if (termStartMs != null && x.createdAt) {
        const t = new Date(x.createdAt).getTime();
        if (Number.isFinite(t) && t >= termStartMs && t < termEndMs) return true;
      }
      return x.termId === termId || (termStart && x.termId === termStart);
    };
    const ctx = await outcomeContext();
    const mine = termId ? ctx.proposals.items.filter(matchesTerm) : [];
    let proposed = 0;
    let approved = 0;
    let declined = 0;
    let discarded = 0;
    for (const p of mine) {
      const outcome = await deriveOutcome(p, ctx);
      if (!outcome) continue;
      proposed++;
      if (outcome === 'APPROVED') approved++;
      else if (outcome === 'REJECTED') declined++;
      else if (outcome === 'DISCARDED') discarded++;
    }
    let revocated = 0;
    if (termId) {
      for (const r of ctx.revocations.items) {
        if (!matchesTerm(r)) continue;
        const rTerm = termForId(r.termId, ctx.terms);
        if (rTerm && !rTerm.virtual && isExpiredTerm(rTerm) && (await deriveOutcome(r, ctx, 'revocation')) === 'APPROVED') revocated++;
      }
    }
    return { proposed, approved, declined, discarded, revocated };
  }

  async function computeGovernmentCard(term) {
    if (!term) return null;
    const method = term.method || 'DEMOCRACY';
    const isTribe = term.powerType === 'tribe';
    let members = 1;
    if (isTribe && term.powerId) {
      let tribe = null;
      if (services.tribes) {
        try { tribe = await services.tribes.getTribeById(term.powerId); } catch {}
      }
      members = tribe && Array.isArray(tribe.members) ? tribe.members.length : 0;
    }
    const pol = await summarizePoliciesForTerm({ ...term });
    const eff = pol.proposed > 0 ? Math.round((pol.approved / pol.proposed) * 100) : 0;
    const cands = await listByType('parliamentCandidature');
    const cycleStartMs = term.startAt ? new Date(term.startAt).getTime() : 0;
    const cycleEndMs = term.endAt ? new Date(term.endAt).getTime() : Number.MAX_SAFE_INTEGER;
    const presented = cands.filter(c => {
      const t = c.createdAt ? new Date(c.createdAt).getTime() : 0;
      return t >= cycleStartMs && t <= cycleEndMs;
    }).length;
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
      presented,
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

  async function createRevocation({ lawId, title, reasons }) {
    const term = await getCurrentTermBase();
    if (!term) throw new Error('No active government');
    const allowed = await canPropose();
    if (!allowed) throw new Error('You are not in the goverment, yet.');
    const lawIdStr = String(lawId || '').trim();
    if (!lawIdStr) throw new Error('Law required');
    const laws = await listLaws();
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

  async function settleOwn(kind, id, manual) {
    const ctx = await outcomeContext();
    const index = kind === 'revocation' ? ctx.revocations : ctx.proposals;
    const tipId = index.resolve(String(id || ''));
    const p = tipId ? index.items.find(x => x.id === tipId) : null;
    if (!p) throw new Error(kind === 'revocation' ? 'Revocation not found' : 'Proposal not found');
    const currentStatus = String(p.status || 'OPEN').toUpperCase();
    if (currentStatus === 'ENACTED' || currentStatus === 'REJECTED' || currentStatus === 'DISCARDED') return p;
    if (String(p.proposer) !== String(userId)) return p;
    let outcome = await deriveOutcome(p, ctx, kind);
    if (manual && outcome === 'OPEN' && String(p.method || '').toUpperCase() === 'DICTATORSHIP') outcome = 'APPROVED';
    if (outcome !== 'APPROVED' && outcome !== 'REJECTED') return p;
    if (currentStatus === outcome) return p;
    const updated = { ...stripId(p), replaces: p.id, status: outcome, updatedAt: nowISO() };
    await publishMsg(updated);
    return updated;
  }

  async function closeRevocation(revId) {
    return await settleOwn('revocation', revId, true);
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
    const votesMap = await getCandidatureVotesMap();
    const open = await listCandidaturesOpenRaw();
    const already = open.some(c => (votesMap.get(c.id) || new Set()).has(userId));
    if (already) throw new Error('Already voted this cycle');
    const msg = await new Promise((resolve, reject) =>
      ssbClient.get(candidatureMsgId, (e, m) => (e || !m) ? reject(new Error('Candidate not found')) : resolve(m))
    );
    if (msg.content?.type !== 'parliamentCandidature') throw new Error('Candidate not found');
    const c = msg.content;
    if ((c.status || 'OPEN') !== 'OPEN') throw new Error('Closed');
    if (c.targetType === 'inhabitant' && String(c.targetId) === String(userId)) throw new Error('You cannot vote for yourself');
    if ((votesMap.get(candidatureMsgId) || new Set()).has(userId)) throw new Error('Already voted this cycle');
    const content = { type: 'parliamentCandidatureVote', target: candidatureMsgId, createdAt: nowISO() };
    return await publishMsg(content);
  }

  async function createProposal({ title, description, campaignId = '', signatures = 0, goal = 0 }) {
    const campaignRef = String(campaignId || '').trim();
    if (campaignRef) {
      const existing = await listByType('parliamentProposal');
      if (existing.some(p => String(p.campaignId || '') === campaignRef)) throw new Error('This campaign was already raised to Parliament');
    }
    const extra = campaignRef ? { campaignId: campaignRef, signatures: Math.max(0, Math.floor(Number(signatures) || 0)), goal: Math.max(0, Math.floor(Number(goal) || 0)) } : {};
    let term = await getCurrentTermBase();
    if (!term) term = await resolveElection();
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
      const proposal = { type: 'parliamentProposal', title, description: description || '', method, termId: term.id || term.startAt, proposer: userId, status: 'OPEN', deadline, createdAt: nowISO(), ...extra };
      return await publishMsg(proposal);
    }
    const voteMsg = await services.votes.createVote(title, deadline, ['YES', 'NO', 'ABSTENTION'], [`gov:${term.id || term.startAt}`, `govMethod:${method}`, 'proposal']);
    const proposal = { type: 'parliamentProposal', title, description: description || '', method, voteId: voteMsg.key || voteMsg.id, termId: term.id || term.startAt, proposer: userId, status: 'OPEN', createdAt: nowISO(), ...extra };
    return await publishMsg(proposal);
  }

  async function closeProposal(proposalId) {
    return await settleOwn('proposal', proposalId, true);
  }

  async function sweepProposals() {
    if (sweepInFlight) return sweepInFlight;
    sweepInFlight = (async () => {
      const term = await getCurrentTermBase();
      if (!term) return;
      const termId = term.id || term.startAt;
      const ctx = await outcomeContext();
      for (const p of ctx.proposals.items) {
        if (p.termId !== termId || String(p.proposer) !== String(userId)) continue;
        try { await settleOwn('proposal', p.id, false); } catch {}
      }
      for (const r of ctx.revocations.items) {
        if (r.termId !== termId || String(r.proposer) !== String(userId)) continue;
        try { await settleOwn('revocation', r.id, false); } catch {}
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

  async function getHemicycle(termInput = null) {
    const term = termInput || await getCurrentTerm().catch(() => null);
    const window = term && term.startAt ? { startAt: term.startAt, endAt: term.endAt } : termWindowFor(Date.now());
    const from = new Date(window.startAt).getTime();
    const to = window.endAt ? new Date(window.endAt).getTime() : Number.MAX_SAFE_INTEGER;
    const msgs = await readLog();
    const rootOf = new Map();
    const cands = new Map();
    for (const m of msgs || []) {
      const c = m.value && m.value.content;
      if (!c || c.type !== 'parliamentCandidature') continue;
      const root = c.replaces ? (rootOf.get(c.replaces) || c.replaces) : m.key;
      rootOf.set(m.key, root);
      if (!cands.has(root)) {
        cands.set(root, { id: root, targetType: c.targetType, targetId: c.targetId, targetTitle: c.targetTitle, method: c.method, createdAt: c.createdAt || new Date(normMs(m.value.timestamp || m.timestamp)).toISOString(), voters: new Set() });
      }
    }
    for (const m of msgs || []) {
      const c = m.value && m.value.content;
      if (!c || c.type !== 'parliamentCandidatureVote' || !c.target) continue;
      const root = rootOf.get(c.target) || c.target;
      const cand = cands.get(root);
      if (cand) cand.voters.add(m.value.author);
    }
    const inWindow = [...cands.values()].filter(c => { const t = new Date(c.createdAt).getTime(); return Number.isFinite(t) ? (t >= from && t <= to) : false; });
    let census = [];
    try {
      if (services.inhabitants?.listInhabitants) census = await services.inhabitants.listInhabitants({ filter: 'all', includeInactive: true });
    } catch {}
    let powerMembers = [];
    if (term && term.powerType === 'tribe' && term.powerId && services.tribes?.getTribeById) {
      try { const t = await services.tribes.getTribeById(term.powerId); powerMembers = Array.isArray(t && t.members) ? t.members : []; } catch {}
    }
    const candidatures = inWindow.map(c => ({
      id: c.id,
      label: c.targetTitle || c.targetId,
      href: c.targetType === 'tribe' ? `/tribe/${encodeURIComponent(c.targetId)}` : `/author/${encodeURIComponent(c.targetId)}`,
      targetType: c.targetType,
      targetId: c.targetId,
      method: c.method,
      voters: [...c.voters]
    }));
    return buildHemicycle({
      census: (census || []).map(u => ({ id: u.id, name: u.name || '' })),
      candidatures,
      powerType: term ? term.powerType : 'none',
      powerId: term ? term.powerId : null,
      leaderId: term && term.powerType === 'inhabitant' ? term.powerId : null,
      method: term ? term.method : 'ANARCHY',
      powerMembers
    });
  }

  async function getCurrentTerm() {
    const published = await getCurrentTermBase();
    return published || virtualAnarchyTerm();
  }

  async function getPublishedTerm() {
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
      if (!map.has(k)) continue;
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

  async function listCurrentOf(kind) {
    const ctx = await outcomeContext();
    const index = kind === 'revocation' ? ctx.revocations : ctx.proposals;
    const items = kind === 'revocation' ? index.items : index.items.map(withCampaignRef);
    const rows = items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const needed = await proposalQuorum();
    const out = [];
    for (const p of rows) {
      if (String(p.status || 'OPEN').toUpperCase() === 'ENACTED') continue;
      const derivedStatus = await deriveOutcome(p, ctx, kind);
      if (!derivedStatus || derivedStatus === 'REJECTED' || derivedStatus === 'DISCARDED') continue;
      const v = p.voteId ? await voteResult(p.voteId, p.proposer) : null;
      const yes = v ? v.YES : 0;
      const total = v ? v.total : 0;
      const deadline = p.deadline || (v && v.deadline) || null;
      const onTrack = await passesThreshold(p.method, total, yes);
      out.push({ ...p, deadline, yes, total, needed, onTrack, derivedStatus });
    }
    return out;
  }

  async function listFutureOf(kind) {
    const term = await getCurrentTermBase();
    if (!term) return [];
    const termId = term.id || term.startAt;
    const ctx = await outcomeContext();
    const index = kind === 'revocation' ? ctx.revocations : ctx.proposals;
    const items = kind === 'revocation' ? index.items : index.items.map(withCampaignRef);
    const rows = items
      .filter(p => p.termId === termId && String(p.status || 'OPEN').toUpperCase() !== 'ENACTED')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const needed = await proposalQuorum();
    const out = [];
    for (const p of rows) {
      if ((await deriveOutcome(p, ctx, kind)) !== 'APPROVED') continue;
      const v = p.voteId ? await voteResult(p.voteId, p.proposer) : null;
      const deadline = p.deadline || (v && v.deadline) || null;
      out.push({ ...p, deadline, yes: v ? v.YES : 0, total: v ? v.total : 0, needed });
    }
    return out;
  }

  async function listProposalsCurrent() {
    return await listCurrentOf('proposal');
  }

  async function deriveProposalStatus(method, voteId) {
    const m = String(method || '').toUpperCase();
    if (!voteId || !VOTE_METHODS.has(m)) return null;
    try {
      const v = await voteResult(voteId);
      if (!v) return null;
      if (!v.closed) return 'OPEN';
      return (await passesThreshold(m, v.total, v.YES)) ? 'APPROVED' : 'REJECTED';
    } catch { return null; }
  }

  async function listFutureLawsCurrent() {
    return await listFutureOf('proposal');
  }

  async function listRevocationsCurrent() {
    return await listCurrentOf('revocation');
  }

  async function listFutureRevocationsCurrent() {
    return await listFutureOf('revocation');
  }

  async function countRevocationsEnacted() {
    const ctx = await outcomeContext();
    let n = 0;
    for (const r of ctx.revocations.items) {
      const term = termForId(r.termId, ctx.terms);
      if (term && !term.virtual && isExpiredTerm(term) && (await deriveOutcome(r, ctx, 'revocation')) === 'APPROVED') n++;
    }
    return n;
  }

  const votesOf = (v) => (v ? { YES: v.YES, NO: v.NO, ABSTENTION: v.ABSTENTION, total: v.total } : null);

  async function enactApprovedChanges(expiringTerm) {
    if (!expiringTerm) return;
    const termId = expiringTerm.id || expiringTerm.startAt;
    const ctx = await outcomeContext();

    for (const p of ctx.proposals.items.map(withCampaignRef)) {
      if (p.termId !== termId || String(p.proposer) !== String(userId)) continue;
      const status = String(p.status || 'OPEN').toUpperCase();
      if (status === 'ENACTED' || status === 'REJECTED' || status === 'DISCARDED') continue;
      const outcome = await deriveOutcome(p, ctx);
      if (outcome === 'REJECTED') {
        const rej = { ...stripId(p), replaces: p.id, status: 'REJECTED', updatedAt: nowISO() };
        await publishMsg(rej);
        continue;
      }
      if (outcome !== 'APPROVED') continue;
      const snap = p.voteId ? await voteResult(p.voteId, p.proposer) : null;

      const law = {
        type: 'parliamentLaw',
        question: p.title,
        description: p.description || '',
        method: p.method,
        proposer: p.proposer,
        termId: p.termId,
        voteId: p.voteId || null,
        votes: votesOf(snap) || { YES: 1, NO: 0, ABSTENTION: 0, total: 1 },
        proposedAt: p.createdAt,
        proposalId: p.id,
        enactedAt: nowISO()
      };

      await publishMsg(law);
      const updated = { ...stripId(p), replaces: p.id, status: 'ENACTED', updatedAt: nowISO() };
      await publishMsg(updated);
    }

    for (const r of ctx.revocations.items) {
      if (r.termId !== termId || String(r.proposer) !== String(userId)) continue;
      const status = String(r.status || 'OPEN').toUpperCase();
      if (status === 'ENACTED' || status === 'REJECTED' || status === 'DISCARDED') continue;
      if ((await deriveOutcome(r, ctx, 'revocation')) !== 'APPROVED') continue;
      const lawMsg = (ctx.msgs || []).find(m => m.key === r.lawId);
      const lawValue = lawMsg && lawMsg.value;
      if (lawValue && lawValue.author === userId && lawValue.content && lawValue.content.type === 'parliamentLaw') {
        const tomb = { type: 'tombstone', target: r.lawId, deletedAt: nowISO(), author: userId };
        await publishMsg(tomb);
      }

      const snap = r.voteId ? await voteResult(r.voteId, r.proposer) : null;
      const updated = {
        ...stripId(r),
        replaces: r.id,
        status: 'ENACTED',
        votes: votesOf(snap) || undefined,
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
      try { await enactApprovedChanges(latestAny); } catch (e) { console.error('enactApprovedChanges failed:', e); }
    }

    const open = (await listCandidaturesOpen()).filter(c =>
      METHODS.includes(String(c.method || '').toUpperCase()) &&
      ((c.targetType === 'inhabitant' && FEED_ID_RE.test(String(c.targetId || ''))) || (c.targetType === 'tribe' && !!c.targetId))
    );
    let chosen = null;
    let totalVotes = 0;
    let winnerVotes = 0;

    if (open.length) {
      const pick = await chooseWinnerFromCandidaturesAsync(open);
      chosen = pick && pick.chosen;
      totalVotes = (pick && pick.totalVotes) || 0;
      winnerVotes = (pick && pick.winnerVotes) || 0;
      const quorum = await proposalQuorum();
      if (winnerVotes < quorum) {
        chosen = null;
        totalVotes = 0;
        winnerVotes = 0;
      }
    }

    const window = termWindowFor(now.valueOf());
    const startAt = window.startAt;
    const endAt = window.endAt;
    const population = await inhabitantsCount();
    if (chosen && supportFor(await readLog())({ ...window, powerType: chosen.targetType, powerId: chosen.targetId, method: chosen.method }).votes < PROPOSAL_QUORUM) chosen = null;

    if (!chosen) {
      await archiveAllCandidatures();
      return virtualAnarchyTerm(window);
    }

    const term = {
      type: 'parliamentTerm',
      cycle: window.cycle,
      population,
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
    const term = (await getCurrentTermBase()) || virtualAnarchyTerm();
    if (!term) return null;
    return await computeGovernmentCard({ ...term, id: term.id || term.startAt });
  }

  async function getLatestTerm() {
    return await getLatestTermAny();
  }

  async function getLatestGovernmentCard() {
    const term = await getLatestTermAny();
    if (!term) return null;
    const card = await computeGovernmentCard({ ...term, id: term.id || term.startAt });
    const current = termWindowFor(Date.now());
    const termEnd = term.endAt ? new Date(term.endAt).getTime() : NaN;
    const rolled = Number.isFinite(termEnd) && termEnd <= Date.now();
    if (rolled) {
      return {
        ...card,
        id: term.id || term.startAt,
        cycle: current.cycle,
        since: current.startAt,
        end: current.endAt,
        method: 'ANARCHY',
        powerType: 'none',
        powerId: null,
        powerTitle: 'ANARCHY',
        winnerVotes: 0,
        totalVotes: 0,
        votesReceived: 0,
        presented: 0,
        proposed: 0,
        approved: 0,
        declined: 0,
        discarded: 0,
        revocated: 0,
        efficiency: 0,
        expired: false,
        rolled: true
      };
    }
    return { ...card, id: term.id || term.startAt, since: term.startAt, end: term.endAt, expired: false, rolled: false };
  }

  async function listLaws() {
    const ctx = await outcomeContext();
    const proposalsById = new Map(ctx.proposals.items.map(p => [p.id, p]));
    const laws = chainIndex(ctx.msgs, 'parliamentLaw');
    const chosen = new Map();
    const groupOfLaw = new Map();
    for (const l of laws.items) {
      const pid = ctx.proposals.resolve(String(l.proposalId || ''));
      const p = pid ? proposalsById.get(pid) : null;
      if (!p || String(p.proposer) !== String(l.proposer) || p.termId !== l.termId) continue;
      const voted = withCampaignRef(p);
      if (l.question !== voted.title || String(l.description || '') !== String(voted.description || '') || String(l.method || '') !== String(voted.method || '')) continue;
      const term = termForId(p.termId, ctx.terms);
      if (!term || term.virtual || !isExpiredTerm(term)) continue;
      if ((await deriveOutcome(p, ctx)) !== 'APPROVED') continue;
      groupOfLaw.set(l.id, pid);
      const own = laws.authorOf(l.id) === p.proposer;
      const prev = chosen.get(pid);
      const better = !prev
        || (own && !prev.own)
        || (own === prev.own && (new Date(l.enactedAt).getTime() || 0) < (new Date(prev.law.enactedAt).getTime() || 0));
      if (better) chosen.set(pid, { law: l, own });
    }
    for (const r of ctx.revocations.items) {
      const pid = groupOfLaw.get(String(r.lawId || ''));
      if (!pid || !chosen.has(pid)) continue;
      const term = termForId(r.termId, ctx.terms);
      if (!term || term.virtual || !isExpiredTerm(term)) continue;
      if ((await deriveOutcome(r, ctx, 'revocation')) === 'APPROVED') chosen.delete(pid);
    }
    const items = [...chosen.values()].map(x => x.law);
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
      let tribe = null;
      if (services.tribes) {
        try { tribe = await services.tribes.getTribeById(term.powerId); } catch {}
      }
      const members = ensureArray(tribe?.members);
      return members.includes(userId);
    }
    return false;
  }

  const tribeReadLog = async () => {
    const client = await openSsb();
    return readTyped(client, TRIBE_PARLIAMENT_TYPES, { limit: logLimit });
  };

  const tribeMembersOf = async (ids) => {
    const out = new Set();
    for (const id of ids) {
      try {
        const t = services.tribes && services.tribes.getTribeById ? await services.tribes.getTribeById(id) : null;
        if (t && t.author) out.add(t.author);
        for (const m of (t && Array.isArray(t.members) ? t.members : [])) out.add(m);
      } catch (_) {}
    }
    return out;
  };

  const tribeListByType = async (type, tribeId) => {
    let chainIds;
    try {
      chainIds = services.tribes && services.tribes.getChainIds
        ? await services.tribes.getChainIds(tribeId)
        : [tribeId];
    } catch (_) { chainIds = [tribeId]; }
    const ids = Array.isArray(chainIds) && chainIds.length ? chainIds : [tribeId];
    const tribeIdSet = new Set(ids);
    const members = await tribeMembersOf(ids);
    const msgs = await tribeReadLog();
    const tomb = buildValidatedTombstoneSet(msgs);
    const roots = new Map();
    const rewrites = [];
    for (const m of msgs) {
      const c = m.value?.content; if (!c) continue;
      if (c.type !== type) continue;
      if (!tribeIdSet.has(c.tribeId)) continue;
      const author = m.value?.author;
      if (!members.has(author)) continue;
      const item = { ...c, id: m.key, author, _ts: m.value?.timestamp || 0 };
      if (c.replaces) { rewrites.push(item); continue; }
      if (type === 'tribeParliamentCandidature' && c.proposer !== author) continue;
      if (type === 'tribeParliamentTerm') {
        if (c.createdBy && c.createdBy !== author) continue;
        const method = String(c.method || '').toUpperCase();
        if (!METHODS.includes(method) && method !== 'ANARCHY') continue;
        if (c.leaderId && !members.has(c.leaderId)) continue;
      }
      roots.set(m.key, item);
    }
    if (type === 'tribeParliamentCandidature') {
      const byId = new Map(rewrites.map(r => [r.id, r]));
      const rootOfRewrite = (id) => { let cur = id, g = 0; while (byId.has(cur) && g++ < 1000) cur = byId.get(cur).replaces; return cur; };
      const ballotsOf = new Map();
      for (const r of rewrites) {
        const root = roots.get(rootOfRewrite(r.id));
        if (!root || r.author === root.candidateId) continue;
        if (!ballotsOf.has(root.id)) ballotsOf.set(root.id, []);
        ballotsOf.get(root.id).push({ author: r.author, ts: r._ts });
      }
      return [...roots.values()].map(it => ({ ...it, _ballots: ballotsOf.get(it.id) || [], _closed: tomb.has(it.id) }));
    }
    const replacedBySameAuthor = new Map();
    for (const r of rewrites) { const orig = roots.get(r.replaces); if (orig && orig.author === r.author) replacedBySameAuthor.set(r.replaces, r); }
    const out = [];
    for (const it of roots.values()) {
      let cur = it, g = 0;
      while (replacedBySameAuthor.has(cur.id) && g++ < 1000) cur = replacedBySameAuthor.get(cur.id);
      if (!tomb.has(cur.id) && !tomb.has(it.id)) out.push(cur);
    }
    return out;
  };

  const tallyCandidatures = (cands, fromTs, toTs) => {
    const createdOf = (c) => Date.parse(c.createdAt) || c._ts || 0;
    const inCycle = cands.filter(c => createdOf(c) >= fromTs && createdOf(c) < toTs);
    const ballots = [];
    for (const c of inCycle) for (const b of (c._ballots || [])) if (b.ts >= fromTs && b.ts < toTs) ballots.push({ ...b, root: c.id });
    ballots.sort((a, b) => a.ts - b.ts);
    const seen = new Set();
    const votersOf = new Map();
    for (const b of ballots) {
      if (seen.has(b.author)) continue;
      seen.add(b.author);
      if (!votersOf.has(b.root)) votersOf.set(b.root, []);
      votersOf.get(b.root).push(b.author);
    }
    return inCycle.map(c => { const { _ballots, _closed, ...rest } = c; const voters = votersOf.get(c.id) || []; return { ...rest, voters, votes: voters.length, ...(_closed ? { _closed } : {}) }; });
  };

  const tribeValidTerms = async (tribeId) => {
    const terms = (await tribeListByType('tribeParliamentTerm', tribeId)).slice().sort((a, b) => (Date.parse(a.startAt) || 0) - (Date.parse(b.startAt) || 0));
    if (!terms.some(t => t.leaderId)) return terms;
    const cands = await tribeListByType('tribeParliamentCandidature', tribeId);
    const quorum = await tribeElectionQuorum(tribeId);
    const out = [];
    for (const t of terms) {
      const start = Date.parse(t.startAt) || 0;
      if (t.leaderId) {
        const prevStart = out.length ? (Date.parse(out[out.length - 1].startAt) || 0) : 0;
        const tally = tallyCandidatures(cands, prevStart, start);
        const backing = tally.filter(c => c.candidateId === t.leaderId).reduce((n, c) => Math.max(n, c.votes), 0);
        if (backing < quorum) continue;
      }
      out.push(t);
    }
    return out;
  };

  const tribeGetCurrentTerm = async (tribeId) => {
    const terms = await tribeValidTerms(tribeId);
    if (terms.length === 0) return null;
    const now = moment();
    const active = terms.find(t => moment(t.startAt).isSameOrBefore(now) && moment(t.endAt).isAfter(now));
    if (active) return active;
    terms.sort((a, b) => String(b.startAt).localeCompare(String(a.startAt)));
    return terms[0] || null;
  };

  const tribeElectionInFlight = new Map();

  async function tribePublishInitialTerm(tribeId) {
    if (!tribeId) throw new Error('Missing tribeId');
    await openSsb();
    const existing = await tribeListByType('tribeParliamentTerm', tribeId);
    if (existing.length > 0) return existing[0];
    const startAt = moment().toISOString();
    const endAt = moment(startAt).add(TERM_DAYS, 'days').toISOString();
    const term = {
      type: 'tribeParliamentTerm',
      tribeId,
      method: 'ANARCHY',
      leaderId: null,
      winnerVotes: 0,
      totalVotes: 0,
      startAt,
      endAt,
      createdBy: userId,
      createdAt: nowISO()
    };
    return await publishMsg(term);
  }

  async function tribeElectionQuorum(tribeId) {
    let n = 0;
    try {
      if (services.tribes && services.tribes.getTribeById) {
        const t = await services.tribes.getTribeById(tribeId);
        n = Array.isArray(t && t.members) ? t.members.length : 0;
      }
    } catch {}
    return Math.max(2, Math.ceil(n * 0.25));
  }

  async function tribeResolveElectionImpl(tribeId) {
    const latest = await tribeGetCurrentTerm(tribeId);
    if (latest && !isExpiredTerm(latest)) return latest;
    const opens = (await tribeListCandidatures(tribeId))
      .filter(c => (c.status || 'OPEN') === 'OPEN');
    let chosen = null, totalVotes = 0, winnerVotes = 0;
    if (opens.length) {
      opens.sort((a, b) => Number(b.votes || 0) - Number(a.votes || 0) || new Date(a.createdAt) - new Date(b.createdAt));
      chosen = opens[0];
      totalVotes = opens.reduce((s, c) => s + Number(c.votes || 0), 0);
      winnerVotes = Number(chosen.votes || 0);
      const quorum = await tribeElectionQuorum(tribeId);
      if (winnerVotes < quorum) chosen = null;
    }
    const startAt = moment().toISOString();
    const endAt = moment(startAt).add(TERM_DAYS, 'days').toISOString();
    const term = {
      type: 'tribeParliamentTerm',
      tribeId,
      method: chosen ? String(chosen.method || 'DEMOCRACY').toUpperCase() : 'ANARCHY',
      leaderId: chosen ? chosen.candidateId : null,
      winnerVotes,
      totalVotes,
      startAt,
      endAt,
      createdBy: userId,
      createdAt: nowISO()
    };
    const res = await publishMsg(term);
    for (const c of opens) {
      try { await publishMsg({ type: 'tombstone', target: c.id, deletedAt: nowISO(), author: userId }); } catch {}
    }
    return res;
  }

  async function tribeResolveElection(tribeId) {
    if (tribeElectionInFlight.has(tribeId)) return tribeElectionInFlight.get(tribeId);
    const p = tribeResolveElectionImpl(tribeId).catch(e => { console.error('tribeResolveElection failed:', e); return null; }).finally(() => tribeElectionInFlight.delete(tribeId));
    tribeElectionInFlight.set(tribeId, p);
    return p;
  }

  async function tribeEnsureTerm(tribeId) {
    const cur = await tribeGetCurrentTerm(tribeId);
    if (cur && !isExpiredTerm(cur)) return cur;
    if (!cur) return await tribePublishInitialTerm(tribeId);
    return await tribeResolveElection(tribeId);
  }

  const tribeListCandidatures = async (tribeId) => {
    const cands = await tribeListByType('tribeParliamentCandidature', tribeId);
    const term = await tribeGetCurrentTerm(tribeId);
    return tallyCandidatures(cands, term ? (Date.parse(term.startAt) || 0) : 0, Infinity).filter(c => !c._closed);
  };
  const tribeListRules = (tribeId) => tribeListByType('tribeParliamentRule', tribeId);

  const tribePublishCandidature = async ({ tribeId, candidateId, method }) => {
    const m = String(method || '').toUpperCase();
    if (!METHODS.includes(m)) throw new Error('Invalid method');
    if (!tribeId) throw new Error('Missing tribeId');
    if (!candidateId) throw new Error('Missing candidateId');
    const term = await tribeGetCurrentTerm(tribeId);
    const since = term ? term.startAt : moment().subtract(TERM_DAYS, 'days').toISOString();
    const existing = await tribeListCandidatures(tribeId);
    const dupe = existing.find(c => c.candidateId === candidateId && new Date(c.createdAt) >= new Date(since) && (c.status || 'OPEN') === 'OPEN');
    if (dupe) throw new Error('Candidate already proposed this cycle');
    const client = await openSsb();
    const content = {
      type: 'tribeParliamentCandidature',
      tribeId, candidateId, method: m,
      votes: 0, voters: [], proposer: client.id,
      status: 'OPEN', createdAt: nowISO()
    };
    return new Promise((resolve, reject) => client.publish(content, (e, r) => e ? reject(e) : resolve(r)));
  };

  const tribeVoteCandidature = async ({ tribeId, candidatureId }) => {
    const client = await openSsb();
    const all = await tribeListCandidatures(tribeId);
    const alreadyThisCycle = all.some(c => Array.isArray(c.voters) && c.voters.includes(client.id));
    if (alreadyThisCycle) throw new Error('Already voted this cycle');
    const cand = all.find(c => c.id === candidatureId);
    if (!cand) throw new Error('Candidate not found');
    if (String(cand.candidateId) === String(client.id)) throw new Error('You cannot vote for yourself');
    const cleanVoters = ensureArray(cand.voters).filter(v => String(v) !== String(cand.candidateId));
    const updated = {
      type: 'tribeParliamentCandidature',
      tribeId, replaces: candidatureId,
      candidateId: cand.candidateId, method: cand.method,
      votes: cleanVoters.length + 1,
      voters: [...cleanVoters, client.id],
      proposer: cand.proposer, status: cand.status || 'OPEN',
      createdAt: cand.createdAt, updatedAt: nowISO()
    };
    return new Promise((resolve, reject) => client.publish(updated, (e, r) => e ? reject(e) : resolve(r)));
  };

  const tribePublishRule = async ({ tribeId, title, body }) => {
    if (!title || !title.trim()) throw new Error('Title required');
    const client = await openSsb();
    const content = {
      type: 'tribeParliamentRule', tribeId,
      title: String(title).trim(), body: String(body || '').trim(),
      author: client.id, createdAt: nowISO()
    };
    return new Promise((resolve, reject) => client.publish(content, (e, r) => e ? reject(e) : resolve(r)));
  };

  const tribeDeleteRule = async (ruleId) => {
    const client = await openSsb();
    return new Promise((resolve, reject) => client.publish({ type: 'tombstone', target: ruleId, deletedAt: nowISO(), author: client.id }, (e, r) => e ? reject(e) : resolve(r)));
  };

  const tribeHasCandidatureInGlobalCycle = async (tribeId, globalTermStart) => {
    let chainIds;
    try {
      chainIds = services.tribes && services.tribes.getChainIds
        ? await services.tribes.getChainIds(tribeId)
        : [tribeId];
    } catch (_) { chainIds = [tribeId]; }
    const tribeIdSet = new Set(Array.isArray(chainIds) && chainIds.length ? chainIds : [tribeId]);
    const msgs = await tribeReadLog();
    const cutoff = globalTermStart ? new Date(globalTermStart) : new Date(Date.now() - TERM_DAYS * 86400000);
    return msgs.some(m => {
      const c = m.value?.content; if (!c) return false;
      return c.type === 'parliamentCandidature' && c.targetType === 'tribe' && tribeIdSet.has(c.targetId) && (c.status || 'OPEN') === 'OPEN' && new Date(c.createdAt) >= cutoff;
    });
  };

  return {
    proposeCandidature,
    voteCandidature,
    resolveElection,
    getGovernmentCard,
    listLaws,
    listHistorical,
    canPropose,
    listProposalsCurrent,
    deriveProposalStatus,
    listFutureLawsCurrent,
    createProposal,
    closeProposal,
    listCandidatures,
    listTerms,
    getCurrentTerm,
    getPublishedTerm,
    getLatestTerm,
    getLatestGovernmentCard,
    getHemicycle,
    listLeaders,
    sweepProposals,
    getActorMeta,
    createRevocation,
    listRevocationsCurrent,
    listFutureRevocationsCurrent,
    closeRevocation,
    countRevocationsEnacted,
    tribe: {
      METHODS,
      TERM_DAYS,
      getCurrentTerm: tribeGetCurrentTerm,
      listCandidatures: tribeListCandidatures,
      listRules: tribeListRules,
      publishTribeCandidature: tribePublishCandidature,
      voteTribeCandidature: tribeVoteCandidature,
      publishTribeRule: tribePublishRule,
      deleteTribeRule: tribeDeleteRule,
      hasCandidatureInGlobalCycle: tribeHasCandidatureInGlobalCycle,
      publishInitialTerm: tribePublishInitialTerm,
      resolveElection: tribeResolveElection,
      ensureTerm: tribeEnsureTerm
    }
  };
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function compareTermsForWindow(a, b, supportOf = () => 0) {
  const support = (t) => Number(supportOf(t)) || 0;
  const anarchy = (t) => (String(t && t.method || '').toUpperCase() === 'ANARCHY' ? 1 : 0);

  const supportA = support(a);
  const supportB = support(b);
  if (supportA !== supportB) return supportB - supportA;

  const anarchyA = anarchy(a);
  const anarchyB = anarchy(b);
  if (anarchyA !== anarchyB) return anarchyA - anarchyB;

  return String(a && a.id || '').localeCompare(String(b && b.id || ''));
}

function collapseOverlappingTerms(terms = [], supportOf) {
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
    g.items.sort((a, b) => compareTermsForWindow(a, b, supportOf));
    return g.items[0];
  });
  return winners.sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
}

module.exports.termWindowFor = termWindowFor;
module.exports.compareTermsForWindow = compareTermsForWindow;
module.exports.collapseOverlappingTerms = collapseOverlappingTerms;
module.exports.TERM_DAYS = TERM_DAYS;

module.exports.hemicycle = { build: buildHemicycle, seatPositions, passThreshold };
