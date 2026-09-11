const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { readTyped } = require('./typed_log');
const { isContentVisibleTo } = require('./content_visibility');

const logLimit = getConfig().ssbLogStream?.limit || 1000;

const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();

const KINDS = {
  inhabitants: { type: 'curriculum', href: (id, c) => `/author/${encodeURIComponent(c.author)}` },
  jobs: { type: 'job', href: (id) => `/jobs/${encodeURIComponent(id)}` },
  projects: { type: 'project', href: (id) => `/projects/${encodeURIComponent(id)}` },
  events: { type: 'event', href: (id) => `/events/${encodeURIComponent(id)}` },
  tribes: { type: 'tribe', href: (id) => `/tribe/${encodeURIComponent(id)}` },
  market: { type: 'market', href: (id) => `/market/${encodeURIComponent(id)}` },
  housing: { type: 'housing', href: (id) => `/housing/${encodeURIComponent(id)}` },
  industry: { type: 'industry', href: (id) => `/industry/${encodeURIComponent(id)}` },
  tasks: { type: 'task', href: (id) => `/tasks/${encodeURIComponent(id)}` },
  reports: { type: 'report', href: (id) => `/reports/${encodeURIComponent(id)}` },
  votes: { type: 'poll', href: (id) => `/polls/${encodeURIComponent(id)}` },
  audios: { type: 'audio', href: (id) => `/audios/${encodeURIComponent(id)}` },
  videos: { type: 'video', href: (id) => `/videos/${encodeURIComponent(id)}` },
  images: { type: 'image', href: (id) => `/images/${encodeURIComponent(id)}` },
  documents: { type: 'document', href: (id) => `/documents/${encodeURIComponent(id)}` },
  bookmarks: { type: 'bookmark', href: (id) => `/bookmarks/${encodeURIComponent(id)}` },
  torrents: { type: 'torrent', href: (id) => `/torrents/${encodeURIComponent(id)}` },
  chats: { type: 'chat', href: (id) => `/chats/${encodeURIComponent(id)}` },
  pads: { type: 'pad', href: (id) => `/pads/${encodeURIComponent(id)}` },
  maps: { type: 'map', href: (id) => `/maps/${encodeURIComponent(id)}` },
  calendars: { type: 'calendar', href: (id) => `/calendars/${encodeURIComponent(id)}` },
  forum: { type: 'forum', href: (id) => `/forum/${encodeURIComponent(id)}` },
  school: { type: 'schoolCourse', href: (id) => `/school/course/${encodeURIComponent(id)}` },
  wiki: { type: 'wikiPage', href: (id) => `/wiki/${encodeURIComponent(id)}` },
  emergencies: { type: 'emergency', href: (id) => `/emergencies/${encodeURIComponent(id)}` },
  mailing: { type: 'mailingList', href: (id) => `/mailing/${encodeURIComponent(id)}` },
  logistics: { type: 'logisticsRoute', href: (id) => `/logistics/${encodeURIComponent(id)}` },
  podcasts: { type: 'podcast', href: (id) => `/podcasts/${encodeURIComponent(id)}` },
  campaigns: { type: 'campaign', href: (id) => `/campaigns/${encodeURIComponent(id)}` }
};

const KIND_BY_TYPE = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [v.type, k]));

const cvSkills = (c) => [
  ...(c.personalSkills || []),
  ...(c.oasisSkills || []),
  ...(c.educationalSkills || []),
  ...(c.professionalSkills || [])
];

const PLACEHOLDERS = new Set(['unknown', 'n/a', 'na', 'none', '-', 'other']);

const TITLE_STOPWORDS = new Set([
  'the', 'this', 'that', 'and', 'for', 'with', 'from', 'into', 'about', 'new', 'all', 'not', 'are', 'was', 'you', 'your', 'our',
  'los', 'las', 'del', 'una', 'unos', 'unas', 'este', 'esta', 'esto', 'que', 'con', 'para', 'por', 'sin', 'sobre', 'bajo', 'mas', 'más'
]);

const titleTerms = (c) => String(c.title || c.name || c.question || c.concept || '')
  .toLowerCase()
  .split(/[^\p{L}\p{N}]+/u)
  .filter(w => w.length >= 3 && !TITLE_STOPWORDS.has(w) && !/^\d+$/.test(w));

const termsOf = (kind, c) => {
  const out = [];
  if (kind === 'inhabitants') {
    out.push(...cvSkills(c));
    if (c.languages) out.push(...String(c.languages).split(/[,;]/));
  } else if (kind === 'jobs') {
    out.push(...(c.tasks || []), ...(c.tags || []), c.job_type, c.location);
  } else if (kind === 'industry') {
    out.push(...(c.tags || []), c.sector, ...(c.skills || []));
  } else {
    out.push(...(c.tags || []));
    if (c.category) out.push(c.category);
  }
  return Array.from(new Set(out.map(norm).filter(t => t && !PLACEHOLDERS.has(t))));
};

const DESC_TERMS_MAX = 40;
const descTerms = (c) => String(c.description || c.text || c.body || '')
  .toLowerCase()
  .split(/[^\p{L}\p{N}]+/u)
  .filter(w => w.length >= 4 && !TITLE_STOPWORDS.has(w) && !/^\d+$/.test(w))
  .slice(0, DESC_TERMS_MAX);

const FAV_KIND = Object.fromEntries(Object.keys(KINDS).map(k => [k, k === 'votes' ? 'polls' : k]));

const ALIKE_MIN_AFFINITY = 0.3;
const RATED_MIN_OPINIONS = 3;
const REASON_ORDER = ['related', 'content', 'mutual', 'following', 'supportsYou', 'tribe', 'alike', 'cv', 'pinned', 'rated', 'near'];

const opinionsTotalOf = (c) => {
  const ops = c && typeof c.opinions === 'object' && c.opinions ? c.opinions : {};
  let total = 0;
  for (const v of Object.values(ops)) total += Number(v) || 0;
  return total;
};

const titleOf = (kind, c, author) => {
  if (kind === 'inhabitants') return c.name || author || '';
  return c.title || c.name || c.question || c.concept || '';
};

const jaccard = (a, b) => {
  if (!a.size || !b.size) return { score: 0, common: [] };
  const common = [...b].filter(x => a.has(x));
  const union = a.size + b.size - common.length;
  return { score: union > 0 ? common.length / union : 0, common };
};

module.exports = ({ cooler, favoriteIdsFor = null }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const DATA_TYPES = [...Object.values(KINDS).map(v => v.type), 'tombstone', 'contact', 'about'];

  const getAllMessages = async (ssbClient) => readTyped(ssbClient, DATA_TYPES, { limit: logLimit });

  const buildGraph = async () => {
    const ssbClient = await openSsb();
    const viewerId = ssbClient.id;
    const messages = await getAllMessages(ssbClient);
    const tomb = buildValidatedTombstoneSet(messages);

    const candidates = new Map();
    const parentOf = new Map();
    const follows = new Map();
    const followers = new Map();
    const aboutTerms = new Set();
    for (const m of messages) {
      const v = m && m.value;
      const c = v && v.content;
      if (!c || typeof c !== 'object' || !c.type) continue;
      if (c.type === 'contact') {
        if (typeof c.contact !== 'string' || typeof c.following !== 'boolean') continue;
        if (v.author === viewerId) follows.set(c.contact, c.following);
        else if (c.contact === viewerId) followers.set(v.author, c.following);
        continue;
      }
      if (c.type === 'about') {
        if (v.author === viewerId && c.about === viewerId && typeof c.description === 'string') for (const t of descTerms(c)) aboutTerms.add(norm(t));
        continue;
      }
      if (tomb.has(m.key)) continue;
      if (c.tribeId && c.type !== 'tribe') continue;
      const kind = KIND_BY_TYPE[c.type];
      if (!kind) continue;
      if (!isContentVisibleTo(c.type, c, viewerId, v.author)) continue;
      if (typeof c.replaces === 'string') parentOf.set(m.key, c.replaces);
      candidates.set(m.key, { key: m.key, author: v.author, ts: v.timestamp || m.timestamp || 0, kind, c });
    }

    const rootOf = (key) => {
      const seen = new Set();
      let cur = key;
      while (parentOf.has(cur) && !seen.has(cur)) { seen.add(cur); cur = parentOf.get(cur); }
      return cur;
    };
    const latestByRoot = new Map();
    for (const cand of candidates.values()) {
      const root = rootOf(cand.key);
      const prev = latestByRoot.get(root);
      if (!prev || cand.ts >= prev.ts) latestByRoot.set(root, { ...cand, key: root });
    }

    const nodes = [];
    const byAuthorCv = new Map();
    for (const node of latestByRoot.values()) {
      const coreTerms = termsOf(node.kind, node.c);
      const extra = node.kind === 'inhabitants' ? [] : [...titleTerms(node.c), ...descTerms(node.c)].map(norm).filter(t => t && !PLACEHOLDERS.has(t));
      const terms = Array.from(new Set([...coreTerms, ...extra]));
      if (!terms.length) continue;
      const entry = {
        id: node.key,
        kind: node.kind,
        author: node.c.author || node.author,
        title: titleOf(node.kind, node.c, node.c.author || node.author),
        terms,
        termSet: new Set(terms),
        coreTermSet: new Set(coreTerms),
        ts: node.ts,
        createdAt: node.c.createdAt || new Date(node.ts).toISOString(),
        href: KINDS[node.kind].href(node.key, node.c),
        members: node.kind === 'tribes' && Array.isArray(node.c.members) ? node.c.members : null,
        location: norm(node.c.location || ''),
        opinionsTotal: opinionsTotalOf(node.c)
      };
      if (node.kind === 'inhabitants') {
        const prev = byAuthorCv.get(entry.author);
        if (prev && prev.ts >= entry.ts) continue;
        byAuthorCv.set(entry.author, entry);
        continue;
      }
      nodes.push(entry);
    }
    for (const cv of byAuthorCv.values()) nodes.push(cv);

    const following = new Set([...follows.entries()].filter(([, on]) => on).map(([id]) => id));
    const supporters = new Set([...followers.entries()].filter(([, on]) => on).map(([id]) => id));
    return { viewerId, nodes, cvByAuthor: byAuthorCv, following, supporters, aboutTerms };
  };

  const favoriteIds = async () => {
    if (typeof favoriteIdsFor !== 'function') return new Set();
    const out = new Set();
    await Promise.all(Object.values(FAV_KIND).map(async (k) => {
      try { for (const id of await favoriteIdsFor(k)) out.add(String(id)); } catch (_) {}
    }));
    return out;
  };

  const diversify = (items) => {
    const leaders = new Map();
    for (const it of items) if (!leaders.has(it.kind)) leaders.set(it.kind, it);
    const lead = new Set(leaders.values());
    return [...leaders.values()].sort((x, y) => y.score - x.score || y.ts - x.ts)
      .concat(items.filter(it => !lead.has(it)));
  };

  const MAX_ENTITIES = 400;
  const MAX_PAIRS = 300;

  const strip = (n) => ({
    id: n.id, kind: n.kind, author: n.author, title: n.title,
    href: n.href, createdAt: n.createdAt, ts: n.ts
  });

  const buildProfile = async (graph) => {
    const { viewerId, nodes, cvByAuthor, aboutTerms } = graph;
    const use = nodes.slice(0, MAX_ENTITIES);
    const favs = await favoriteIds();

    const myTermSet = new Set();
    const cvTerms = new Set();
    const contentTerms = new Set();
    const mineCv = cvByAuthor.get(viewerId);
    if (mineCv) for (const t of mineCv.terms) { myTermSet.add(t); cvTerms.add(t); }
    for (const t of aboutTerms) if (t && !PLACEHOLDERS.has(t)) myTermSet.add(t);
    const tribeMates = new Set();
    const pinnedTerms = new Set();
    let myLocation = mineCv ? mineCv.location : '';
    for (const n of use) {
      if (String(n.author) === String(viewerId)) {
        for (const t of n.terms) { myTermSet.add(t); contentTerms.add(t); }
        if (!myLocation && n.location) myLocation = n.location;
      }
      if (favs.has(String(n.id))) for (const t of n.terms) { myTermSet.add(t); pinnedTerms.add(t); }
      if (n.members && (String(n.author) === String(viewerId) || n.members.includes(viewerId))) for (const m of n.members) tribeMates.add(m);
    }
    tribeMates.delete(viewerId);

    const df = new Map();
    for (const n of use) for (const t of n.termSet) df.set(t, (df.get(t) || 0) + 1);
    const total = use.length || 1;
    const weightOf = (t) => Math.log(1 + total / (df.get(t) || 1));
    return { use, myTermSet, cvTerms, contentTerms, pinnedTerms, tribeMates, myLocation, df, weightOf, total };
  };

  const affinitiesFor = (viewerId, { use, myTermSet, pinnedTerms, tribeMates, weightOf }) => {
    const termsByAuthor = new Map();
    for (const n of use) {
      if (String(n.author) === String(viewerId)) continue;
      if (!termsByAuthor.has(n.author)) termsByAuthor.set(n.author, new Set());
      const set = termsByAuthor.get(n.author);
      for (const t of n.termSet) set.add(t);
    }
    let myW = 0;
    for (const t of myTermSet) myW += weightOf(t);
    const byAuthor = new Map();
    for (const [author, terms] of termsByAuthor) {
      const common = [...terms].filter(t => myTermSet.has(t));
      let commonW = 0;
      for (const t of common) commonW += weightOf(t);
      let theirW = 0;
      for (const t of terms) theirW += weightOf(t);
      const floor = Math.min(myW, theirW);
      const score = floor > 0 ? Math.min(1, commonW / floor) : 0;
      common.sort((x, y) => weightOf(y) - weightOf(x) || x.localeCompare(y));
      const reasons = [];
      if (tribeMates.has(String(author))) reasons.push('tribe');
      if (common.some(t => pinnedTerms.has(t))) reasons.push('pinned');
      byAuthor.set(author, { score, common, reasons });
    }
    for (const m of tribeMates) if (!byAuthor.has(m)) byAuthor.set(m, { score: 0, common: [], reasons: ['tribe'] });
    return byAuthor;
  };

  return {
    KINDS: Object.keys(KINDS),

    async authorAffinities() {
      const graph = await buildGraph();
      const profile = await buildProfile(graph);
      return { viewerId: graph.viewerId, byAuthor: affinitiesFor(graph.viewerId, profile), hasProfile: profile.myTermSet.size > 0 };
    },

    async listMatches(filter = 'ALL', opts = {}) {
      const graph = await buildGraph();
      const { viewerId, following, supporters } = graph;
      const profile = await buildProfile(graph);
      const { use, myTermSet, cvTerms, contentTerms, pinnedTerms, tribeMates, myLocation, df, weightOf, total } = profile;
      const affinity = affinitiesFor(viewerId, profile);
      const f = String(filter || 'ALL').toUpperCase();

      const expanded = new Set();
      for (const n of use) {
        if (String(n.author) === String(viewerId)) continue;
        if (![...n.termSet].some(t => myTermSet.has(t))) continue;
        for (const t of n.termSet) if (!myTermSet.has(t)) expanded.add(t);
      }

      let out = [];
      for (const n of use) {
        if (!myTermSet.size) break;
        if (String(n.author) === String(viewerId)) continue;
        const common = [...n.termSet].filter(t => myTermSet.has(t));
        let commonW = 0;
        for (const t of common) commonW += weightOf(t);
        let indirectW = 0;
        for (const t of n.termSet) if (!myTermSet.has(t) && expanded.has(t)) indirectW += weightOf(t);
        let itemW = 0;
        for (const t of n.termSet) itemW += weightOf(t);
        const direct = itemW > 0 ? Math.min(1, commonW / itemW) : 0;
        const indirect = itemW > 0 ? Math.min(1, indirectW / itemW) : 0;
        let dfSum = 0;
        for (const t of n.termSet) dfSum += (df.get(t) || 1) / total;
        const connectivity = n.termSet.size ? dfSum / n.termSet.size : 0;
        const base = 0.8 * direct + 0.15 * indirect + 0.05 * connectivity;
        const ageDays = Math.max(0, (Date.now() - (n.ts || 0)) / 86400000);
        const recency = 0.8 + 0.2 * Math.exp(-ageDays / 60);
        const social = (following.has(String(n.author)) ? 0.1 : 0) + (tribeMates.has(String(n.author)) ? 0.05 : 0);
        const score = Math.min(1, base * recency + social);
        common.sort((x, y) => weightOf(y) - weightOf(x) || x.localeCompare(y));
        const author = String(n.author);
        const flags = new Set();
        if (!common.length && indirect > 0) flags.add('related');
        if (common.some(t => contentTerms.has(t))) flags.add('content');
        if (following.has(author) && supporters.has(author)) flags.add('mutual');
        else if (following.has(author)) flags.add('following');
        else if (supporters.has(author)) flags.add('supportsYou');
        if (tribeMates.has(author)) flags.add('tribe');
        const aff = affinity.get(n.author);
        if (aff && aff.score >= ALIKE_MIN_AFFINITY) flags.add('alike');
        if (common.some(t => cvTerms.has(t))) flags.add('cv');
        if (common.some(t => pinnedTerms.has(t))) flags.add('pinned');
        if (n.opinionsTotal >= RATED_MIN_OPINIONS) flags.add('rated');
        if (myLocation && n.location && n.location === myLocation) flags.add('near');
        const reasons = REASON_ORDER.filter(r => flags.has(r));
        out.push({ ...strip(n), score, common, connections: common.length, reasons });
      }

      const anyMatches = out.length > 0;
      const kindsAvail = {};
      for (const n of use) {
        if (String(n.author) !== String(viewerId)) kindsAvail[n.kind] = true;
      }

      if (f === 'RECENT') {
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        out = out.filter(s => s.ts >= cutoff);
      } else if (f !== 'ALL' && f !== 'TOP') {
        const kind = f.toLowerCase();
        if (KINDS[kind]) out = out.filter(s => s.kind === kind);
      }

      const q = norm(opts.q);
      if (q) out = out.filter(s => norm(s.title).includes(q) || s.common.some(t => t.includes(q)));

      const present = new Set();
      for (const s of out) for (const r of s.reasons) present.add(r);
      const reasonsAvail = REASON_ORDER.filter(r => present.has(r));
      const reason = String(opts.reason || '').trim();
      if (reason && REASON_ORDER.includes(reason)) out = out.filter(s => s.reasons.includes(reason));

      if (f === 'RECENT') out.sort((x, y) => y.ts - x.ts || y.score - x.score);
      else out.sort((x, y) => y.score - x.score || y.ts - x.ts);
      if (f === 'ALL' || f === 'TOP') out = diversify(out);

      return {
        matches: out.slice(0, MAX_PAIRS),
        total: out.length,
        hasProfile: myTermSet.size > 0,
        myTerms: [...myTermSet],
        kindsAvail,
        anyMatches,
        reasonsAvail,
        reason: reasonsAvail.includes(reason) ? reason : ''
      };
    },

    async jobMatchesFor(viewerId, { minScore = 0.8 } = {}) {
      const { nodes, cvByAuthor } = await buildGraph();
      const mine = cvByAuthor.get(viewerId);
      if (!mine) return [];
      return nodes
        .filter(n => n.kind === 'jobs' && String(n.author) !== String(viewerId))
        .map(n => {
          const { score, common } = jaccard(mine.termSet, n.coreTermSet || n.termSet);
          return { id: n.id, title: n.title, author: n.author, href: n.href, score, common };
        })
        .filter(m => m.score >= minScore)
        .sort((a, b) => b.score - a.score);
    },

    async cohesion() {
      const { cvByAuthor, nodes } = await buildGraph();
      const use = nodes.slice(0, MAX_ENTITIES);
      let comparisons = 0;
      let sum = 0;
      let connectedPairs = 0;
      const linkedEntities = new Set();
      for (let i = 0; i < use.length; i++) {
        for (let j = i + 1; j < use.length; j++) {
          const a = use[i], b = use[j];
          if (a.kind === 'inhabitants' && b.kind === 'inhabitants' && a.author === b.author) continue;
          const { score } = jaccard(a.termSet, b.termSet);
          comparisons += 1;
          sum += score;
          if (score > 0) { connectedPairs += 1; linkedEntities.add(a.id); linkedEntities.add(b.id); }
        }
      }
      const coefficient = comparisons > 0 ? sum / comparisons : 0;

      const people = [...cvByAuthor.values()];
      const linked = new Set();
      let cvComparisons = 0;
      let cvSum = 0;
      for (let i = 0; i < people.length; i++) {
        for (let j = i + 1; j < people.length; j++) {
          const { score } = jaccard(people[i].termSet, people[j].termSet);
          cvComparisons += 1;
          cvSum += score;
          if (score > 0) { linked.add(people[i].author); linked.add(people[j].author); }
        }
      }
      const cvCoefficient = cvComparisons > 0 ? cvSum / cvComparisons : 0;

      const skillSet = new Set();
      for (const p of people) for (const t of p.terms) skillSet.add(t);

      const termCount = new Map();
      for (const n of nodes) for (const t of n.terms) termCount.set(t, (termCount.get(t) || 0) + 1);
      const topTerms = [...termCount.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 12)
        .map(([term, count]) => ({ term, count }));

      const perKind = {};
      for (const n of nodes) perKind[n.kind] = (perKind[n.kind] || 0) + 1;

      return {
        coefficient,
        percent: Math.round(coefficient * 1000) / 10,
        comparisons,
        pairs: connectedPairs,
        entities: use.length,
        distinctTerms: termCount.size,
        topTerms,
        perKind,
        people: people.length,
        skills: skillSet.size,
        connected: linkedEntities.size,
        isolated: Math.max(0, use.length - linkedEntities.size),
        cvCoefficient,
        cvPercent: Math.round(cvCoefficient * 1000) / 10
      };
    }
  };
};
