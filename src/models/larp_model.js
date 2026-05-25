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

module.exports = ({ cooler, tribesModel, tribeCrypto }) => {
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

  async function findEarliestHouseAnchor(houseKey) {
    if (!VALID_KEY(houseKey)) return null;
    const client = await openSsb();
    return new Promise((resolve) => {
      const anchors = [];
      const tombstones = [];
      pull(
        client.createLogStream(),
        pull.drain((m) => {
          const c = m && m.value && m.value.content;
          if (!c) return;
          if (c.type === 'larpHouseTribeAnchor') {
            if (c.house !== houseKey) return;
            if (typeof c.tribeRootId !== 'string') return;
            const tribeTs = Number(Date.parse(c.tribeCreatedAt || '')) || m.value.timestamp || 0;
            anchors.push({ tribeRootId: c.tribeRootId, anchorAuthor: m.value.author, tribeTs });
          } else if (c.type === 'larpHouseTribeAnchorTombstone') {
            if (c.house !== houseKey) return;
            if (typeof c.tribeRootId !== 'string') return;
            tombstones.push({ tribeRootId: c.tribeRootId, tombstoneAuthor: m.value.author });
          }
        }, () => {
          const validKills = new Set();
          for (const t of tombstones) {
            const a = anchors.find(x => x.tribeRootId === t.tribeRootId);
            if (a && a.anchorAuthor === t.tombstoneAuthor) validKills.add(t.tribeRootId);
          }
          const live = anchors.filter(a => !validKills.has(a.tribeRootId));
          if (!live.length) return resolve(null);
          live.sort((a, b) => a.tribeTs - b.tribeTs);
          const first = live[0];
          resolve({ tribeRootId: first.tribeRootId, author: first.anchorAuthor, tribeTs: first.tribeTs });
        })
      );
    });
  }

  async function findHouseAnchorByTribe(houseKey, tribeRootId) {
    if (!VALID_KEY(houseKey) || !tribeRootId) return null;
    const client = await openSsb();
    return new Promise((resolve) => {
      let hit = null;
      pull(
        client.createLogStream(),
        pull.drain((m) => {
          if (hit) return;
          const c = m && m.value && m.value.content;
          if (!c || c.type !== 'larpHouseTribeAnchor') return;
          if (c.house !== houseKey) return;
          if (c.tribeRootId !== tribeRootId) return;
          hit = { author: m.value.author, ts: m.value.timestamp || 0 };
        }, () => resolve(hit))
      );
    });
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
    if (tribeCrypto && typeof tribeCrypto.dropKey === 'function') {
      try { tribeCrypto.dropKey(rootId); } catch (_) {}
    }
  }

  async function ensureHouseTribe(houseKey) {
    if (!tribesModel || !VALID_KEY(houseKey)) return null;
    const client = await openSsb();
    const me = client.id;

    if (houseKey === 'academia') {
      const existing = await findMyHouseTribe(houseKey);
      if (existing) return existing;
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

    if (anchor) return null;

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
        if (tribeCrypto && typeof tribeCrypto.dropKey === 'function') {
          try { tribeCrypto.dropKey(t.rootId); } catch (_) {}
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
    await new Promise((resolve) => {
      pull(
        client.createLogStream({ reverse: true, limit: 2000 }),
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
    issueAutoInvitesForMyHouse,
    redeemPendingAutoInvites,
    init,
    getHouse: (key) => HOUSES[key] || null
  };
};
