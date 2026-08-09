const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');

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
  forum: { type: 'forum', href: (id) => `/forum/${encodeURIComponent(id)}` }
};

const KIND_BY_TYPE = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [v.type, k]));

const cvSkills = (c) => [
  ...(c.personalSkills || []),
  ...(c.oasisSkills || []),
  ...(c.educationalSkills || []),
  ...(c.professionalSkills || [])
];

const PLACEHOLDERS = new Set(['unknown', 'n/a', 'na', 'none', '-', 'other']);

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

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const getAllMessages = async (ssbClient) =>
    new Promise((resolve, reject) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => (err ? reject(err) : resolve(msgs)))
      );
    });

  const buildGraph = async () => {
    const ssbClient = await openSsb();
    const viewerId = ssbClient.id;
    const messages = await getAllMessages(ssbClient);
    const tomb = buildValidatedTombstoneSet(messages);

    const latestByKey = new Map();
    const replaced = new Set();
    for (const m of messages) {
      const v = m && m.value;
      const c = v && v.content;
      if (!c || typeof c !== 'object' || !c.type) continue;
      if (tomb.has(m.key)) continue;
      if (c.encryptedPayload || c.encryptedQuestion) continue;
      if (c.tribeId && c.type !== 'tribe') continue;
      const kind = KIND_BY_TYPE[c.type];
      if (!kind) continue;
      if (typeof c.replaces === 'string') replaced.add(c.replaces);
      latestByKey.set(m.key, { key: m.key, author: v.author, ts: v.timestamp || m.timestamp || 0, kind, c });
    }

    const nodes = [];
    const byAuthorCv = new Map();
    for (const node of latestByKey.values()) {
      if (replaced.has(node.key)) continue;
      const terms = termsOf(node.kind, node.c);
      if (!terms.length) continue;
      const entry = {
        id: node.key,
        kind: node.kind,
        author: node.c.author || node.author,
        title: titleOf(node.kind, node.c, node.c.author || node.author),
        terms,
        termSet: new Set(terms),
        ts: node.ts,
        createdAt: node.c.createdAt || new Date(node.ts).toISOString(),
        href: KINDS[node.kind].href(node.key, node.c)
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

    return { viewerId, nodes, cvByAuthor: byAuthorCv };
  };

  const MAX_ENTITIES = 400;
  const MAX_PAIRS = 300;

  const buildPairs = (nodes) => {
    const use = nodes.slice(0, MAX_ENTITIES);
    const df = new Map();
    for (const n of use) for (const t of n.termSet) df.set(t, (df.get(t) || 0) + 1);
    const total = use.length || 1;
    const weightOf = (t) => Math.log(1 + total / (df.get(t) || 1));
    const pairs = [];
    const links = new Map();
    for (let i = 0; i < use.length; i++) {
      for (let j = i + 1; j < use.length; j++) {
        const a = use[i], b = use[j];
        if (a.kind === 'inhabitants' && b.kind === 'inhabitants' && a.author === b.author) continue;
        const common = [...b.termSet].filter(x => a.termSet.has(x));
        if (!common.length) continue;
        let commonW = 0;
        for (const t of common) commonW += weightOf(t);
        let unionW = commonW;
        for (const t of a.termSet) if (!b.termSet.has(t)) unionW += weightOf(t);
        for (const t of b.termSet) if (!a.termSet.has(t)) unionW += weightOf(t);
        const score = unionW > 0 ? commonW / unionW : 0;
        if (score <= 0) continue;
        common.sort((x, y) => weightOf(y) - weightOf(x) || x.localeCompare(y));
        links.set(a.id, (links.get(a.id) || 0) + 1);
        links.set(b.id, (links.get(b.id) || 0) + 1);
        pairs.push({ a, b, score, common, ts: Math.max(a.ts, b.ts), sameAuthor: String(a.author) === String(b.author) });
      }
    }
    return { pairs, links };
  };

  const strip = (n) => ({
    id: n.id, kind: n.kind, author: n.author, title: n.title,
    href: n.href, createdAt: n.createdAt, ts: n.ts
  });

  return {
    KINDS: Object.keys(KINDS),

    async listMatches(filter = 'ALL', opts = {}) {
      const { viewerId, nodes, cvByAuthor } = await buildGraph();
      const { pairs, links } = buildPairs(nodes);
      const f = String(filter || 'ALL').toUpperCase();

      let out = pairs.map(pr => ({
        id: `${pr.a.id}|${pr.b.id}`,
        a: strip(pr.a),
        b: strip(pr.b),
        score: pr.score,
        common: pr.common,
        ts: pr.ts,
        createdAt: new Date(pr.ts).toISOString(),
        connections: (links.get(pr.a.id) || 0) + (links.get(pr.b.id) || 0),
        sameAuthor: pr.sameAuthor,
        involvesMe: String(pr.a.author) === String(viewerId) || String(pr.b.author) === String(viewerId)
      }));

      if (f !== 'MINE') out = out.filter(pr => !pr.sameAuthor);

      if (f === 'MINE') out = out.filter(pr => pr.involvesMe);
      else if (f === 'RECENT') {
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        out = out.filter(pr => pr.ts >= cutoff);
      } else if (f !== 'ALL' && f !== 'TOP') {
        const kind = f.toLowerCase();
        if (KINDS[kind]) out = out.filter(pr => pr.a.kind === kind || pr.b.kind === kind);
      }

      const q = norm(opts.q);
      if (q) out = out.filter(pr =>
        norm(pr.a.title).includes(q) || norm(pr.b.title).includes(q) || pr.common.some(t => t.includes(q)));

      if (f === 'RECENT') out.sort((x, y) => y.ts - x.ts || y.score - x.score);
      else if (f === 'TOP') out.sort((x, y) => y.connections - x.connections || y.score - x.score);
      else out.sort((x, y) => y.score - x.score || y.ts - x.ts);

      return {
        matches: out.slice(0, MAX_PAIRS),
        total: out.length,
        hasProfile: !!cvByAuthor.get(viewerId),
        myTerms: cvByAuthor.get(viewerId) ? cvByAuthor.get(viewerId).terms : []
      };
    },

    async jobMatchesFor(viewerId, { minScore = 0.8 } = {}) {
      const { nodes, cvByAuthor } = await buildGraph();
      const mine = cvByAuthor.get(viewerId);
      if (!mine) return [];
      return nodes
        .filter(n => n.kind === 'jobs' && String(n.author) !== String(viewerId))
        .map(n => {
          const { score, common } = jaccard(mine.termSet, n.termSet);
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
      for (let i = 0; i < use.length; i++) {
        for (let j = i + 1; j < use.length; j++) {
          const a = use[i], b = use[j];
          if (a.kind === 'inhabitants' && b.kind === 'inhabitants' && a.author === b.author) continue;
          const { score } = jaccard(a.termSet, b.termSet);
          comparisons += 1;
          sum += score;
          if (score > 0) connectedPairs += 1;
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
        connected: linked.size,
        isolated: Math.max(0, people.length - linked.size),
        cvCoefficient,
        cvPercent: Math.round(cvCoefficient * 1000) / 10
      };
    }
  };
};
