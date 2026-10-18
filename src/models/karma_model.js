const pull = require("../server/node_modules/pull-stream");
const { readTyped, CONTENT_TYPES } = require("./typed_log");
const { getConfig } = require("../configs/config-manager.js");
const { config } = require("../server/SSB_server.js");

function getLogLimit() {
  return getConfig().ssbLogStream?.limit || 1000;
}

const OWN_SCORE_CAP = 200;
const RECEIVED_AUTHOR_MIN_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const opinionCategories = require("../backend/opinion_categories");
const CONSTRUCTIVE_OPINIONS = new Set(opinionCategories.karma.constructive);
const MODERATION_OPINIONS = new Set(opinionCategories.karma.moderation);
const NEUTRAL_OPINIONS = new Set(opinionCategories.karma.neutral);
const NEGATIVE_MIN_VOTERS = 3;
const KARMA_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const NEGATIVE_PATTERN_MIN_VOTERS = 5;
const NEGATIVE_PATTERN_POINTS = 2;
const POSITIVE_PER_VOTER_CAP = 10;
const TRUST_MIN_FOLLOWERS = 2;
const REACTIONS_PER_MESSAGE_CAP = 10;
const PLAYS_PER_EPISODE_CAP = 20;
const ACTIONS_CACHE_TTL_MS = 60 * 1000;

function resolveUserId(maybeId) {
  const s = String(maybeId || "").trim();
  if (s) return s;
  return config?.keys?.id || "";
}

function idsEqual(a, b) {
  if (!a || !b) return false;
  const A = String(a).trim();
  const B = String(b).trim();
  if (A === B) return true;
  const strip = s => s.replace(/^@/, "").replace(/\.ed25519$/, "");
  return strip(A) === strip(B);
}

  function inferType(c = {}) {
    if (c.vote) return "vote";
    if (c.votes) return "votes";
    if (c.address && c.coin === "ECO" && c.type === "wallet") return "bankWallet";
    if (c.type === "ubiClaimResult" && c.txid && c.epochId) return "ubiClaimResult";
    if (typeof c.amount !== "undefined" && c.epochId && c.allocationId) return "bankClaim";
    if (typeof c.item_type !== "undefined" && typeof c.status !== "undefined") return "market";
    if (typeof c.goal !== "undefined" && typeof c.progress !== "undefined") return "project";
    if (typeof c.members !== "undefined" && typeof c.isAnonymous !== "undefined") return "tribe";
    if (typeof c.date !== "undefined" && typeof c.location !== "undefined") return "event";
    if (typeof c.priority !== "undefined" && typeof c.status !== "undefined" && c.title) return "task";
    if (typeof c.confirmations !== "undefined" && typeof c.severity !== "undefined") return "report";
    if (typeof c.job_type !== "undefined" && typeof c.status !== "undefined") return "job";
    if (typeof c.url !== "undefined" && typeof c.mimeType !== "undefined" && c.type === "audio") return "audio";
    if (typeof c.url !== "undefined" && typeof c.mimeType !== "undefined" && c.type === "video") return "video";
    if (typeof c.url !== "undefined" && c.title && c.key) return "document";
    if (typeof c.text !== "undefined" && typeof c.refeeds !== "undefined") return "feed";
    if (typeof c.text !== "undefined" && typeof c.contentWarning !== "undefined") return "post";
    if (typeof c.contact !== "undefined") return "contact";
    if (typeof c.about !== "undefined") return "about";
    if (typeof c.concept !== "undefined" && typeof c.amount !== "undefined" && c.status) return "transfer";
    return "";
  }

  function normalizeType(a) {
    const t = a.type || a.content?.type || inferType(a.content) || "";
    return String(t).toLowerCase();
  }

  function priorityBump(p) {
    const s = String(p || "").toUpperCase();
    if (s === "HIGH") return 3;
    if (s === "MEDIUM") return 1;
    return 0;
  }

  function severityBump(s) {
    const x = String(s || "").toUpperCase();
    if (x === "CRITICAL") return 6;
    if (x === "HIGH") return 4;
    if (x === "MEDIUM") return 2;
    return 0;
  }

  function scoreMarket(c) {
    const st = String(c.status || "").toUpperCase();
    let s = 5;
    if (st === "SOLD") s += 8;
    else if (st === "ACTIVE") s += 3;
    const bids = Array.isArray(c.auctions_poll) ? c.auctions_poll.length : 0;
    s += Math.min(10, bids);
    return s;
  }

  function scoreProject(c) {
    const st = String(c.status || "ACTIVE").toUpperCase();
    const prog = Number(c.progress || 0);
    let s = 8 + Math.min(10, prog / 10);
    if (st === "FUNDED") s += 10;
    return s;
  }

  function calculateOpinionScore(content) {
    const cats = content?.opinions || {};
    let s = 0;
    for (const k in cats) {
      if (!Object.prototype.hasOwnProperty.call(cats, k)) continue;
      if (NEUTRAL_OPINIONS.has(k)) continue;
      if (k === "interesting" || k === "inspiring") s += 5;
      else if (MODERATION_OPINIONS.has(k)) s -= 5;
      else if (CONSTRUCTIVE_OPINIONS.has(k)) s -= 3;
      else s += 1;
    }
    return s;
  }

function basePointsFor(action) {
  const t = normalizeType(action);
  const c = action.content || {};
  const rawType = String(c.type || "").toLowerCase();
  if (t === "post") return 10;
  else if (t === "comment") return 5;
  else if (t === "like") return 2;
  else if (t === "image") return 8;
  else if (t === "video") return 12;
  else if (t === "audio") return 8;
  else if (t === "document") return 6;
  else if (t === "bookmark") return 2;
  else if (t === "feed") return 6;
  else if (t === "forum") return (c.root ? 5 : 10);
  else if (t === "vote") return (3 + calculateOpinionScore(c));
  else if (t === "votes") return Math.min(10, Number(c.totalVotes || 0));
  else if (t === "market") return scoreMarket(c);
  else if (t === "project") return scoreProject(c);
  else if (t === "tribe") return (6 + Math.min(10, Array.isArray(c.members) ? c.members.length * 0.5 : 0));
  else if (t === "event") return (4 + Math.min(10, Array.isArray(c.attendees) ? c.attendees.length : 0));
  else if (t === "task") return (3 + priorityBump(c.priority));
  else if (t === "report") return (4 + (Array.isArray(c.confirmations) ? c.confirmations.length : 0) + severityBump(c.severity));
  else if (t === "curriculum") return 5;
  else if (t === "wikipage") return (c.replaces ? 2 : 6);
  else if (t === "emergency") return (c.replaces ? 1 : 5);
  else if (t === "emergencyconfirm") return 1;
  else if (t === "emergencyupdate") return 2;
  else if (t === "mailinglist") return (c.replaces ? 1 : 3);
  else if (t === "logisticsroute") return (c.replaces ? 1 : 4);
  else if (t === "logisticsrating") return 1;
  else if (t === "podcast") return (c.replaces ? 1 : 5);
  else if (t === "podcastepisode") return (c.replaces ? 1 : 4);
  else if (t === "podcastopinion" || t === "podcastplay" || t === "campaignopinion" || t === "logisticsopinion") return 1;
  else if (t === "campaign") return (c.replaces ? 1 : 5);
  else if (t === "campaignsignature") return 1;
  else if (t === "campaignupdate") return 2;
  else if (t === "aiexchange") return (Array.isArray(c.ctx) ? Math.min(10, c.ctx.length) : 0);
  else if (t === "job") return (4 + (Array.isArray(c.subscribers) ? c.subscribers.length : 0));
  else if (t === "transfer") return 1;
  else if (t === "about") return (1 + ((c.visibilityPrefs && c.visibilityPrefs.fediverseHandle) ? 8 : 0));
  else if (t === "contact") return 1;
  else if (t === "pub") return 1;
  else if (t === "parliamentcandidature" || rawType === "parliamentcandidature") return 12;
  else if (t === "parliamentterm" || rawType === "parliamentterm") return 25;
  else if (t === "parliamentproposal" || rawType === "parliamentproposal") return 8;
  else if (t === "parliamentlaw" || rawType === "parliamentlaw") return 16;
  else if (t === "parliamentrevocation" || rawType === "parliamentrevocation") return 10;
  else if (t === "courts_case" || t === "courtscase" || rawType === "courts_case") return 4;
  else if (t === "courts_evidence" || t === "courtsevidence" || rawType === "courts_evidence") return 3;
  else if (t === "courts_answer" || t === "courtsanswer" || rawType === "courts_answer") return 4;
  else if (t === "courts_verdict" || t === "courtsverdict" || rawType === "courts_verdict") return 10;
  else if (t === "courts_settlement" || t === "courtssettlement" || rawType === "courts_settlement") return 8;
  else if (t === "courts_nomination" || t === "courtsnomination" || rawType === "courts_nomination") return 6;
  else if (t === "courts_nom_vote" || t === "courtsnomvote" || rawType === "courts_nom_vote") return 3;
  else if (t === "courts_public_pref" || t === "courtspublicpref" || rawType === "courts_public_pref") return 1;
  else if (t === "courts_mediators" || t === "courtsmediators" || rawType === "courts_mediators") return 6;
  else if (t === "courts_open_support" || t === "courtsopensupport" || rawType === "courts_open_support") return 2;
  else if (t === "courts_verdict_vote" || t === "courtsverdictvote" || rawType === "courts_verdict_vote") return 3;
  else if (t === "courts_judge_assign" || t === "courtsjudgeassign" || rawType === "courts_judge_assign") return 5;
  else if (t === "larpjoinhouse") return 15;
  else if (t === "larphousepost") return 6;
  else if (t === "larptestattempt") return 3;
  else if (t === "torrent") return 6;
  else if (t === "file") return 6;
  else if (t === "shop" || t === "shopproduct") return 6;
  else if (t === "shop-purchase") return 2;
  else if (t === "pad" || t === "padentry") return 3;
  else if (t === "room") return 3;
  else if (t === "roommember") return 1;
  else if (t === "calendar" || t === "calendarnote" || t === "calendardate") return 3;
  else if (t === "chat") return 1;
  else if (t === "gamescore") return 2;
  else if (t === "pixelia") return 2;
  else if (rawType === "industry") return 8;
  else if (rawType === "industryblueprint") return 6;
  else if (rawType === "industrybuild") return 8;
  else if (rawType === "industrycontribution") return 4;
  else if (rawType === "industryallocation") return 10;
  else if (rawType === "industryvote") return 2;
  else if (rawType === "industrymember") return 2;
  else if (rawType === "industryopinion") return 1;
  else if (rawType === "schoolcourse") return 10;
  else if (rawType === "schoollesson") return 6;
  else if (rawType === "schoolenroll") return 3;
  else if (rawType === "schoolcertificate") return 12;
  else if (rawType === "schoolexam") return 6;
  else if (rawType === "schoolprogress") return 1;
  else if (rawType === "schoolopinion") return 2;
  return 0;
}

function decayFor(ts, nowMs) {
  const ageDays = ts ? (nowMs - ts) / 86400000 : Infinity;
  return ageDays <= 30 ? 1.0 : ageDays <= 90 ? 0.5 : 0.25;
}

function scoreFromActions(actions) {
  let score = 0;
  const nowMs = Date.now();
  const perTypeDay = new Map();
  for (const action of actions) {
    const pts = basePointsFor(action);
    if (!pts) continue;
    const ts = action.value?.timestamp;
    const dayKey = `${normalizeType(action)}:${ts ? new Date(ts).toISOString().slice(0, 10) : "?"}`;
    const n = (perTypeDay.get(dayKey) || 0) + 1;
    perTypeDay.set(dayKey, n);
    score += pts * decayFor(ts, nowMs) / n;
  }
  return Math.max(0, Math.round(Math.min(OWN_SCORE_CAP, score)));
}

function receivedBreakdownFor(userId, actions) {
  const nowMs = Date.now();
  const mine = new Set();
  const firstTs = new Map();
  const follows = new Map();
  for (const a of actions) {
    if (!a.author) continue;
    const ts = Number(a.receivedAt) || 0;
    if (ts && (!firstTs.has(a.author) || ts < firstTs.get(a.author))) firstTs.set(a.author, ts);
    if (a.author === userId && a.id) mine.add(a.id);
    const c = a.content || {};
    if (c.type === "contact" && typeof c.contact === "string" && c.contact !== a.author) {
      const k = `${a.author}|${c.contact}`;
      const at = Number(a.value?.timestamp) || ts;
      const prev = follows.get(k);
      if (!prev || at >= prev.at) follows.set(k, { on: c.following === true && c.blocking !== true, at });
    }
  }
  const followersOf = new Map();
  for (const [k, f] of follows) {
    if (!f.on) continue;
    const [from, to] = k.split("|");
    if (!followersOf.has(to)) followersOf.set(to, new Set());
    followersOf.get(to).add(from);
  }
  const known = (id) => firstTs.has(id) && nowMs - firstTs.get(id) >= RECEIVED_AUTHOR_MIN_AGE_MS;
  const trusted = (voter, sameSide) => {
    let n = 0;
    for (const f of followersOf.get(voter) || []) {
      if (f === userId || sameSide.has(f) || !known(f)) continue;
      if (++n >= TRUST_MIN_FOLLOWERS) return true;
    }
    return false;
  };
  const seen = new Set();
  const perTarget = new Map();
  const negatives = new Map();
  const votes = new Map();
  const reactions = new Map();
  const credits = [];
  let positive = 0;
  let negative = 0;
  const add = (author, kind, target, pts, ts, capPerTarget = Infinity) => {
    const k = `${kind}:${author}:${target}`;
    if (seen.has(k)) return;
    const n = perTarget.get(`${kind}:${target}`) || 0;
    if (n >= capPerTarget) return;
    seen.add(k);
    perTarget.set(`${kind}:${target}`, n + 1);
    credits.push({ voter: author, pts, ts: Number(ts) || 0 });
  };
  const addNegative = (author, target, pts, ts) => {
    const k = `neg:${author}:${target}`;
    if (seen.has(k)) return;
    seen.add(k);
    if (!negatives.has(target)) negatives.set(target, []);
    negatives.get(target).push({ voter: author, pts, ts: Number(ts) || 0 });
  };
  for (const a of actions) {
    const b = a.author;
    if (!b || b === userId) continue;
    if (!firstTs.has(b) || nowMs - firstTs.get(b) < RECEIVED_AUTHOR_MIN_AGE_MS) continue;
    const c = a.content || {};
    const type = String(c.type || "");
    const ts = a.value?.timestamp;
    if (/Opinion$/.test(type) && type !== "pollOpinion" && mine.has(c.target)) {
      const cat = String(c.category || "");
      if (NEUTRAL_OPINIONS.has(cat)) continue;
      if (MODERATION_OPINIONS.has(cat)) addNegative(b, c.target, -5, ts);
      else if (CONSTRUCTIVE_OPINIONS.has(cat)) addNegative(b, c.target, -3, ts);
      else add(b, "opinion", c.target, 3, ts);
    }
    else if (type === "vote" && c.vote && mine.has(c.vote.link)) {
      const k = `${b}:${c.vote.link}`;
      const prev = votes.get(k);
      if (!prev || (Number(ts) || 0) >= prev.ts) votes.set(k, { author: b, target: c.vote.link, value: Number(c.vote.value) || 0, ts: Number(ts) || 0 });
    }
    else if (type === "feed-action" && c.action === "vote" && mine.has(c.root || c.target)) add(b, "opinion", c.root || c.target, 3, ts);
    else if (type === "feed-action" && c.action === "comment" && mine.has(c.root)) add(b, "comment", c.root, 2, ts, 10);
    else if (type === "feed-action" && c.action === "refeed" && mine.has(c.root)) add(b, "refeed", c.root, 2, ts, 10);
    else if (type === "post" && c.root && mine.has(c.root)) add(b, "comment", c.root, 2, ts, 10);
    else if (type === "contact" && c.following === true && c.contact === userId) add(b, "follow", userId, 2, ts);
    else if (type === "chatReaction" && mine.has(c.target)) {
      const k = `${b}:${c.target}:${c.emoji}`;
      const prev = reactions.get(k);
      if (!prev || (Number(ts) || 0) >= prev.ts) reactions.set(k, { author: b, target: c.target, emoji: c.emoji, on: c.on !== false, ts: Number(ts) || 0 });
    }
    else if (type === "podcastPlay" && mine.has(c.target)) add(b, "play", c.target, 1, ts, PLAYS_PER_EPISODE_CAP);
    else if (type === "marketPurchase" && mine.has(c.target)) add(b, "purchase", c.target, 5, ts);
    else if (type === "shop-purchase" && c.seller === userId) add(b, "purchase", c.productId || a.id, 5, ts);
    else if (type === "schoolEnroll" && c.value === true && mine.has(c.courseId)) add(b, "enroll", c.courseId, 5, ts);
    else if (type === "transferConfirm" && mine.has(c.target)) add(b, "confirm", c.target, 3, ts);
  }
  for (const r of reactions.values()) {
    if (!r.on) continue;
    if (r.emoji === "down") addNegative(r.author, r.target, -3, r.ts);
    else add(r.author, "reaction", r.target, 1, r.ts, REACTIONS_PER_MESSAGE_CAP);
  }
  for (const v of votes.values()) {
    if (v.value > 0) add(v.author, "opinion", v.target, 3, v.ts);
    else if (v.value < 0) addNegative(v.author, v.target, -3, v.ts);
  }
  const vouched = new Map();
  const isTrusted = (voter, side, cache) => {
    if (!cache.has(voter)) cache.set(voter, trusted(voter, side));
    return cache.get(voter);
  };
  const usedByVoter = new Map();
  for (const c of credits.sort((x, y) => x.ts - y.ts)) {
    if (!isTrusted(c.voter, new Set(), vouched)) continue;
    const k = `${c.voter}:${Math.floor(c.ts / KARMA_PERIOD_MS)}`;
    const used = usedByVoter.get(k) || 0;
    const take = Math.min(c.pts, POSITIVE_PER_VOTER_CAP - used);
    if (take <= 0) continue;
    usedByVoter.set(k, used + take);
    positive += take * decayFor(c.ts, nowMs);
  }
  const blaming = new Set();
  for (const list of negatives.values()) for (const n of list) blaming.add(n.voter);
  const vouchedAgainst = new Map();
  const pattern = new Map();
  for (const all of negatives.values()) {
    const list = all.filter(n => isTrusted(n.voter, blaming, vouchedAgainst));
    if (list.length >= NEGATIVE_MIN_VOTERS) {
      for (const n of list) negative += Math.abs(n.pts) * decayFor(n.ts, nowMs);
      continue;
    }
    for (const n of list) {
      if (!n.ts || nowMs - n.ts > KARMA_PERIOD_MS) continue;
      if ((pattern.get(n.voter) || 0) < n.ts) pattern.set(n.voter, n.ts);
    }
  }
  if (pattern.size >= NEGATIVE_PATTERN_MIN_VOTERS) {
    for (const ts of pattern.values()) negative += NEGATIVE_PATTERN_POINTS * decayFor(ts, nowMs);
  }
  positive = Math.round(positive);
  negative = Math.round(negative);
  return { score: positive - negative, positive, negative };
}

function receivedScoreFor(userId, actions) {
  return receivedBreakdownFor(userId, actions).score;
}

module.exports = ({ services, ranges } = {}) => {
  const normalizeRange = ranges && ranges.normalizeRange ? ranges.normalizeRange : (r) => String(r || "all");
  const widenRange = ranges && ranges.widenRange ? ranges.widenRange : (arr, r) => normalizeRange(r);
  const filterByRange = ranges && ranges.filterByRange ? ranges.filterByRange : (arr) => arr;

  let ssbInstance;
  async function openSsb() {
    if (ssbInstance) return ssbInstance;
    if (services?.cooler?.open) ssbInstance = await services.cooler.open();
    else if (global.ssb) ssbInstance = global.ssb;
    else {
      try {
        const srv = require("../server/SSB_server.js");
        ssbInstance = srv?.ssb || srv?.server || srv?.default || null;
      } catch (_) {
        ssbInstance = null;
      }
    }
    return ssbInstance;
  }

  let actionsCache = null;
  async function listAllActions() {
    const ssb = await openSsb();
    if (!ssb) {
      return [];
    }
    const ownSeq = await ownFeedSeq(ssb);
    if (actionsCache && actionsCache.ownSeq === ownSeq && Date.now() - actionsCache.ts < ACTIONS_CACHE_TTL_MS) return actionsCache.value;
    const msgs = await readTyped(ssb, CONTENT_TYPES, { limit: Math.max(getLogLimit(), 20000) });
    const value = msgs.map(m => {
      const v = m.value || {};
      const c = v.content || {};
      return {
        id: v.key || m.key,
        author: v.author,
        type: (c.type || "").toLowerCase(),
        value: v,
        content: c,
        receivedAt: Number(m.timestamp) || 0
      };
    });
    actionsCache = { ts: Date.now(), ownSeq, value };
    return value;
  }

async function ownFeedSeq(ssb) {
  return new Promise((res) => {
    try {
      pull(
        ssb.createUserStream({ id: ssb.id, reverse: true, limit: 1 }),
        pull.collect((err, msgs) => res(err || !msgs || !msgs.length ? 0 : (msgs[0].value && msgs[0].value.sequence) || 0))
      );
    } catch (_) { res(0); }
  });
}

async function publishKarmaScore(userId, karmaScore) {
  const ssb = await openSsb();
  if (!ssb || !ssb.publish) return false;
  if (!(await ownFeedSeq(ssb))) return false;
  const timestamp = new Date().toISOString();
  const content = { type: "karmaScore", karmaScore, userId, timestamp };
  return new Promise((resolve, reject) => {
    ssb.publish(content, (err, msg) => err ? reject(err) : resolve(msg));
  });
}

async function fetchUserActions(userId) {
  const me = resolveUserId(userId);
  const actions = await listAllActions();
  const authored = actions.filter(a =>
    (a.author && a.author === me) || (a.value?.author && a.value.author === me)
  );
  if (authored.length) return authored;
  return actions.filter(a => {
    const c = a.content || {};
    const fields = [c.author, c.organizer, c.seller, c.about, c.contact];
    return fields.some(f => f && f === me);
  });
}

async function getCarbonGramsForUser(userId) {
  const ssb = await openSsb();
  if (!ssb || !userId) return 0;
  return new Promise((resolve) => {
    let bytes = 0;
    pull(
      ssb.createUserStream({ id: userId }),
      pull.drain(
        (m) => { try { bytes += Buffer.byteLength(JSON.stringify(m && m.value), 'utf8'); } catch (_) {} },
        () => resolve((bytes / (1024 * 1024)) * 0.095)
      )
    );
  });
}

async function getUserEngagementScore(userId) {
  const ssb = await openSsb();
  const uid = resolveUserId(userId);
  const actions = await fetchUserActions(uid);
  const all = await listAllActions();
  const rawKarma = scoreFromActions(actions) + receivedScoreFor(uid, all);
  const carbonGrams = await getCarbonGramsForUser(uid).catch(() => 0);
  const karmaScore = Math.max(0, Math.round(rawKarma - carbonGrams));

  const prev = await getLastKarmaScore(uid);
  const lastPublishedTimestamp = await getLastPublishedTimestamp(uid);

  const isSelf = idsEqual(uid, ssb.id);
  const hasSSB = !!(ssb && ssb.publish);

  const changed = (prev === null) || (karmaScore !== prev);
  const nowMs = Date.now();
  const lastMs = lastPublishedTimestamp ? new Date(lastPublishedTimestamp).getTime() : 0;
  const cooldownOk = (nowMs - lastMs) >= 24 * 60 * 60 * 1000;

  if (isSelf && hasSSB && changed && cooldownOk) {
    await publishKarmaScore(uid, karmaScore);
  }
  return karmaScore;
}

async function getLastKarmaScore(userId) {
  const ssb = await openSsb();
  if (!ssb) return null;
  return new Promise((resolve) => {
    const source = ssb.messagesByType
      ? ssb.messagesByType({ type: "karmaScore", reverse: true })
      : ssb.createLogStream && ssb.createLogStream({ reverse: true });
    if (!source) return resolve(null);
    pull(
      source,
      pull.filter(msg => {
        const v = msg.value || msg;
        const c = v.content || {};
        return c && c.type === "karmaScore" && c.userId === userId;
      }),
      pull.take(1),
      pull.collect((err, arr) => {
        if (err || !arr || !arr.length) return resolve(null);
        const v = arr[0].value || arr[0];
        const c = v.content || {};
        resolve(Number(c.karmaScore) || 0);
      })
    );
  });
}

async function getLastPublishedTimestamp(userId) {
  const ssb = await openSsb();
  if (!ssb) return new Date(0).toISOString();
  const fallback = new Date(0).toISOString();
  return new Promise((resolve) => {
    const source = ssb.messagesByType
      ? ssb.messagesByType({ type: "karmaScore", reverse: true })
      : ssb.createLogStream && ssb.createLogStream({ reverse: true });
    if (!source) return resolve(fallback);
    pull(
      source,
      pull.filter(msg => {
        const v = msg.value || msg;
        const c = v.content || {};
        return c && c.type === "karmaScore" && c.userId === userId;
      }),
      pull.take(1),
      pull.collect((err, arr) => {
        if (err || !arr || !arr.length) return resolve(fallback);
        const v = arr[0].value || arr[0];
        const c = v.content || {};
        resolve(c.timestamp || fallback);
      })
    );
  });
}

  async function getKarmaBreakdown(userId) {
    const uid = resolveUserId(userId);
    const received = receivedBreakdownFor(uid, await listAllActions());
    return { karmaScore: await getUserEngagementScore(uid), positive: received.positive, negative: received.negative };
  }

  async function listKarmaHistory(userId, range = "all", explicit = true) {
    const ssb = await openSsb();
    if (!ssb) return { points: [], hasAny: false, range: normalizeRange(range) };
    const uid = resolveUserId(userId);
    const msgs = await readTyped(ssb, ["karmaScore"], { limit: Math.max(getLogLimit(), 5000) });
    const all = msgs
      .filter(m => m.value && m.value.author === uid && m.value.content && m.value.content.type === "karmaScore")
      .map(m => ({ ts: Date.parse(m.value.content.timestamp || "") || Number(m.value.timestamp) || 0, score: Number(m.value.content.karmaScore) || 0 }))
      .filter(x => x.ts > 0)
      .sort((a, b) => a.ts - b.ts);
    const effective = explicit ? normalizeRange(range) : widenRange(all, range);
    return { points: filterByRange(all, effective).slice(-120), hasAny: all.length >= 2, range: effective };
  }

  return {
    listAllActions,
    fetchUserActions,
    scoreFromActions,
    receivedBreakdownFor,
    receivedScoreFor,
    getCarbonGramsForUser,
    getUserEngagementScore,
    getKarmaBreakdown,
    getLastKarmaScore,
    getLastPublishedTimestamp,
    publishKarmaScore,
    listKarmaHistory,
    basePointsFor,
    decayFor,
    NEGATIVE_MIN_VOTERS,
    NEGATIVE_PATTERN_MIN_VOTERS,
    NEGATIVE_PATTERN_POINTS,
    POSITIVE_PER_VOTER_CAP,
    KARMA_PERIOD_MS,
    TRUST_MIN_FOLLOWERS
  };
};
