const pull = require('../server/node_modules/pull-stream');
const { readTyped, requestScope } = require('./typed_log');
const fs = require('fs');
const path = require('path');

const HOUSES_PATH = path.join(__dirname, '..', 'client', 'assets', 'larp', 'houses.json');
let HOUSES = {};
try { HOUSES = JSON.parse(fs.readFileSync(HOUSES_PATH, 'utf8')); } catch (_) { HOUSES = {}; }

const HOUSE_KEYS = ['academia','solaris','arrakis','terraverde','unsystem','dogma','helix','quark','hermandad'];
const VALID_KEY = (k) => HOUSE_KEYS.includes(String(k || '').toLowerCase());

const TEST_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const DECREE_TYPE = 'larpDecree';
const DECREES_PER_CYCLE = 3;
const DECREE_VOTE_MS = 7 * 24 * 60 * 60 * 1000;
const DECREE_TITLE_MAX = 160;
const DECREE_TEXT_MAX = 1000;
const LAW_POINTS = 10;
const ACADEMIA_GRACE_MS = 10 * 60 * 1000;

const PROFILE_QUESTIONS = [
  {
    k: "larpProfileQ1",
    q: "When you face a complex problem, what do you do first?",
    options: [
      { k: "larpProfileQ1O1", t: "Talk to others to find consensus",     w: { solaris: 3, hermandad: 1 } },
      { k: "larpProfileQ1O2", t: "Build a prototype to test",            w: { arrakis: 3, hermandad: 1 } },
      { k: "larpProfileQ1O3", t: "Research the literature",              w: { dogma: 3, terraverde: 1 } },
      { k: "larpProfileQ1O4", t: "Disrupt the system that creates it",   w: { unsystem: 3, quark: 1 } }
    ]
  },
  {
    k: "larpProfileQ2",
    q: "What gives meaning to your daily work?",
    options: [
      { k: "larpProfileQ2O1", t: "Defending the people I love",          w: { quark: 3, hermandad: 1 } },
      { k: "larpProfileQ2O2", t: "Creating something tangible",          w: { arrakis: 2, hermandad: 2 } },
      { k: "larpProfileQ2O3", t: "Healing or nurturing life",            w: { terraverde: 3, helix: 1 } },
      { k: "larpProfileQ2O4", t: "Crafting words and ideas",             w: { dogma: 2, solaris: 2 } },
      { k: "larpProfileQ2O5", t: "Making others laugh",                  w: { helix: 3, unsystem: 1 } }
    ]
  },
  {
    k: "larpProfileQ3",
    q: "When conflict arises in your group, you…",
    options: [
      { k: "larpProfileQ3O1", t: "Lead the dialogue",                    w: { solaris: 3 } },
      { k: "larpProfileQ3O2", t: "Take a side and stand firm",           w: { quark: 2, dogma: 1 } },
      { k: "larpProfileQ3O3", t: "Crack a joke to defuse",               w: { helix: 3, unsystem: 1 } },
      { k: "larpProfileQ3O4", t: "Question whether the conflict is real",w: { unsystem: 3, dogma: 1 } },
      { k: "larpProfileQ3O5", t: "Look for root ecological causes",      w: { terraverde: 2, dogma: 1 } }
    ]
  },
  {
    k: "larpProfileQ4",
    q: "Your favorite long-term project would be…",
    options: [
      { k: "larpProfileQ4O1", t: "Building a city",                      w: { hermandad: 3, arrakis: 1 } },
      { k: "larpProfileQ4O2", t: "Restoring a forest",                   w: { terraverde: 3, helix: 1 } },
      { k: "larpProfileQ4O3", t: "Writing a constitution",               w: { solaris: 2, dogma: 2 } },
      { k: "larpProfileQ4O4", t: "Organising a festival",                w: { helix: 3, hermandad: 1 } },
      { k: "larpProfileQ4O5", t: "Setting up a defense network",         w: { quark: 3, hermandad: 1 } },
      { k: "larpProfileQ4O6", t: "Designing a new machine",              w: { arrakis: 3, quark: 1 } },
      { k: "larpProfileQ4O7", t: "Curating an archive",                  w: { dogma: 3, solaris: 1 } },
      { k: "larpProfileQ4O8", t: "Disrupting an unjust order",           w: { unsystem: 3, quark: 1 } }
    ]
  },
  {
    k: "larpProfileQ5",
    q: "What makes a good leader?",
    options: [
      { k: "larpProfileQ5O1", t: "Someone who listens and mediates",     w: { solaris: 3, hermandad: 1 } },
      { k: "larpProfileQ5O2", t: "Someone who can fight and protect",    w: { quark: 3, unsystem: 1 } },
      { k: "larpProfileQ5O3", t: "Someone who knows history",            w: { dogma: 3, terraverde: 1 } },
      { k: "larpProfileQ5O4", t: "Someone who makes you smile",          w: { helix: 3, hermandad: 1 } }
    ]
  },
  {
    k: "larpProfileQ6",
    q: "Your relationship with rules:",
    options: [
      { k: "larpProfileQ6O1", t: "Rules emerge from dialogue and law",   w: { solaris: 3 } },
      { k: "larpProfileQ6O2", t: "Rules should be followed strictly",    w: { dogma: 2, quark: 2 } },
      { k: "larpProfileQ6O3", t: "Rules should be broken often",         w: { unsystem: 3, helix: 1 } },
      { k: "larpProfileQ6O4", t: "Rules should serve life",              w: { terraverde: 3, helix: 1 } },
      { k: "larpProfileQ6O5", t: "Rules build solid infrastructure",     w: { hermandad: 2, arrakis: 2 } }
    ]
  },
  {
    k: "larpProfileQ7",
    q: "How do you handle information?",
    options: [
      { k: "larpProfileQ7O1", t: "I curate and preserve it",             w: { dogma: 3, hermandad: 1 } },
      { k: "larpProfileQ7O2", t: "I share it through stories",           w: { helix: 2, dogma: 2 } },
      { k: "larpProfileQ7O3", t: "I question its origins",               w: { unsystem: 3, dogma: 1 } },
      { k: "larpProfileQ7O4", t: "I extract the useful bits",            w: { arrakis: 2, quark: 2 } },
      { k: "larpProfileQ7O5", t: "I use it to heal",                     w: { terraverde: 3 } }
    ]
  },
  {
    k: "larpProfileQ8",
    q: "Your idea of success is…",
    options: [
      { k: "larpProfileQ8O1", t: "A working machine",                    w: { arrakis: 3, hermandad: 1 } },
      { k: "larpProfileQ8O2", t: "A peaceful community",                 w: { solaris: 2, terraverde: 2 } },
      { k: "larpProfileQ8O3", t: "A lively festival",                    w: { helix: 3, hermandad: 1 } },
      { k: "larpProfileQ8O4", t: "A safe family",                        w: { quark: 3, terraverde: 1 } },
      { k: "larpProfileQ8O5", t: "An unbroken archive",                  w: { dogma: 3, hermandad: 1 } },
      { k: "larpProfileQ8O6", t: "A cracked dogma",                      w: { unsystem: 3, dogma: 1 } },
      { k: "larpProfileQ8O7", t: "A thriving harvest",                   w: { terraverde: 3, hermandad: 1 } },
      { k: "larpProfileQ8O8", t: "A finished building",                  w: { hermandad: 3, arrakis: 1 } }
    ]
  },
  {
    k: "larpProfileQ9",
    q: "When you wake up, you want to…",
    options: [
      { k: "larpProfileQ9O1", t: "Train your body",                      w: { quark: 3, helix: 1 } },
      { k: "larpProfileQ9O2", t: "Read or write",                        w: { dogma: 3, solaris: 1 } },
      { k: "larpProfileQ9O3", t: "Garden or cook",                       w: { terraverde: 3, helix: 1 } },
      { k: "larpProfileQ9O4", t: "Tinker with something",                w: { arrakis: 3, hermandad: 1 } },
      { k: "larpProfileQ9O5", t: "Question authority",                   w: { unsystem: 3, dogma: 1 } },
      { k: "larpProfileQ9O6", t: "Plan a project",                       w: { hermandad: 3, solaris: 1 } },
      { k: "larpProfileQ9O7", t: "Talk to friends",                      w: { solaris: 2, helix: 2 } },
      { k: "larpProfileQ9O8", t: "Make art",                             w: { helix: 3, unsystem: 1 } }
    ]
  },
  {
    k: "larpProfileQ10",
    q: "Your weakness might be:",
    options: [
      { k: "larpProfileQ10O1", t: "Talking too much",                    w: { solaris: 3, dogma: 1 } },
      { k: "larpProfileQ10O2", t: "Being too pragmatic",                 w: { arrakis: 3, hermandad: 1 } },
      { k: "larpProfileQ10O3", t: "Being too idealistic",                w: { terraverde: 3, helix: 1 } },
      { k: "larpProfileQ10O4", t: "Being too disruptive",                w: { unsystem: 3, quark: 1 } },
      { k: "larpProfileQ10O5", t: "Being too rigid",                     w: { dogma: 3, quark: 1 } },
      { k: "larpProfileQ10O6", t: "Being too lighthearted",              w: { helix: 3, unsystem: 1 } },
      { k: "larpProfileQ10O7", t: "Being too cautious",                  w: { quark: 3, hermandad: 1 } },
      { k: "larpProfileQ10O8", t: "Being too ambitious",                 w: { hermandad: 3, arrakis: 1 } }
    ]
  }
];

const TEST_QUESTIONS_COUNT = PROFILE_QUESTIONS.length;

const SOLAR_AGE_OFFSET = 10000000 - 2026;

const RULING_KEYS = HOUSE_KEYS.filter(k => k !== 'academia');
const WHEEL_POINTS = [[11, 21], [1, 4], [2, 21], [4, 6], [5, 21], [7, 5], [8, 22], [10, 6]];

const wheelStart = (wheelYear, idx) => {
  const [month, day] = WHEEL_POINTS[idx];
  return new Date(idx === 0 ? wheelYear - 1 : wheelYear, month, day);
};

function getCycleWindow(now = new Date()) {
  const t = new Date(now);
  const wheelYear = t >= new Date(t.getFullYear(), 11, 21) ? t.getFullYear() + 1 : t.getFullYear();
  let index = 0;
  for (let i = WHEEL_POINTS.length - 1; i >= 0; i -= 1) {
    if (t >= wheelStart(wheelYear, i)) { index = i; break; }
  }
  const start = wheelStart(wheelYear, index);
  const end = index + 1 < WHEEL_POINTS.length ? wheelStart(wheelYear, index + 1) : wheelStart(wheelYear + 1, 0);
  const season = index < 4 ? 1 : 2;
  const seasonStart = wheelStart(wheelYear, season === 1 ? 0 : 4);
  const seasonEnd = season === 1 ? wheelStart(wheelYear, 4) : wheelStart(wheelYear + 1, 0);
  return { wheelYear, index, houseKey: RULING_KEYS[index], start, end, season, seasonStart, seasonEnd };
}

function nextRulingStart(houseKey, now = new Date()) {
  const idx = RULING_KEYS.indexOf(houseKey);
  if (idx < 0) return null;
  const w = getCycleWindow(now);
  if (w.index === idx) return w.start;
  return wheelStart(idx > w.index ? w.wheelYear : w.wheelYear + 1, idx);
}

function cyclesUntilRuling(houseKey, now = new Date()) {
  const idx = RULING_KEYS.indexOf(houseKey);
  if (idx < 0) return null;
  const w = getCycleWindow(now);
  return (idx - w.index + RULING_KEYS.length) % RULING_KEYS.length;
}

function computeCycle(now = new Date()) {
  const t = new Date(now);
  const year = t.getFullYear();
  const dayOfYear = Math.floor((t - new Date(year, 0, 1)) / 86400000) + 1;
  const w = getCycleWindow(t);
  const house = HOUSES[w.houseKey] || { short: w.houseKey.slice(0, 3), name: w.houseKey };
  const solarAge = year + SOLAR_AGE_OFFSET;
  const houseCycle = Math.floor(year - 2026 + 1);
  return {
    day: dayOfYear,
    solstice: w.season,
    age: solarAge,
    houseKey: w.houseKey,
    houseShort: house.short || w.houseKey.slice(0, 3),
    cycle: houseCycle,
    start: w.start,
    end: w.end,
    formatted: `${dayOfYear}.${w.season}.${solarAge}.${house.short || w.houseKey.slice(0, 3)}.${houseCycle}`
  };
}

function decreeQuorum(population) {
  return Math.max(3, Math.ceil((Number(population) || 0) * 0.05));
}

function decreeOutcome(decree, vote, minVoters, now = Date.now()) {
  if (decree && (decree.status === 'ENACTED' || decree.status === 'REJECTED')) return decree.status;
  const deadline = Date.parse((decree && decree.deadline) || (vote && vote.deadline) || '') || 0;
  if (!deadline || now < deadline) return 'OPEN';
  const yes = Number(vote && vote.votes && vote.votes.YES) || 0;
  const no = Number(vote && vote.votes && vote.votes.NO) || 0;
  const voters = Number(vote && vote.totalVotes) || (vote && Array.isArray(vote.voters) ? vote.voters.length : 0);
  return voters >= minVoters && yes > no ? 'APPROVED' : 'REJECTED';
}

function influenceOf(decrees, houseAt, window = null) {
  const rows = Object.fromEntries(RULING_KEYS.map(k => [k, { house: k, points: 0, laws: 0, votes: 0 }]));
  for (const d of Array.isArray(decrees) ? decrees : []) {
    if (!rows[d.house]) continue;
    if (window && (d.ts < window.start.getTime() || d.ts >= window.end.getTime())) continue;
    if (d.status === 'ENACTED') { rows[d.house].points += LAW_POINTS; rows[d.house].laws += 1; }
    const choices = d.vote && d.vote.choices && typeof d.vote.choices === 'object' ? d.vote.choices : {};
    const at = Math.min(Date.now(), Date.parse(d.deadline || '') || Date.now());
    for (const voter of Object.keys(choices)) {
      const h = houseAt(voter, at);
      if (!rows[h] || h === d.house) continue;
      rows[h].points += 1;
      rows[h].votes += 1;
    }
  }
  return Object.values(rows).sort((a, b) => b.points - a.points || b.laws - a.laws || b.votes - a.votes || a.house.localeCompare(b.house));
}

function winnerOf(rows) {
  const top = (rows || [])[0];
  if (!top || top.points <= 0) return null;
  const second = rows[1];
  if (second && second.points === top.points && second.laws === top.laws && second.votes === top.votes) return null;
  return top;
}

function getGoverningHouseKey(now = new Date()) {
  return getCycleWindow(now).houseKey;
}

function getGoverningPeriodId(now = new Date()) {
  const w = getCycleWindow(now);
  return `${w.houseKey}:${w.wheelYear}-${w.index + 1}`;
}

module.exports = ({ cooler, tribesModel, cryptoModel }) => {
  let ssb;
  let services = {};
  const attach = (extra) => { services = { ...services, ...(extra || {}) }; };
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };
  const startedAt = Date.now();
  let academiaRetry = null;
  const followsSomeone = async (client, me) => {
    const contacts = await readTyped(client, ['contact']).catch(() => []);
    return contacts.some((m) => m && m.value && m.value.author === me && m.value.content && m.value.content.following === true);
  };

  const houseTribeTag = (houseKey) => {
    const h = HOUSES[houseKey];
    return `larp-${h && h.name ? h.name : houseKey}`;
  };

  async function findMyHouseTribe(houseKey) {
    if (!tribesModel || !VALID_KEY(houseKey)) return null;
    const client = await openSsb();
    const me = client.id;
    let list = [];
    try { list = await tribesModel.listAll(); } catch (_) { return null; }
    const tag = houseTribeTag(houseKey);
    const candidates = list.filter(t => {
      const tags = Array.isArray(t.tags) ? t.tags : [];
      const members = Array.isArray(t.members) ? t.members : [];
      return tags.includes(tag) && members.includes(me);
    });
    if (!candidates.length) return null;
    candidates.sort((a, b) => (new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()) || String(a.id || '').localeCompare(String(b.id || '')));
    return candidates[0];
  }

  async function houseTribeReady(houseKey) {
    if (await findMyHouseTribe(houseKey).catch(() => null)) return true;
    return houseKey === 'academia' && !!(await findAnyHouseTribe(houseKey).catch(() => null));
  }

  async function findAnyHouseTribe(houseKey) {
    if (!tribesModel || !VALID_KEY(houseKey)) return null;
    let list = [];
    try { list = await tribesModel.listAll(); } catch (_) { return null; }
    const tag = houseTribeTag(houseKey);
    const candidates = list.filter(t => {
      const tags = Array.isArray(t.tags) ? t.tags : [];
      return tags.includes(tag);
    });
    if (!candidates.length) return null;
    candidates.sort((a, b) => (new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()) || String(a.id || '').localeCompare(String(b.id || '')));
    return candidates[0];
  }

  const ANCHOR_TYPES = ['larpHouseTribeAnchor', 'larpHouseTribeAnchorTombstone', 'tombstone'];
  const authorOfMsg = (client, key) => new Promise((resolve) => client.get(key, (err, v) => resolve(err || !v ? null : v.author || null)));

  async function findEarliestHouseAnchor(houseKey) {
    if (!VALID_KEY(houseKey)) return null;
    const client = await openSsb();
    const msgs = await readTyped(client, ANCHOR_TYPES);
    const anchors = [];
    const killedAnchorPairs = new Set();
    const tombAuthors = new Map();
    for (const m of msgs) {
      const c = m && m.value && m.value.content;
      if (!c || typeof c !== 'object') continue;
      const author = m.value.author;
      if (c.type === 'larpHouseTribeAnchor') {
        if (c.house !== houseKey || typeof c.tribeRootId !== 'string') continue;
        const tribeTs = Number(Date.parse(c.tribeCreatedAt || '')) || m.value.timestamp || 0;
        anchors.push({ tribeRootId: c.tribeRootId, anchorAuthor: author, tribeTs });
      } else if (c.type === 'larpHouseTribeAnchorTombstone') {
        if (c.house !== houseKey || typeof c.tribeRootId !== 'string') continue;
        killedAnchorPairs.add(`${c.tribeRootId}|${author}`);
      } else if (c.type === 'tombstone' && typeof c.target === 'string') {
        if (!tombAuthors.has(c.target)) tombAuthors.set(c.target, new Set());
        tombAuthors.get(c.target).add(author);
      }
    }
    const candidates = anchors.filter(a => !killedAnchorPairs.has(`${a.tribeRootId}|${a.anchorAuthor}`));
    const deadTribes = new Set();
    await Promise.all([...new Set(candidates.map(a => a.tribeRootId).filter(t => tombAuthors.has(t)))].map(async (t) => {
      const tribeAuthor = await authorOfMsg(client, t);
      if (tribeAuthor && tombAuthors.get(t).has(tribeAuthor)) deadTribes.add(t);
    }));
    const live = candidates.filter(a => !deadTribes.has(a.tribeRootId));
    if (!live.length) return null;
    live.sort((a, b) => a.tribeTs - b.tribeTs);
    const first = live[0];
    return { tribeRootId: first.tribeRootId, author: first.anchorAuthor, tribeTs: first.tribeTs };
  }

  async function findHouseAnchorByTribe(houseKey, tribeRootId) {
    if (!VALID_KEY(houseKey) || !tribeRootId) return null;
    const client = await openSsb();
    const msgs = await readTyped(client, ANCHOR_TYPES);
    for (const m of msgs) {
      const c = m && m.value && m.value.content;
      if (!c || c.type !== 'larpHouseTribeAnchor' || c.house !== houseKey || c.tribeRootId !== tribeRootId) continue;
      return { author: m.value.author, ts: m.value.timestamp || 0 };
    }
    return null;
  }

  async function publishHouseTribeAnchor(houseKey, tribeRootId, tribeCreatedAt) {
    if (!VALID_KEY(houseKey) || !tribeRootId) return null;
    const client = await openSsb();
    return new Promise((resolve) => {
      client.publish({
        type: 'larpHouseTribeAnchor',
        house: houseKey,
        tribeRootId,
        tribeCreatedAt: tribeCreatedAt || new Date().toISOString(),
        anchoredAt: new Date().toISOString()
      }, (err, msg) => resolve(err ? null : msg));
    });
  }

  async function listMyHouseTribes(houseKey) {
    if (!tribesModel || !VALID_KEY(houseKey)) return [];
    const client = await openSsb();
    const me = client.id;
    let list = [];
    try { list = await tribesModel.listAll(); } catch (_) { return []; }
    const tag = houseTribeTag(houseKey);
    const out = [];
    for (const t of list) {
      const tags = Array.isArray(t.tags) ? t.tags : [];
      const members = Array.isArray(t.members) ? t.members : [];
      if (!tags.includes(tag) || !members.includes(me)) continue;
      const rootId = await tribesModel.getRootId(t.id).catch(() => t.id);
      const createdAtTs = Number(Date.parse(t.createdAt || '')) || 0;
      out.push({ tribe: t, rootId, createdAtTs });
    }
    return out;
  }

  async function tombstoneMyTribe(houseKey, rootId, tribeId) {
    try { await tribesModel.publishTombstone(tribeId); } catch (_) {}
    if (houseKey !== 'academia') {
      await publishHouseAnchorTombstone(houseKey, rootId).catch(() => {});
    }
    if (cryptoModel && typeof cryptoModel.dropKey === 'function') {
      try { cryptoModel.dropKey(rootId); } catch (_) {}
    }
  }

  async function ensureHouseTribe(houseKey) {
    if (!tribesModel || !VALID_KEY(houseKey)) return null;
    const client = await openSsb();
    const me = client.id;

    if (houseKey === 'academia') {
      const canonical = await findAnyHouseTribe(houseKey).catch(() => null);
      const canonRoot = canonical ? await tribesModel.getRootId(canonical.id).catch(() => canonical.id) : null;
      const myTribes = await listMyHouseTribes(houseKey);
      myTribes.sort((a, b) => (a.createdAtTs - b.createdAtTs) || String(a.rootId || '').localeCompare(String(b.rootId || '')));
      const keepRoot = canonRoot || (myTribes[0] && myTribes[0].rootId);
      for (const t of myTribes) {
        if (t.rootId === keepRoot) continue;
        if (t.tribe.author !== me) continue;
        await tombstoneMyTribe(houseKey, t.rootId, t.tribe.id).catch(() => {});
      }
      const mineNow = await findMyHouseTribe(houseKey);
      if (mineNow) return mineNow;
      if (canonical) {
        await redeemPendingAutoInvites().catch(() => {});
        return await findMyHouseTribe(houseKey) || canonical;
      }
      if (Date.now() - startedAt < ACADEMIA_GRACE_MS && await followsSomeone(client, me)) {
        if (!academiaRetry) {
          academiaRetry = setTimeout(() => { academiaRetry = null; enqueue(runCatchup); }, ACADEMIA_GRACE_MS - (Date.now() - startedAt));
          if (academiaRetry.unref) academiaRetry.unref();
        }
        return null;
      }
      const house = HOUSES[houseKey] || {};
      const tag = houseTribeTag(houseKey);
      try {
        await tribesModel.createTribe(house.name || houseKey, house.description || '', house.image || null, '', [tag], false, 'open', null, 'PUBLIC', '');
      } catch (_) {}
      return await findMyHouseTribe(houseKey);
    }

    const anchor = await findEarliestHouseAnchor(houseKey).catch(() => null);
    const myTribes = await listMyHouseTribes(houseKey);
    myTribes.sort((a, b) => a.createdAtTs - b.createdAtTs);

    let myCanonical = null;
    if (anchor) {
      myCanonical = myTribes.find(x => x.rootId === anchor.tribeRootId) || null;
    }

    if (!myCanonical && myTribes.length > 0) {
      const myOldest = myTribes[0];
      const myOldestTs = myOldest.createdAtTs;
      if (!anchor) {
        await publishHouseTribeAnchor(houseKey, myOldest.rootId, myOldest.tribe.createdAt).catch(() => {});
        myCanonical = myOldest;
      } else if (myOldestTs > 0 && anchor.tribeTs > 0 && myOldestTs < anchor.tribeTs) {
        const existingAnchor = await findHouseAnchorByTribe(houseKey, myOldest.rootId);
        if (!existingAnchor) {
          await publishHouseTribeAnchor(houseKey, myOldest.rootId, myOldest.tribe.createdAt).catch(() => {});
        }
        myCanonical = myOldest;
      }
    }

    for (const t of myTribes) {
      if (myCanonical && t.rootId === myCanonical.rootId) continue;
      if (t.tribe.author !== me) continue;
      await tombstoneMyTribe(houseKey, t.rootId, t.tribe.id);
    }

    if (myCanonical) {
      const existingAnchorForMine = await findHouseAnchorByTribe(houseKey, myCanonical.rootId);
      if (!existingAnchorForMine) {
        await publishHouseTribeAnchor(houseKey, myCanonical.rootId, myCanonical.tribe.createdAt).catch(() => {});
      }
      return myCanonical.tribe;
    }

    if (anchor) {
      await redeemPendingAutoInvites().catch(() => {});
      return await findMyHouseTribe(houseKey);
    }

    const existingAny = await findAnyHouseTribe(houseKey).catch(() => null);
    if (existingAny) {
      const rootId = await tribesModel.getRootId(existingAny.id).catch(() => existingAny.id);
      const hasAnchor = await findHouseAnchorByTribe(houseKey, rootId);
      if (!hasAnchor) await publishHouseTribeAnchor(houseKey, rootId, existingAny.createdAt).catch(() => {});
      if (Array.isArray(existingAny.members) && existingAny.members.includes(me)) return existingAny;
      await redeemPendingAutoInvites().catch(() => {});
      return await findMyHouseTribe(houseKey);
    }

    const house = HOUSES[houseKey] || {};
    const tag = houseTribeTag(houseKey);
    try {
      await tribesModel.createTribe(house.name || houseKey, house.description || '', house.image || null, '', [tag], true, 'open', null, 'PRIVATE', '');
    } catch (_) {}
    const created = await findMyHouseTribe(houseKey);
    if (created) {
      const rootId = await tribesModel.getRootId(created.id).catch(() => created.id);
      await publishHouseTribeAnchor(houseKey, rootId, created.createdAt).catch(() => {});
    }
    return created;
  }

  async function publishHouseAnchorTombstone(houseKey, tribeRootId) {
    if (!VALID_KEY(houseKey) || !tribeRootId) return null;
    const client = await openSsb();
    return new Promise((resolve) => {
      client.publish({
        type: 'larpHouseTribeAnchorTombstone',
        house: houseKey,
        tribeRootId,
        tombstonedAt: new Date().toISOString()
      }, (err, msg) => resolve(err ? null : msg));
    });
  }

  async function leaveMyHouseTribe(houseKey) {
    if (!tribesModel) return;
    const client = await openSsb();
    const me = client.id;
    const myTribes = await listMyHouseTribes(houseKey);
    for (const t of myTribes) {
      const isSoloAuthor = t.tribe.author === me && Array.isArray(t.tribe.members) && t.tribe.members.length === 1 && t.tribe.members[0] === me;
      try { await tribesModel.leaveTribe(t.tribe.id, { force: true }); } catch (_) {}
      if (isSoloAuthor) {
        if (houseKey !== 'academia') {
          await publishHouseAnchorTombstone(houseKey, t.rootId).catch(() => {});
        }
        if (cryptoModel && typeof cryptoModel.dropKey === 'function') {
          try { cryptoModel.dropKey(t.rootId); } catch (_) {}
        }
      }
    }
  }

  async function publishJoin(houseKey) {
    if (!VALID_KEY(houseKey)) throw new Error('Invalid house key');
    const client = await openSsb();
    let previousHouse = null;
    try { previousHouse = await getUserHouse(client.id); } catch (_) {}
    await new Promise((resolve, reject) => {
      client.publish({
        type: 'larpJoinHouse',
        house: houseKey,
        joinedAt: new Date().toISOString()
      }, (err, msg) => err ? reject(err) : resolve(msg));
    });
    forgetMemberships();
    if (previousHouse && previousHouse !== houseKey) {
      await leaveMyHouseTribe(previousHouse).catch(() => {});
    }
    await ensureHouseTribe(houseKey).catch(() => {});
    await redeemPendingAutoInvites().catch(() => {});
    await issueAutoInvitesForMyHouse().catch(() => {});
  }

  async function getUserHouse(feedId) {
    const client = await openSsb();
    const target = feedId || client.id;
    return (await listAllMemberships()).get(target) || null;
  }

  async function readMemberships() {
    const client = await openSsb();
    const msgs = await readTyped(client, ['larpJoinHouse', 'larpLeaveLarp'], { limit: 0 });
    const byAuthor = new Map();
    for (const m of msgs) {
      const author = m && m.value && m.value.author;
      if (!author) continue;
      const c = m.value.content;
      if (!c) continue;
      const ts = m.value.timestamp || 0;
      const seq = Number(m.value.sequence) || 0;
      const prev = byAuthor.get(author);
      const newer = !prev || ts > prev.ts || (ts === prev.ts && seq > prev.seq);
      if (c.type === 'larpJoinHouse' && VALID_KEY(c.house)) {
        if (newer) byAuthor.set(author, { house: c.house, ts, seq });
      } else if (c.type === 'larpLeaveLarp') {
        if (newer) byAuthor.set(author, { house: null, ts, seq });
      }
    }
    const result = new Map();
    for (const [a, v] of byAuthor.entries()) {
      if (v.house) result.set(a, v.house);
    }
    return result;
  }

  const forgetMemberships = () => {
    const store = requestScope.getStore();
    if (store) delete store.larpMemberships;
  };

  async function readTimeline() {
    const client = await openSsb();
    const msgs = await readTyped(client, ['larpJoinHouse', 'larpLeaveLarp'], { limit: 0 });
    const byAuthor = new Map();
    for (const m of msgs) {
      const author = m && m.value && m.value.author;
      const c = m && m.value && m.value.content;
      if (!author || !c) continue;
      const house = c.type === 'larpJoinHouse' ? (VALID_KEY(c.house) ? c.house : undefined) : c.type === 'larpLeaveLarp' ? null : undefined;
      if (house === undefined) continue;
      if (!byAuthor.has(author)) byAuthor.set(author, []);
      byAuthor.get(author).push({ ts: m.value.timestamp || 0, seq: Number(m.value.sequence) || 0, house });
    }
    for (const list of byAuthor.values()) list.sort((a, b) => a.ts - b.ts || a.seq - b.seq);
    return (author, ts) => {
      let house = null;
      for (const e of byAuthor.get(author) || []) { if (e.ts <= ts) house = e.house; else break; }
      return house;
    };
  }

  async function houseTimeline() {
    const store = requestScope.getStore();
    if (!store) return readTimeline();
    if (!store.larpTimeline) store.larpTimeline = readTimeline();
    return store.larpTimeline;
  }

  async function listAllMemberships() {
    const store = requestScope.getStore();
    if (!store) return readMemberships();
    if (!store.larpMemberships) store.larpMemberships = readMemberships();
    return store.larpMemberships;
  }

  async function publishLeaveLarp() {
    const client = await openSsb();
    let previousHouse = null;
    try { previousHouse = await getUserHouse(client.id); } catch (_) {}
    await new Promise((resolve, reject) => {
      client.publish({
        type: 'larpLeaveLarp',
        leftAt: new Date().toISOString()
      }, (err, msg) => err ? reject(err) : resolve(msg));
    });
    forgetMemberships();
    if (previousHouse) {
      await leaveMyHouseTribe(previousHouse).catch(() => {});
    }
  }

  async function listHousesWithCounts() {
    const memberships = await listAllMemberships();
    const counts = Object.fromEntries(HOUSE_KEYS.map(k => [k, 0]));
    for (const house of memberships.values()) {
      if (counts[house] !== undefined) counts[house] += 1;
    }
    return HOUSE_KEYS.map(key => ({
      key,
      ...HOUSES[key],
      memberCount: counts[key] || 0
    }));
  }

  async function getMembersOfHouse(houseKey) {
    if (!VALID_KEY(houseKey)) return [];
    const memberships = await listAllMemberships();
    const out = [];
    for (const [author, house] of memberships.entries()) {
      if (house === houseKey) out.push(author);
    }
    return out;
  }

  async function publishHousePost({ house, text }) {
    if (!VALID_KEY(house)) throw new Error('Invalid house key');
    const client = await openSsb();
    const clean = String(text || '').trim().slice(0, 4000);
    if (!clean) throw new Error('Empty post');
    return new Promise((resolve, reject) => {
      client.publish({
        type: 'larpHousePost',
        house,
        text: clean,
        createdAt: new Date().toISOString()
      }, (err, msg) => err ? reject(err) : resolve(msg));
    });
  }

  function wallIsPublic(houseKey, { isGoverning = false } = {}) {
    return houseKey === 'academia' || isGoverning === true;
  }

  async function listHousePosts(houseKey, { viewerHouse = null, isGoverning = false } = {}) {
    if (!VALID_KEY(houseKey)) return [];
    const viewerIsMember = viewerHouse === houseKey;
    if (!viewerIsMember && !wallIsPublic(houseKey, { isGoverning })) return [];
    const client = await openSsb();
    const houseAt = await houseTimeline();
    return new Promise((resolve) => {
      const posts = [];
      const tombs = new Map();
      pull(
        client.createLogStream({ reverse: true }),
        pull.drain((m) => {
          const c = m && m.value && m.value.content;
          if (c && c.type === 'tombstone' && typeof c.target === 'string') {
            if (!tombs.has(c.target)) tombs.set(c.target, new Set());
            tombs.get(c.target).add(m.value.author);
            return;
          }
          if (!c || c.type !== 'larpHousePost') return;
          if (c.house !== houseKey) return;
          const author = m.value.author;
          const memberHouse = houseAt(author, m.value.timestamp || 0) || 'academia';
          if (houseKey !== 'academia' && memberHouse !== houseKey) return;
          posts.push({
            id: m.key,
            author,
            authorHouse: memberHouse,
            text: String(c.text || ''),
            createdAt: m.value.timestamp ? new Date(m.value.timestamp).toISOString() : (c.createdAt || new Date(0).toISOString()),
            ts: m.value.timestamp || 0
          });
        }, () => {
          const shown = posts.filter(post => !(tombs.get(post.id) && tombs.get(post.id).has(post.author)));
          shown.sort((a, b) => b.ts - a.ts);
          resolve(shown);
        })
      );
    });
  }

  async function getLastTestAttempt(feedId) {
    const client = await openSsb();
    const target = feedId || client.id;
    return new Promise((resolve) => {
      let latest = null;
      pull(
        client.createUserStream({ id: target, reverse: true }),
        pull.drain((m) => {
          const c = m && m.value && m.value.content;
          if (!c || c.type !== 'larpTestAttempt') return;
          if (!VALID_KEY(c.house)) return;
          const ts = m.value.timestamp || 0;
          if (!latest || ts > latest.ts) latest = { house: c.house, ts, passed: c.passed === true, score: c.score || 0 };
        }, () => resolve(latest))
      );
    });
  }

  async function canTakeTest(feedId) {
    const last = await getLastTestAttempt(feedId);
    if (!last) return { allowed: true, nextAt: 0, last: null };
    const elapsed = Date.now() - last.ts;
    if (elapsed >= TEST_COOLDOWN_MS) return { allowed: true, nextAt: 0, last };
    return { allowed: false, nextAt: last.ts + TEST_COOLDOWN_MS, last };
  }

  function getProfileTest() {
    return PROFILE_QUESTIONS.map(q => ({
      key: q.k,
      question: q.q,
      options: q.options.map(o => ({ key: o.k, text: o.t }))
    }));
  }

  function scoreProfileAnswers(answers, memberCounts = {}) {
    const scores = Object.fromEntries(HOUSE_KEYS.filter(k => k !== 'academia').map(k => [k, 0]));
    PROFILE_QUESTIONS.forEach((q, i) => {
      const choice = Number(answers && answers[i]);
      if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return;
      const weights = q.options[choice].w || {};
      for (const [house, weight] of Object.entries(weights)) {
        if (scores[house] === undefined) continue;
        scores[house] += Number(weight) || 0;
      }
    });
    const ranking = Object.entries(scores).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const ma = memberCounts[a[0]] || 0;
      const mb = memberCounts[b[0]] || 0;
      if (ma !== mb) return ma - mb;
      return a[0].localeCompare(b[0]);
    });
    const bestHouse = ranking[0] ? ranking[0][0] : null;
    const bestScore = ranking[0] ? ranking[0][1] : 0;
    return { scores, ranking, bestHouse, bestScore };
  }

  async function submitProfileTest({ answers }) {
    const client = await openSsb();
    const can = await canTakeTest(client.id);
    if (!can.allowed) return { ok: false, reason: 'cooldown', nextAt: can.nextAt };
    const housesWithCounts = await listHousesWithCounts();
    const memberCounts = Object.fromEntries(housesWithCounts.map(h => [h.key, h.memberCount || 0]));
    const { scores, ranking, bestHouse, bestScore } = scoreProfileAnswers(answers, memberCounts);
    const target = bestHouse || 'academia';
    await new Promise((resolve, reject) => {
      client.publish({
        type: 'larpTestAttempt',
        house: target,
        passed: true,
        attemptedAt: new Date().toISOString()
      }, (err) => err ? reject(err) : resolve());
    });
    await publishJoin(target);
    return { ok: true, passed: true, house: target, score: bestScore, scores, ranking };
  }

  async function readDecrees() {
    const client = await openSsb();
    const msgs = await readTyped(client, [DECREE_TYPE], { limit: 0 });
    const houseAt = await houseTimeline();
    const roots = new Map();
    const updates = [];
    for (const m of msgs) {
      const c = m && m.value && m.value.content;
      if (!c || c.type !== DECREE_TYPE) continue;
      if (typeof c.replaces === 'string') { updates.push(m); continue; }
      const author = m.value.author;
      const ts = m.value.timestamp || 0;
      const when = new Date(ts);
      if (!RULING_KEYS.includes(c.house) || getGoverningHouseKey(when) !== c.house || c.period !== getGoverningPeriodId(when)) continue;
      if (houseAt(author, ts) !== c.house || typeof c.voteId !== 'string' || !String(c.title || '').trim()) continue;
      roots.set(m.key, {
        id: m.key, author, ts, house: c.house, period: c.period,
        title: String(c.title).trim().slice(0, DECREE_TITLE_MAX),
        description: String(c.description || '').slice(0, DECREE_TEXT_MAX),
        voteId: c.voteId, deadline: c.deadline || null, createdAt: c.createdAt || when.toISOString(),
        status: 'OPEN', lawId: null
      });
    }
    const perPeriod = new Map();
    for (const d of [...roots.values()].sort((a, b) => a.ts - b.ts)) {
      const n = perPeriod.get(d.period) || 0;
      if (n >= DECREES_PER_CYCLE) { roots.delete(d.id); continue; }
      perPeriod.set(d.period, n + 1);
    }
    for (const m of updates.sort((a, b) => (a.value.timestamp || 0) - (b.value.timestamp || 0))) {
      const c = m.value.content;
      const d = roots.get(c.replaces);
      if (!d || m.value.author !== d.author || !['ENACTED', 'REJECTED'].includes(c.status)) continue;
      d.status = c.status;
      d.lawId = c.lawId || null;
    }
    return [...roots.values()].sort((a, b) => b.ts - a.ts);
  }

  async function voteIndex() {
    const list = services.votes && typeof services.votes.listAll === 'function' ? await services.votes.listAll('all').catch(() => []) : [];
    const index = new Map();
    for (const v of list) {
      if (v && v.id) index.set(v.id, v);
      if (v && v.rootId) index.set(v.rootId, v);
    }
    return index;
  }

  async function currentQuorum() {
    let population = 0;
    try {
      if (services.inhabitants && typeof services.inhabitants.countInhabitants === 'function') population = Number(await services.inhabitants.countInhabitants()) || 0;
    } catch (_) {}
    return decreeQuorum(population);
  }

  async function listDecrees(filter = {}) {
    const [decrees, votes, minVoters] = await Promise.all([readDecrees(), voteIndex(), currentQuorum()]);
    return decrees
      .filter(d => (!filter.house || d.house === filter.house) && (!filter.period || d.period === filter.period))
      .map(d => {
        const vote = votes.get(d.voteId) || null;
        return {
          ...d,
          vote,
          minVoters,
          yes: Number(vote && vote.votes && vote.votes.YES) || 0,
          no: Number(vote && vote.votes && vote.votes.NO) || 0,
          voters: Number(vote && vote.totalVotes) || 0,
          outcome: decreeOutcome(d, vote, minVoters)
        };
      });
  }

  async function decreeStatus(now = new Date()) {
    const client = await openSsb();
    const w = getCycleWindow(now);
    const myHouse = await getUserHouse(client.id).catch(() => null);
    const period = getGoverningPeriodId(now);
    const used = (await readDecrees()).filter(d => d.period === period).length;
    const lateness = w.end.getTime() - now.getTime() < DECREE_VOTE_MS;
    const reason = myHouse !== w.houseKey ? 'not-governing' : used >= DECREES_PER_CYCLE ? 'limit' : lateness ? 'late' : null;
    return { allowed: !reason, reason, house: w.houseKey, period, used, left: Math.max(0, DECREES_PER_CYCLE - used) };
  }

  async function proposeDecree({ title, description = '' } = {}, now = new Date()) {
    const cleanTitle = String(title || '').trim().slice(0, DECREE_TITLE_MAX);
    if (!cleanTitle) return { ok: false, reason: 'title' };
    const status = await decreeStatus(now);
    if (!status.allowed) return { ok: false, reason: status.reason };
    if (!services.votes || typeof services.votes.createVote !== 'function') return { ok: false, reason: 'votes' };
    const deadline = new Date(now.getTime() + DECREE_VOTE_MS).toISOString();
    const vote = await services.votes.createVote(cleanTitle, deadline, ['YES', 'NO', 'ABSTENTION'], ['decree', status.house]);
    const voteId = vote && (vote.key || vote.id);
    if (!voteId) return { ok: false, reason: 'votes' };
    const client = await openSsb();
    const msg = await new Promise((resolve, reject) => client.publish({
      type: DECREE_TYPE,
      house: status.house,
      period: status.period,
      title: cleanTitle,
      description: String(description || '').trim().slice(0, DECREE_TEXT_MAX),
      voteId,
      deadline,
      createdAt: now.toISOString()
    }, (err, m) => err ? reject(err) : resolve(m)));
    return { ok: true, id: msg && msg.key, voteId, house: status.house };
  }

  let settling = false;
  async function settleMyDecrees() {
    if (settling) return [];
    settling = true;
    const settled = [];
    try {
      const client = await openSsb();
      const publish = (c) => new Promise((resolve, reject) => client.publish(c, (err, m) => err ? reject(err) : resolve(m)));
      for (const d of await listDecrees()) {
        if (d.author !== client.id || d.status !== 'OPEN' || d.outcome === 'OPEN') continue;
        if (d.outcome === 'APPROVED') {
          const law = await publish({
            type: 'parliamentLaw',
            question: d.title,
            description: d.description,
            method: 'LARP',
            proposer: client.id,
            termId: null,
            voteId: d.voteId,
            votes: { YES: d.yes, NO: d.no, ABSTENTION: Number(d.vote && d.vote.votes && d.vote.votes.ABSTENTION) || 0, total: d.voters },
            proposedAt: d.createdAt,
            proposalId: d.id,
            enactedAt: new Date().toISOString(),
            origin: { larp: d.house }
          });
          await publish({ type: DECREE_TYPE, replaces: d.id, status: 'ENACTED', lawId: law && law.key, settledAt: new Date().toISOString() });
          settled.push({ ...d, status: 'ENACTED' });
        } else {
          await publish({ type: DECREE_TYPE, replaces: d.id, status: 'REJECTED', settledAt: new Date().toISOString() });
          settled.push({ ...d, status: 'REJECTED' });
        }
      }
    } finally {
      settling = false;
    }
    return settled;
  }

  async function decreeForLaw(law, lawAuthor) {
    if (!law || !law.origin || !RULING_KEYS.includes(law.origin.larp)) return null;
    const d = (await listDecrees()).find(x => x.id === law.proposalId);
    if (!d || d.author !== lawAuthor || d.house !== law.origin.larp || d.voteId !== law.voteId) return null;
    if (d.vote && !(d.yes > d.no)) return null;
    return d;
  }

  async function seasonInfluence(now = new Date()) {
    const w = getCycleWindow(now);
    const [decrees, houseAt] = await Promise.all([listDecrees(), houseTimeline()]);
    return influenceOf(decrees, houseAt, { start: w.seasonStart, end: w.seasonEnd });
  }

  async function solsticeHouse(now = new Date()) {
    const current = getCycleWindow(now);
    const previous = getCycleWindow(new Date(current.seasonStart.getTime() - 1));
    const [decrees, houseAt] = await Promise.all([listDecrees(), houseTimeline()]);
    const winner = winnerOf(influenceOf(decrees, houseAt, { start: previous.seasonStart, end: previous.seasonEnd }));
    return winner ? { ...winner, season: previous.seasonStart.toISOString(), until: current.seasonEnd } : null;
  }

  async function chooseHouse(houseKey) {
    if (!VALID_KEY(houseKey) || houseKey === 'academia') return { ok: false, reason: 'invalid' };
    const client = await openSsb();
    const current = await getUserHouse(client.id).catch(() => null);
    if (current !== 'academia') return { ok: false, reason: 'not-in-academia' };
    const can = await canTakeTest(client.id);
    if (!can.allowed) return { ok: false, reason: 'cooldown', nextAt: can.nextAt };
    await new Promise((resolve, reject) => {
      client.publish({
        type: 'larpTestAttempt',
        house: houseKey,
        passed: true,
        chosen: true,
        attemptedAt: new Date().toISOString()
      }, (err) => err ? reject(err) : resolve());
    });
    await publishJoin(houseKey);
    return { ok: true, house: houseKey };
  }

  async function issueAutoInvitesForMyHouse() {
    if (!tribesModel) return;
    const client = await openSsb();
    const me = client.id;
    const myHouse = await getUserHouse(me).catch(() => null);
    if (!VALID_KEY(myHouse) || myHouse === 'academia') return;
    const anchor = await findEarliestHouseAnchor(myHouse).catch(() => null);
    if (!anchor) return;
    let canonicalTribe;
    try { canonicalTribe = await tribesModel.getTribeById(anchor.tribeRootId); } catch (_) { return; }
    if (!canonicalTribe) return;
    const tribeMembers = Array.isArray(canonicalTribe.members) ? canonicalTribe.members : [];
    if (!tribeMembers.includes(me)) return;
    const houseMembers = await getMembersOfHouse(myHouse).catch(() => []);
    const missing = houseMembers.filter(id => id && id !== me && !tribeMembers.includes(id));
    if (!missing.length) return;
    const sent = await listMyAutoInviteRecipients(myHouse, anchor.tribeRootId).catch(() => new Set());
    for (const newMember of missing) {
      if (sent.has(newMember)) continue;
      try {
        const code = await tribesModel.generateInvite(canonicalTribe.id);
        await new Promise((resolve) => {
          client.publish({
            type: 'larpAutoInvite',
            house: myHouse,
            tribeRootId: anchor.tribeRootId,
            to: newMember,
            code,
            sentAt: new Date().toISOString(),
            recps: [newMember, me]
          }, () => resolve());
        });
      } catch (_) {}
    }
  }

  async function listMyAutoInviteRecipients(houseKey, tribeRootId) {
    const client = await openSsb();
    const me = client.id;
    const ssbKeys = require('../server/node_modules/ssb-keys');
    const config = require('../server/ssb_config');
    return new Promise((resolve) => {
      const out = new Set();
      pull(
        client.createUserStream({ id: me }),
        pull.drain((m) => {
          const c = m && m.value && m.value.content;
          if (typeof c !== 'string' || !c.endsWith('.box')) return;
          let decoded;
          try { decoded = ssbKeys.unbox(c, config.keys); } catch (_) { return; }
          if (!decoded) return;
          if (typeof decoded === 'string') {
            try { decoded = JSON.parse(decoded); } catch (_) { return; }
          }
          if (!decoded || decoded.type !== 'larpAutoInvite') return;
          if (decoded.house !== houseKey) return;
          if (decoded.tribeRootId !== tribeRootId) return;
          if (typeof decoded.to === 'string' && decoded.to !== me) out.add(decoded.to);
        }, () => resolve(out))
      );
    });
  }

  async function alreadyInCanonical(houseKey) {
    if (!VALID_KEY(houseKey)) return false;
    const anchor = await findEarliestHouseAnchor(houseKey).catch(() => null);
    if (!anchor) return false;
    try {
      const canonical = await tribesModel.getTribeById(anchor.tribeRootId);
      const client = await openSsb();
      return !!(canonical && Array.isArray(canonical.members) && canonical.members.includes(client.id));
    } catch (_) { return false; }
  }

  async function redeemPendingAutoInvites() {
    if (!tribesModel) return;
    const client = await openSsb();
    const me = client.id;
    const myHouse = await getUserHouse(me).catch(() => null);
    if (!VALID_KEY(myHouse) || myHouse === 'academia') return;
    if (await alreadyInCanonical(myHouse)) return;
    const ssbKeys = require('../server/node_modules/ssb-keys');
    const config = require('../server/ssb_config');
    const codes = [];
    const sealedOnly = client.private && typeof client.private.read === 'function';
    await new Promise((resolve) => {
      pull(
        sealedOnly ? client.private.read({ reverse: true }) : client.createLogStream({ reverse: true, limit: 2000 }),
        pull.drain((m) => {
          const c = m && m.value && m.value.content;
          let decoded;
          if (typeof c === 'string') {
            if (!c.endsWith('.box')) return;
            try { decoded = ssbKeys.unbox(c, config.keys); } catch (_) { return; }
          } else {
            if (!m.value.private) return;
            decoded = c;
          }
          if (!decoded) return;
          if (typeof decoded === 'string') {
            try { decoded = JSON.parse(decoded); } catch (_) { return; }
          }
          if (!decoded || decoded.type !== 'larpAutoInvite') return;
          if (!VALID_KEY(decoded.house) || typeof decoded.code !== 'string') return;
          if (decoded.house !== myHouse) return;
          if (m.value.author === me) return;
          codes.push(decoded.code);
        }, () => resolve())
      );
    });
    for (const code of codes) {
      try { await tribesModel.joinByInvite(code); } catch (_) {}
    }
  }

  let liveSubscriberStarted = false;
  let initRan = false;
  let processingChain = Promise.resolve();

  function enqueue(fn) {
    processingChain = processingChain.then(fn).catch(() => {});
    return processingChain;
  }

  async function runCatchup() {
    try {
      const client = await openSsb();
      const me = client.id;
      const myHouse = await getUserHouse(me).catch(() => null);
      if (VALID_KEY(myHouse)) {
        await ensureHouseTribe(myHouse).catch(() => {});
      }
      await redeemPendingAutoInvites().catch(() => {});
      await issueAutoInvitesForMyHouse().catch(() => {});
    } catch (_) {}
  }

  async function handleLiveMessage(m) {
    const c = m && m.value && m.value.content;
    if (!c) return;
    const client = await openSsb();
    const me = client.id;
    const ssbKeys = require('../server/node_modules/ssb-keys');
    const config = require('../server/ssb_config');
    try {
      if (typeof c === 'object' && c.type === 'larpJoinHouse' && VALID_KEY(c.house)) {
        if (m.value.author === me) return;
        const myHouse = await getUserHouse(me).catch(() => null);
        if (myHouse !== c.house) return;
        await issueAutoInvitesForMyHouse().catch(() => {});
        return;
      }
      if (typeof c === 'object' && c.type === 'tribe' && Array.isArray(c.tags) && c.tags.includes(houseTribeTag('academia'))) {
        if (m.value.author === me) return;
        const myHouse = await getUserHouse(me).catch(() => null);
        if (myHouse !== 'academia') return;
        await ensureHouseTribe('academia').catch(() => {});
        return;
      }
      if (typeof c === 'object' && c.type === 'larpHouseTribeAnchor' && VALID_KEY(c.house)) {
        if (m.value.author === me) return;
        const myHouse = await getUserHouse(me).catch(() => null);
        if (myHouse !== c.house) return;
        await ensureHouseTribe(c.house).catch(() => {});
        await redeemPendingAutoInvites().catch(() => {});
        await issueAutoInvitesForMyHouse().catch(() => {});
        return;
      }
      if (typeof c === 'object' && c.type === 'larpHouseTribeAnchorTombstone' && VALID_KEY(c.house)) {
        if (m.value.author === me) return;
        const myHouse = await getUserHouse(me).catch(() => null);
        if (myHouse !== c.house) return;
        await ensureHouseTribe(c.house).catch(() => {});
        await redeemPendingAutoInvites().catch(() => {});
        return;
      }
      if (typeof c === 'string' && c.endsWith('.box')) {
        if (m.value.author === me) return;
        let decoded;
        try { decoded = ssbKeys.unbox(c, config.keys); } catch (_) { return; }
        if (!decoded) return;
        if (typeof decoded === 'string') {
          try { decoded = JSON.parse(decoded); } catch (_) { return; }
        }
        if (!decoded || decoded.type !== 'larpAutoInvite') return;
        if (!VALID_KEY(decoded.house) || typeof decoded.code !== 'string') return;
        const myHouse = await getUserHouse(me).catch(() => null);
        if (decoded.house !== myHouse) return;
        if (await alreadyInCanonical(myHouse)) return;
        try { await tribesModel.joinByInvite(decoded.code); } catch (_) {}
      }
    } catch (_) {}
  }

  async function init() {
    if (initRan) return;
    initRan = true;
    if (!liveSubscriberStarted) {
      liveSubscriberStarted = true;
      try {
        const client = await openSsb();
        pull(
          client.createLogStream({ live: true, old: false }),
          pull.drain((m) => { enqueue(() => handleLiveMessage(m)); }, () => { liveSubscriberStarted = false; })
        );
      } catch (_) { liveSubscriberStarted = false; }
    }
    enqueue(runCatchup);
  }

  async function createHouseInvite(houseKey) {
    if (!VALID_KEY(houseKey)) throw new Error('Invalid house key');
    if (houseKey === 'academia') throw new Error('ACADEMIA does not issue invites');
    const client = await openSsb();
    const myHouse = await getUserHouse(client.id);
    if (myHouse !== houseKey) throw new Error('Only members can issue invites');
    const tribe = await ensureHouseTribe(houseKey);
    if (!tribe) throw new Error('Could not resolve house tribe');
    if (!tribesModel) throw new Error('tribesModel unavailable');
    const code = await tribesModel.generateInvite(tribe.id);
    return { code, house: houseKey, tribeId: tribe.id };
  }

  async function redeemHouseInvite(rawCode) {
    const code = String(rawCode || '').trim();
    if (!code) return { ok: false };
    if (!tribesModel) return { ok: false };
    const client = await openSsb();
    const myHouse = await getUserHouse(client.id);
    if (myHouse && myHouse !== 'academia') return { ok: false };
    let rootId;
    try { rootId = await tribesModel.joinByInvite(code); } catch (_) { return { ok: false }; }
    if (!rootId) return { ok: false };
    let tribe = null;
    try { tribe = await tribesModel.getTribeById(rootId); } catch (_) { tribe = null; }
    const tags = (tribe && Array.isArray(tribe.tags)) ? tribe.tags : [];
    const houseTag = tags.find(t => typeof t === 'string' && t.startsWith('larp-'));
    if (!houseTag) return { ok: false };
    const suffix = houseTag.slice('larp-'.length);
    const houseKey = HOUSE_KEYS.find(k => (HOUSES[k] && HOUSES[k].name === suffix) || k === suffix);
    if (!houseKey || houseKey === 'academia') return { ok: false };
    await publishJoin(houseKey);
    return { ok: true, house: houseKey, tribeId: rootId };
  }

  return {
    HOUSES,
    HOUSE_KEYS,
    wallIsPublic,
    TEST_COOLDOWN_MS,
    TEST_QUESTIONS_COUNT,
    PROFILE_QUESTIONS,
    RULING_KEYS,
    DECREES_PER_CYCLE,
    attach,
    decreeQuorum,
    decreeOutcome,
    influenceOf,
    winnerOf,
    listDecrees,
    decreeStatus,
    proposeDecree,
    settleMyDecrees,
    decreeForLaw,
    seasonInfluence,
    solsticeHouse,
    houseTimeline,
    computeCycle,
    getCycleWindow,
    nextRulingStart,
    cyclesUntilRuling,
    getGoverningHouseKey,
    getGoverningPeriodId,
    chooseHouse,
    publishJoin,
    publishLeaveLarp,
    getUserHouse,
    listAllMemberships,
    listHousesWithCounts,
    getMembersOfHouse,
    publishHousePost,
    listHousePosts,
    getLastTestAttempt,
    canTakeTest,
    getProfileTest,
    scoreProfileAnswers,
    submitProfileTest,
    createHouseInvite,
    redeemHouseInvite,
    findMyHouseTribe,
    houseTribeReady,
    ensureHouseTribe,
    leaveMyHouseTribe,
    issueAutoInvitesForMyHouse,
    redeemPendingAutoInvites,
    init,
    getHouse: (key) => HOUSES[key] || null
  };
};

module.exports.larpDate = (d) => computeCycle(new Date(d)).formatted;
