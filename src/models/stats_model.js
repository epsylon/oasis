const pull = require('../server/node_modules/pull-stream');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const STORAGE_DIR = path.join(__dirname, "..", "configs");
const ADDR_FILE = path.join(STORAGE_DIR, "wallet_addresses.json");

function readAddrMap() {
  try {
    if (!fs.existsSync(ADDR_FILE)) return {};
    const raw = fs.readFileSync(ADDR_FILE, 'utf8');
    const obj = JSON.parse(raw || '{}');
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

const listPubsFromEbt = () => {
  try {
    const ebtDir = path.join(os.homedir(), '.ssb', 'ebt');
    const files = fs.readdirSync(ebtDir);
    return files.filter(f => f.endsWith('.ed25519'));
  } catch {
    return [];
  }
};

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const types = [
    'bookmark','event','task','votes','report','feed','project',
    'image','audio','video','document','transfer','post','tribe',
    'market','forum','job','aiExchange',
    'parliamentCandidature','parliamentTerm','parliamentProposal','parliamentRevocation','parliamentLaw',
    'courtsCase','courtsEvidence','courtsAnswer','courtsVerdict','courtsSettlement','courtsSettlementProposal','courtsSettlementAccepted','courtsNomination','courtsNominationVote'
  ];

  const getFolderSize = (folderPath) => {
    const files = fs.readdirSync(folderPath);
    let totalSize = 0;
    for (const file of files) {
      const filePath = `${folderPath}/${file}`;
      const st = fs.statSync(filePath);
      totalSize += st.isDirectory() ? getFolderSize(filePath) : st.size;
    }
    return totalSize;
  };

  const formatSize = (sizeInBytes) => {
    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    const kb = 1024, mb = kb * 1024, gb = mb * 1024, tb = gb * 1024;
    if (sizeInBytes < mb) return `${(sizeInBytes / kb).toFixed(2)} KB`;
    if (sizeInBytes < gb) return `${(sizeInBytes / mb).toFixed(2)} MB`;
    if (sizeInBytes < tb) return `${(sizeInBytes / gb).toFixed(2)} GB`;
    return `${(sizeInBytes / tb).toFixed(2)} TB`;
  };

  const N = s => String(s || '').toUpperCase();
  const sum = arr => arr.reduce((a, b) => a + b, 0);
  const median = arr => {
    if (!arr.length) return 0;
    const a = [...arr].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };

  const parseAuctionMax = auctions_poll => {
    if (!Array.isArray(auctions_poll) || auctions_poll.length === 0) return 0;
    const amounts = auctions_poll.map(s => {
      const parts = String(s).split(':');
      const amt = parseFloat(parts[1]);
      return isNaN(amt) ? 0 : amt;
    });
    return amounts.length ? Math.max(...amounts) : 0;
  };

  const dayKey = ts => new Date(ts || 0).toISOString().slice(0, 10);
  const lastNDays = (n) => {
    const out = [];
    const today = new Date();
    today.setUTCHours(0,0,0,0);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  };

  const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const bestContentTs = (c, fallbackTs = 0) =>
    Number(c?.updatedAt ? Date.parse(c.updatedAt) : 0) ||
    Number(c?.createdAt ? Date.parse(c.createdAt) : 0) ||
    Number(c?.timestamp || 0) ||
    Number(fallbackTs || 0);
  const dedupeTribesNodes = (nodes = []) => {
    const pick = new Map();
    for (const n of nodes) {
      const c = n?.content || {};
      const title = c.title || c.name || '';
      const author = n?.author || '';
      const key = `${norm(title)}::${author}`;
      const ts = bestContentTs(c, n?.ts || 0);
      const prev = pick.get(key);
      if (!prev || ts > prev._ts) pick.set(key, { ...n, _ts: ts });
    }
    return Array.from(pick.values());
  };

  const getStats = async (filter = 'ALL') => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;

    const messages = await new Promise((res, rej) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit, reverse: true }),
        pull.collect((err, msgs) => err ? rej(err) : res(msgs))
      );
    });

    const allMsgs = messages.filter(m => m.value?.content);
    const tombTargets = new Set(
      allMsgs
        .filter(m => m.value.content.type === 'tombstone' && m.value.content.target)
        .map(m => m.value.content.target)
    );

    const scopedMsgs = filter === 'MINE' ? allMsgs.filter(m => m.value.author === userId) : allMsgs;

    const byType = {};
    const parentOf = {};
    for (const t of types) {
      byType[t] = new Map();
      parentOf[t] = new Map();
    }

    for (const m of scopedMsgs) {
      const k = m.key;
      const c = m.value.content;
      theType = c.type;
      if (!types.includes(theType)) continue;
      byType[theType].set(k, { key: k, ts: m.value.timestamp, content: c, author: m.value.author });
      if (c.replaces) parentOf[theType].set(k, c.replaces);
    }

    const findRoot = (t, id) => {
      let cur = id;
      const pMap = parentOf[t];
      while (pMap.has(cur)) cur = pMap.get(cur);
      return cur;
    };

    const tipOf = {};
    for (const t of types) {
      tipOf[t] = new Map();
      const pMap = parentOf[t];
      const fwd = new Map();
      for (const [child, parent] of pMap.entries()) fwd.set(parent, child);
      const allMap = byType[t];
      const roots = new Set(Array.from(allMap.keys()).map(id => findRoot(t, id)));
      for (const root of roots) {
        let tip = root;
        while (fwd.has(tip)) tip = fwd.get(tip);
        if (tombTargets.has(tip)) continue;
        const node = allMap.get(tip) || allMap.get(root);
        if (node) tipOf[t].set(root, node);
      }
    }

    const tribeTipNodes = Array.from(tipOf['tribe'].values());
    const tribeDedupNodes = dedupeTribesNodes(tribeTipNodes);
    const tribeDedupContents = tribeDedupNodes.map(n => n.content);

    const tribePublic = tribeDedupContents.filter(c => c.isAnonymous === false);
    const tribePrivate = tribeDedupContents.filter(c => c.isAnonymous !== false);
    const tribePublicNames = tribePublic.map(c => c.name || c.title || c.id).filter(Boolean);
    const tribePublicCount = tribePublicNames.length;
    const tribePrivateCount = tribePrivate.length;

    const allTribesPublic = tribeDedupNodes
      .filter(n => n.content?.isAnonymous === false)
      .map(n => ({ id: n.key, name: n.content.name || n.content.title || n.key }));

    const allTribes = allTribesPublic.map(t => t.name);

    const memberTribesDetailed = tribeDedupNodes
      .filter(n => Array.isArray(n.content?.members) && n.content.members.includes(userId))
      .map(n => ({ id: n.key, name: n.content.name || n.content.title || n.key }));

    const myPrivateTribesDetailed = tribeDedupNodes
      .filter(n => n.content?.isAnonymous !== false && Array.isArray(n.content?.members) && n.content.members.includes(userId))
      .map(n => ({ id: n.key, name: n.content.name || n.content.title || n.key }));

    const content = {};
    const opinions = {};
    for (const t of types) {
      let vals;
      if (t === 'tribe') {
        vals = tribeDedupContents;
      } else {
        vals = Array.from(tipOf[t].values()).map(v => v.content);
        if (t === 'forum') vals = vals.filter(c => !(c.root && tombTargets.has(c.root)));
      }
      content[t] = vals.length || 0;
      opinions[t] = vals.filter(e => Array.isArray(e.opinions_inhabitants) && e.opinions_inhabitants.length > 0).length || 0;
    }

    const karmaMsgsAll = allMsgs.filter(m => m.value?.content?.type === 'karmaScore' && Number.isFinite(Number(m.value.content.karmaScore)));
    if (filter === 'MINE') {
      const mine = karmaMsgsAll.filter(m => m.value.author === userId).sort((a, b) => (b.value.timestamp || 0) - (a.value.timestamp || 0));
      const myKarma = mine.length ? Number(mine[0].value.content.karmaScore) || 0 : 0;
      content['karmaScore'] = myKarma;
    } else {
      const latestByAuthor = new Map();
      for (const m of karmaMsgsAll) {
        const a = m.value.author;
        const ts = m.value.timestamp || 0;
        const k = Number(m.value.content.karmaScore) || 0;
        const prev = latestByAuthor.get(a);
        if (!prev || ts > prev.ts) latestByAuthor.set(a, { ts, k });
      }
      const sumKarma = Array.from(latestByAuthor.values()).reduce((s, x) => s + x.k, 0);
      content['karmaScore'] = sumKarma;
    }

    const inhabitants = new Set(allMsgs.map(m => m.value.author)).size;

    const secretStat = fs.statSync(`${os.homedir()}/.ssb/secret`);
    const createdAt = secretStat.birthtime.toLocaleString();

    const folderSize = getFolderSize(`${os.homedir()}/.ssb`);
    const flumeSize = getFolderSize(`${os.homedir()}/.ssb/flume`);
    const blobsSize = getFolderSize(`${os.homedir()}/.ssb/blobs`);

    const allTs = scopedMsgs.map(m => m.value.timestamp || 0).filter(Boolean);
    const lastTs = allTs.length ? Math.max(...allTs) : 0;

    const mapDay = new Map();
    for (const m of scopedMsgs) {
      const dk = dayKey(m.value.timestamp || 0);
      mapDay.set(dk, (mapDay.get(dk) || 0) + 1);
    }
    const days7 = lastNDays(7).map(d => ({ day: d, count: mapDay.get(d) || 0 }));
    const days30 = lastNDays(30).map(d => ({ day: d, count: mapDay.get(d) || 0 }));
    const daily7Total = sum(days7.map(o => o.count));
    const daily30Total = sum(days30.map(o => o.count));

    const jobsVals = Array.from(tipOf['job'].values()).map(v => v.content);
    const jobOpen = jobsVals.filter(j => N(j.status) === 'OPEN').length;
    const jobClosed = jobsVals.filter(j => N(j.status) === 'CLOSED').length;
    const jobSalaries = jobsVals.map(j => parseFloat(j.salary)).filter(n => isFinite(n));
    const jobVacantsOpen = jobsVals.filter(j => N(j.status) === 'OPEN').map(j => parseInt(j.vacants || 0, 10) || 0);
    const jobSubsTotal = jobsVals.map(j => Array.isArray(j.subscribers) ? j.subscribers.length : 0);

    const marketVals = Array.from(tipOf['market'].values()).map(v => v.content);
    const mkForSale = marketVals.filter(m => N(m.status) === 'FOR SALE').length;
    const mkReserved = marketVals.filter(m => N(m.status) === 'RESERVED').length;
    const mkClosed = marketVals.filter(m => N(m.status) === 'CLOSED').length;
    const mkSold = marketVals.filter(m => N(m.status) === 'SOLD').length;
    let revenueECO = 0;
    const soldPrices = [];
    for (const m of marketVals) {
      if (N(m.status) !== 'SOLD') continue;
      let price = 0;
      if (String(m.item_type || '').toLowerCase() === 'auction') {
        price = parseAuctionMax(m.auctions_poll);
      } else {
        price = parseFloat(m.price || 0) || 0;
      }
      soldPrices.push(price);
      revenueECO += price;
    }

    const projectVals = Array.from(tipOf['project'].values()).map(v => v.content);
    const prActive = projectVals.filter(p => N(p.status) === 'ACTIVE').length;
    const prCompleted = projectVals.filter(p => N(p.status) === 'COMPLETED').length;
    const prPaused = projectVals.filter(p => N(p.status) === 'PAUSED').length;
    const prCancelled = projectVals.filter(p => N(p.status) === 'CANCELLED').length;
    const prGoals = projectVals.map(p => parseFloat(p.goal || 0) || 0);
    const prPledged = projectVals.map(p => parseFloat(p.pledged || 0) || 0);
    const prProgress = projectVals.map(p => parseFloat(p.progress || 0) || 0);
    const activeFundingRates = projectVals
      .filter(p => N(p.status) === 'ACTIVE' && parseFloat(p.goal || 0) > 0)
      .map(p => (parseFloat(p.pledged || 0) / parseFloat(p.goal || 1)) * 100);

    const projectsKPIs = {
      total: projectVals.length,
      active: prActive,
      completed: prCompleted,
      paused: prPaused,
      cancelled: prCancelled,
      ecoGoalTotal: sum(prGoals),
      ecoPledgedTotal: sum(prPledged),
      successRate: projectVals.length ? (prCompleted / projectVals.length) * 100 : 0,
      avgProgress: prProgress.length ? (sum(prProgress) / prProgress.length) : 0,
      medianProgress: median(prProgress),
      activeFundingAvg: activeFundingRates.length ? (sum(activeFundingRates) / activeFundingRates.length) : 0
    };

    const topAuthorsMap = new Map();
    for (const m of scopedMsgs) {
      const a = m.value.author;
      topAuthorsMap.set(a, (topAuthorsMap.get(a) || 0) + 1);
    }
    const topAuthors = Array.from(topAuthorsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ id, count }));

    const addrMap = readAddrMap();
    const myAddress = addrMap[userId] || null;
    const banking = {
      ecoWalletConfigured: !!myAddress,
      myAddress,
      myAddressCount: myAddress ? 1 : 0,
      totalAddresses: Object.keys(addrMap).length
    };
    const pubsCount = listPubsFromEbt().length;

    const stats = {
      id: userId,
      createdAt,
      inhabitants,
      content,
      opinions,
      memberTribes: memberTribesDetailed.map(t => t.name),
      memberTribesDetailed,
      myPrivateTribesDetailed,
      allTribes,
      allTribesPublic,
      tribePublicNames,
      tribePublicCount,
      tribePrivateCount,
      userTombstoneCount: scopedMsgs.filter(m => m.value.content.type === 'tombstone').length,
      networkTombstoneCount: allMsgs.filter(m => m.value.content.type === 'tombstone').length,
      folderSize: formatSize(folderSize),
      statsBlockchainSize: formatSize(flumeSize),
      statsBlobsSize: formatSize(blobsSize),
      pubsCount,
      activity: {
        lastMessageAt: lastTs ? new Date(lastTs).toISOString() : null,
        daily7: days7,
        daily30Total,
        daily7Total
      },
      jobsKPIs: {
        total: jobsVals.length,
        open: jobOpen,
        closed: jobClosed,
        avgSalary: jobSalaries.length ? (sum(jobSalaries) / jobSalaries.length) : 0,
        medianSalary: median(jobSalaries),
        openVacants: sum(jobVacantsOpen),
        subscribersTotal: sum(jobSubsTotal)
      },
      marketKPIs: {
        total: marketVals.length,
        forSale: mkForSale,
        reserved: mkReserved,
        closed: mkClosed,
        sold: mkSold,
        revenueECO,
        avgSoldPrice: soldPrices.length ? (sum(soldPrices) / soldPrices.length) : 0
      },
      projectsKPIs,
      usersKPIs: {
        totalInhabitants: inhabitants,
        topAuthors
      },
      tombstoneKPIs: {
        networkTombstoneCount: allMsgs.filter(m => m.value.content.type === 'tombstone').length,
        ratio: allMsgs.length ? (allMsgs.filter(m => m.value.content.type === 'tombstone').length / allMsgs.length) * 100 : 0
      },
      banking
    };

    return stats;
  };

  return { getStats };
};

