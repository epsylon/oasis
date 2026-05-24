const pull = require('../server/node_modules/pull-stream');
const fs = require('fs');
const path = require('path');

const HOUSES_PATH = path.join(__dirname, '..', 'client', 'assets', 'larp', 'houses.json');
let HOUSES = {};
try { HOUSES = JSON.parse(fs.readFileSync(HOUSES_PATH, 'utf8')); } catch (_) { HOUSES = {}; }

const HOUSE_KEYS = ['academia','solaris','arrakis','terraverde','unsystem','dogma','helix','quark','hermandad'];
const VALID_KEY = (k) => HOUSE_KEYS.includes(String(k || '').toLowerCase());

const TEST_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

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

function computeCycle(now = new Date()) {
  const year = now.getFullYear();
  const monthIdx = now.getMonth();
  const start = new Date(year, 0, 1);
  const dayOfYear = Math.floor((now - start) / 86400000) + 1;
  const summerSolstice = new Date(year, 5, 21);
  const winterSolstice = new Date(year, 11, 21);
  const solsticeNum = now < summerSolstice ? 1 : (now < winterSolstice ? 2 : 1);
  const houseKey = HOUSE_KEYS[monthIdx % HOUSE_KEYS.length];
  const house = HOUSES[houseKey] || { short: houseKey.slice(0, 3), name: houseKey };
  const solarAge = year + SOLAR_AGE_OFFSET;
  const houseCycle = Math.floor(year - 2026 + 1);
  return {
    day: dayOfYear,
    solstice: solsticeNum,
    age: solarAge,
    houseKey,
    houseShort: house.short || houseKey.slice(0, 3),
    cycle: houseCycle,
    formatted: `${dayOfYear}.${solsticeNum}.${solarAge}.${house.short || houseKey.slice(0, 3)}.${houseCycle}`
  };
}

function getGoverningHouseKey(now = new Date()) {
  return HOUSE_KEYS[now.getMonth() % HOUSE_KEYS.length];
}

module.exports = ({ cooler, tribesModel }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

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
    candidates.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    return candidates[0];
  }

  async function ensureHouseTribe(houseKey) {
    if (!tribesModel || !VALID_KEY(houseKey)) return null;
    const existing = await findMyHouseTribe(houseKey);
    if (existing) return existing;
    const house = HOUSES[houseKey] || {};
    const tag = houseTribeTag(houseKey);
    const title = house.name || houseKey;
    const description = house.description || '';
    const image = house.image || null;
    const isAcademia = houseKey === 'academia';
    const isAnonymous = !isAcademia;
    const status = isAcademia ? 'PUBLIC' : 'PRIVATE';
    const inviteMode = 'open';
    try {
      await tribesModel.createTribe(title, description, image, '', [tag], isAnonymous, inviteMode, null, status, '');
    } catch (_) {}
    return await findMyHouseTribe(houseKey);
  }

  async function leaveMyHouseTribe(houseKey) {
    if (!tribesModel) return;
    const tribe = await findMyHouseTribe(houseKey);
    if (!tribe) return;
    try { await tribesModel.leaveTribe(tribe.id, { force: true }); } catch (_) {}
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
    if (previousHouse && previousHouse !== houseKey) {
      await leaveMyHouseTribe(previousHouse).catch(() => {});
    }
    await ensureHouseTribe(houseKey).catch(() => {});
  }

  async function getUserHouse(feedId) {
    const client = await openSsb();
    const target = feedId || client.id;
    return new Promise((resolve) => {
      let latest = null;
      let latestTs = 0;
      pull(
        client.createUserStream({ id: target, reverse: true }),
        pull.drain((m) => {
          const c = m && m.value && m.value.content;
          if (!c) return;
          const ts = m.value.timestamp || 0;
          if (c.type === 'larpJoinHouse' && VALID_KEY(c.house)) {
            if (ts > latestTs) { latestTs = ts; latest = c.house; }
          } else if (c.type === 'larpLeaveLarp') {
            if (ts > latestTs) { latestTs = ts; latest = null; }
          }
        }, () => resolve(latest))
      );
    });
  }

  async function listAllMemberships() {
    const client = await openSsb();
    return new Promise((resolve) => {
      const byAuthor = new Map();
      pull(
        client.createLogStream({ reverse: true }),
        pull.drain((m) => {
          const author = m && m.value && m.value.author;
          if (!author) return;
          const c = m.value.content;
          if (!c) return;
          const ts = m.value.timestamp || 0;
          if (c.type === 'larpJoinHouse' && VALID_KEY(c.house)) {
            const prev = byAuthor.get(author);
            if (!prev || ts > prev.ts) byAuthor.set(author, { house: c.house, ts });
          } else if (c.type === 'larpLeaveLarp') {
            const prev = byAuthor.get(author);
            if (!prev || ts > prev.ts) byAuthor.set(author, { house: null, ts });
          }
        }, () => {
          const result = new Map();
          for (const [a, v] of byAuthor.entries()) {
            if (v.house) result.set(a, v.house);
          }
          resolve(result);
        })
      );
    });
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

  async function listHousePosts(houseKey, { viewerHouse = null, isGoverning = false } = {}) {
    if (!VALID_KEY(houseKey)) return [];
    const viewerIsMember = viewerHouse === houseKey;
    if (!viewerIsMember && !isGoverning) return [];
    const client = await openSsb();
    const memberships = await listAllMemberships();
    return new Promise((resolve) => {
      const posts = [];
      pull(
        client.createLogStream({ reverse: true }),
        pull.drain((m) => {
          const c = m && m.value && m.value.content;
          if (!c || c.type !== 'larpHousePost') return;
          if (c.house !== houseKey) return;
          const author = m.value.author;
          const memberHouse = memberships.get(author) || 'academia';
          if (memberHouse !== houseKey) return;
          posts.push({
            id: m.key,
            author,
            text: String(c.text || ''),
            createdAt: c.createdAt || new Date(m.value.timestamp || 0).toISOString(),
            ts: m.value.timestamp || 0
          });
        }, () => {
          posts.sort((a, b) => b.ts - a.ts);
          resolve(posts);
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
    TEST_COOLDOWN_MS,
    TEST_QUESTIONS_COUNT,
    PROFILE_QUESTIONS,
    computeCycle,
    getGoverningHouseKey,
    publishJoin,
    publishLeaveLarp,
    getUserHouse,
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
    ensureHouseTribe,
    leaveMyHouseTribe,
    getHouse: (key) => HOUSES[key] || null
  };
};
