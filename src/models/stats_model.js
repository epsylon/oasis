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
    'market','forum','job','aiExchange','map','shop','shopProduct',
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

  const inferType = (c = {}) => {
    if (c.vote) return 'vote';
    if (c.votes) return 'votes';
    if (c.address && c.coin === 'ECO' && c.type === 'wallet') return 'bankWallet';
    if (typeof c.amount !== 'undefined' && c.epochId && c.allocationId) return 'bankClaim';
    if (typeof c.item_type !== 'undefined' && typeof c.status !== 'undefined') return 'market';
    if (typeof c.goal !== 'undefined' && typeof c.progress !== 'undefined') return 'project';
    if (typeof c.members !== 'undefined' && typeof c.isAnonymous !== 'undefined') return 'tribe';
    if (typeof c.date !== 'undefined' && typeof c.location !== 'undefined') return 'event';
    if (typeof c.priority !== 'undefined' && typeof c.status !== 'undefined' && c.title) return 'task';
    if (typeof c.confirmations !== 'undefined' && typeof c.severity !== 'undefined') return 'report';
    if (typeof c.job_type !== 'undefined' && typeof c.status !== 'undefined') return 'job';
    if (typeof c.url !== 'undefined' && typeof c.mimeType !== 'undefined' && c.type === 'audio') return 'audio';
    if (typeof c.url !== 'undefined' && typeof c.mimeType !== 'undefined' && c.type === 'video') return 'video';
    if (typeof c.url !== 'undefined' && c.title && c.key) return 'document';
    if (typeof c.text !== 'undefined' && typeof c.refeeds !== 'undefined') return 'feed';
    if (typeof c.text !== 'undefined' && typeof c.contentWarning !== 'undefined') return 'post';
    if (typeof c.contact !== 'undefined') return 'contact';
    if (typeof c.about !== 'undefined') return 'about';
    if (typeof c.concept !== 'undefined' && typeof c.amount !== 'undefined' && c.status) return 'transfer';
    if (c.type === 'map') return 'map';
    if (c.type === 'shop') return 'shop';
    if (c.type === 'shopProduct') return 'shopProduct';
    return '';
  };

  const normalizeActionType = (a) => {
    const t = a.type || a.content?.type || inferType(a.content) || '';
    return String(t).toLowerCase();
  };

  const priorityBump = (p) => {
    const s = String(p || '').toUpperCase();
    if (s === 'HIGH') return 3;
    if (s === 'MEDIUM') return 1;
    return 0;
  };

  const severityBump = (s) => {
    const x = String(s || '').toUpperCase();
    if (x === 'CRITICAL') return 6;
    if (x === 'HIGH') return 4;
    if (x === 'MEDIUM') return 2;
    return 0;
  };

  const calculateOpinionScore = (content) => {
    const cats = content?.opinions || {};
    let s = 0;
    for (const k in cats) {
      if (!Object.prototype.hasOwnProperty.call(cats, k)) continue;
      if (k === 'interesting' || k === 'inspiring') s += 5;
      else if (k === 'boring' || k === 'spam' || k === 'propaganda') s -= 3;
      else s += 1;
    }
    return s;
  };

  const scoreMarketItem = (c) => {
    const st = String(c.status || '').toUpperCase();
    let s = 5;
    if (st === 'SOLD') s += 8;
    else if (st === 'ACTIVE') s += 3;
    const bids = Array.isArray(c.auctions_poll) ? c.auctions_poll.length : 0;
    s += Math.min(10, bids);
    return s;
  };

  const scoreProjectItem = (c) => {
    const st = String(c.status || 'ACTIVE').toUpperCase();
    const prog = Number(c.progress || 0);
    let s = 8 + Math.min(10, prog / 10);
    if (st === 'FUNDED') s += 10;
    return s;
  };

  const computeKarmaFromMsgs = (msgs) => {
    let score = 0;
    for (const m of msgs) {
      const c = m.value?.content || {};
      const t = normalizeActionType({ type: c.type, content: c });
      const rawType = String(c.type || '').toLowerCase();
      if (t === 'post') score += 10;
      else if (t === 'comment') score += 5;
      else if (t === 'like') score += 2;
      else if (t === 'image') score += 8;
      else if (t === 'video') score += 12;
      else if (t === 'audio') score += 8;
      else if (t === 'document') score += 6;
      else if (t === 'map') score += 6;
      else if (t === 'bookmark') score += 2;
      else if (t === 'feed') score += 6;
      else if (t === 'forum') score += c.root ? 5 : 10;
      else if (t === 'vote') score += 3 + calculateOpinionScore(c);
      else if (t === 'votes') score += Math.min(10, Number(c.totalVotes || 0));
      else if (t === 'market') score += scoreMarketItem(c);
      else if (t === 'project') score += scoreProjectItem(c);
      else if (t === 'tribe') score += 6 + Math.min(10, Array.isArray(c.members) ? c.members.length * 0.5 : 0);
      else if (t === 'event') score += 4 + Math.min(10, Array.isArray(c.attendees) ? c.attendees.length : 0);
      else if (t === 'task') score += 3 + priorityBump(c.priority);
      else if (t === 'report') score += 4 + (Array.isArray(c.confirmations) ? c.confirmations.length : 0) + severityBump(c.severity);
      else if (t === 'curriculum') score += 5;
      else if (t === 'aiexchange') score += Array.isArray(c.ctx) ? Math.min(10, c.ctx.length) : 0;
      else if (t === 'job') score += 4 + (Array.isArray(c.subscribers) ? c.subscribers.length : 0);
      else if (t === 'bankclaim') score += Math.min(20, Math.log(1 + Math.max(0, Number(c.amount) || 0)) * 5);
      else if (t === 'bankwallet') score += 2;
      else if (t === 'transfer') score += 1;
      else if (t === 'about') score += 1;
      else if (t === 'contact') score += 1;
      else if (t === 'pub') score += 1;
      else if (t === 'parliamentcandidature' || rawType === 'parliamentcandidature') score += 12;
      else if (t === 'parliamentterm' || rawType === 'parliamentterm') score += 25;
      else if (t === 'parliamentproposal' || rawType === 'parliamentproposal') score += 8;
      else if (t === 'parliamentlaw' || rawType === 'parliamentlaw') score += 16;
      else if (t === 'parliamentrevocation' || rawType === 'parliamentrevocation') score += 10;
      else if (t === 'courts_case' || t === 'courtscase' || rawType === 'courts_case') score += 4;
      else if (t === 'courts_evidence' || t === 'courtsevidence' || rawType === 'courts_evidence') score += 3;
      else if (t === 'courts_answer' || t === 'courtsanswer' || rawType === 'courts_answer') score += 4;
      else if (t === 'courts_verdict' || t === 'courtsverdict' || rawType === 'courts_verdict') score += 10;
      else if (t === 'courts_settlement' || t === 'courtssettlement' || rawType === 'courts_settlement') score += 8;
      else if (t === 'courts_nomination' || t === 'courtsnomination' || rawType === 'courts_nomination') score += 6;
      else if (t === 'courts_nom_vote' || t === 'courtsnomvote' || rawType === 'courts_nom_vote') score += 3;
      else if (t === 'courts_public_pref' || t === 'courtspublicpref' || rawType === 'courts_public_pref') score += 1;
      else if (t === 'courts_mediators' || t === 'courtsmediators' || rawType === 'courts_mediators') score += 6;
      else if (t === 'courts_open_support' || t === 'courtsopensupport' || rawType === 'courts_open_support') score += 2;
      else if (t === 'courts_verdict_vote' || t === 'courtsverdictvote' || rawType === 'courts_verdict_vote') score += 3;
      else if (t === 'courts_judge_assign' || t === 'courtsjudgeassign' || rawType === 'courts_judge_assign') score += 5;
    }
    return Math.max(0, Math.round(score));
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

    if (filter === 'MINE') {
      const myMsgs = allMsgs.filter(m => m.value.author === userId);
      content['karmaScore'] = computeKarmaFromMsgs(myMsgs);
    } else {
      const msgsByAuthor = new Map();
      for (const m of allMsgs) {
        const a = m.value.author;
        if (!msgsByAuthor.has(a)) msgsByAuthor.set(a, []);
        msgsByAuthor.get(a).push(m);
      }
      let sumKarma = 0;
      for (const authorMsgs of msgsByAuthor.values()) {
        sumKarma += computeKarmaFromMsgs(authorMsgs);
      }
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

