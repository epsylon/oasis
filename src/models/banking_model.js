const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const pull = require("../server/node_modules/pull-stream");
const { getConfig } = require("../configs/config-manager.js");
const { config } = require("../server/SSB_server.js");

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

const DEFAULT_RULES = {
  epochKind: "WEEKLY",
  alpha: 0.2,
  reserveMin: 500,
  capPerEpoch: 2000,
  caps: { M_max: 3, T_max: 1.5, P_max: 2, cap_user_epoch: 50, w_min: 0.2, w_max: 6 },
  coeffs: { a1: 0.6, a2: 0.4, a3: 0.3, a4: 0.5, b1: 0.5, b2: 1.0 },
  graceDays: 14
};

const STORAGE_DIR = path.join(__dirname, "..", "configs");
const EPOCHS_PATH = path.join(STORAGE_DIR, "banking-epochs.json");
const TRANSFERS_PATH = path.join(STORAGE_DIR, "banking-allocations.json");
const ADDR_PATH = path.join(STORAGE_DIR, "wallet-addresses.json");

function ensureStoreFiles() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
  if (!fs.existsSync(EPOCHS_PATH)) fs.writeFileSync(EPOCHS_PATH, "[]");
  if (!fs.existsSync(TRANSFERS_PATH)) fs.writeFileSync(TRANSFERS_PATH, "[]");
  if (!fs.existsSync(ADDR_PATH)) fs.writeFileSync(ADDR_PATH, "{}");
}

function epochIdNow() {
  const d = new Date();
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  const yyyy = tmp.getUTCFullYear();
  return `${yyyy}-${String(weekNo).padStart(2, "0")}`;
}

async function getAnyWalletAddress() {
  const tryOne = async (method, params = []) => {
    const r = await rpcCall(method, params, "user");
    if (!r) return null;
    if (typeof r === "string" && isValidEcoinAddress(r)) return r;
    if (Array.isArray(r) && r.length && isValidEcoinAddress(r[0])) return r[0];
    if (r && typeof r === "object") {
      const keys = Object.keys(r);
      if (keys.length && isValidEcoinAddress(keys[0])) return keys[0];
      if (r.address && isValidEcoinAddress(r.address)) return r.address;
    }
    return null;
  };
  return await tryOne("getnewaddress")
      || await tryOne("getaddress")
      || await tryOne("getaccountaddress", [""])
      || await tryOne("getaddressesbyaccount", [""])
      || await tryOne("getaddressesbylabel", [""])
      || await tryOne("getaddressesbylabel", ["default"]);
}

async function ensureSelfAddressPublished() {
  const me = config.keys.id;
  const local = readAddrMap();
  const current = typeof local[me] === "string" ? local[me] : (local[me] && local[me].address) || null;
  if (current && isValidEcoinAddress(current)) return { status: "present", address: current };
  const cfg = getWalletCfg("user") || {};
  if (!cfg.url) return { status: "skipped" };
  const addr = await getAnyWalletAddress();
  if (addr && isValidEcoinAddress(addr)) {
    const m = readAddrMap();
    m[me] = addr;
    writeAddrMap(m);
    let ssb = null;
    try {
      if (services?.cooler?.open) ssb = await services.cooler.open();
      else if (global.ssb) ssb = global.ssb;
      else {
        try {
          const srv = require("../server/SSB_server.js");
          ssb = srv?.ssb || srv?.server || srv?.default || null;
        } catch (_) {}
      }
    } catch (_) {}
    if (ssb && ssb.publish) {
      await new Promise((resolve, reject) =>
	   ssb.publish(
	      { type: "wallet", coin: "ECO", address: addr, timestamp: Date.now(), updatedAt: new Date().toISOString() },
	      (err) => err ? reject(err) : resolve()
	    )
      );
    }
    return { status: "published", address: addr };
  }
  return { status: "error" };
}

function readJson(p, d) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; }
}

function writeJson(p, v) {
  fs.writeFileSync(p, JSON.stringify(v, null, 2));
}

async function rpcCall(method, params, kind = "user") {
  const cfg = getWalletCfg(kind);
  if (!cfg?.url) {
    return null; 
  }
  const headers = {
    "Content-Type": "application/json",
  };
  if (cfg.user || cfg.pass) {
    headers.authorization = "Basic " + Buffer.from(`${cfg.user}:${cfg.pass}`).toString("base64");
  }
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        jsonrpc: "1.0",
        id: "oasis",
        method: method,
        params: params,
      }),
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (data.error) {
      return null; 
    }
    return data.result; 
  } catch (err) {
    return null;
  }
}

async function safeGetBalance(kind = "user") {
  try {
    const r = await rpcCall("getbalance", [], kind);
    return Number(r) || 0;
  } catch {
    return 0;
  }
}

function readAddrMap() {
  ensureStoreFiles();
  const raw = readJson(ADDR_PATH, {});
  return raw && typeof raw === "object" ? raw : {};
}

function writeAddrMap(m) {
  ensureStoreFiles();
  writeJson(ADDR_PATH, m || {});
}

function getLogLimit() {
  return getConfig().ssbLogStream?.limit || 1000;
}

function isValidEcoinAddress(addr) {
  return typeof addr === "string" && /^[A-Za-z0-9]{20,64}$/.test(addr);
}

function getWalletCfg(kind) {
  const cfg = getConfig() || {};
  if (kind === "pub") {
    return cfg.walletPub || cfg.pubWallet || (cfg.pub && cfg.pub.wallet) || null;
  }
  return cfg.wallet || null;
}

function resolveUserId(maybeId) {
  const s = String(maybeId || "").trim();
  if (s) return s;
  return config?.keys?.id || "";
}

let FEED_SRC = "none";

module.exports = ({ services } = {}) => {
  const transfersRepo = {
    listAll: async () => { ensureStoreFiles(); return readJson(TRANSFERS_PATH, []); },
    listByTag: async (tag) => { ensureStoreFiles(); return readJson(TRANSFERS_PATH, []).filter(t => (t.tags || []).includes(tag)); },
    findById: async (id) => { ensureStoreFiles(); return readJson(TRANSFERS_PATH, []).find(t => t.id === id) || null; },
    create: async (t) => { ensureStoreFiles(); const all = readJson(TRANSFERS_PATH, []); all.push(t); writeJson(TRANSFERS_PATH, all); },
    markClosed: async (id, txid) => { ensureStoreFiles(); const all = readJson(TRANSFERS_PATH, []); const i = all.findIndex(x => x.id === id); if (i >= 0) { all[i].status = "CLOSED"; all[i].txid = txid; writeJson(TRANSFERS_PATH, all); } }
  };

  const epochsRepo = {
    list: async () => { ensureStoreFiles(); return readJson(EPOCHS_PATH, []); },
    save: async (epoch) => { ensureStoreFiles(); const all = readJson(EPOCHS_PATH, []); const i = all.findIndex(e => e.id === epoch.id); if (i >= 0) all[i] = epoch; else all.push(epoch); writeJson(EPOCHS_PATH, all); },
    get: async (id) => { ensureStoreFiles(); return readJson(EPOCHS_PATH, []).find(e => e.id === id) || null; }
  };

  let ssbInstance;
  async function openSsb() {
    if (ssbInstance) return ssbInstance;
    if (services?.cooler?.open) ssbInstance = await services.cooler.open();
    else if (cooler?.open) ssbInstance = await cooler.open();
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

  async function getWalletFromSSB(userId) {
    const ssb = await openSsb();
    if (!ssb) return null;
    const msgs = await new Promise((resolve, reject) =>
      pull(
        ssb.createLogStream({ limit: getLogLimit() }),
        pull.collect((err, arr) => err ? reject(err) : resolve(arr))
      )
    );
    for (let i = msgs.length - 1; i >= 0; i--) {
      const v = msgs[i].value || {};
      const c = v.content || {};
      if (v.author === userId && c && c.type === "wallet" && c.coin === "ECO" && typeof c.address === "string") {
        return c.address;
      }
    }
    return null;
  }

  async function scanAllWalletsSSB() {
    const ssb = await openSsb();
    if (!ssb) return {};
    const latest = {};
    const msgs = await new Promise((resolve, reject) =>
      pull(
        ssb.createLogStream({ limit: getLogLimit() }),
        pull.collect((err, arr) => err ? reject(err) : resolve(arr))
      )
    );
    for (let i = msgs.length - 1; i >= 0; i--) {
      const v = msgs[i].value || {};
      const c = v.content || {};
      if (c && c.type === "wallet" && c.coin === "ECO" && typeof c.address === "string") {
        if (!latest[v.author]) latest[v.author] = c.address;
      }
    }
    return latest;
  }

  async function publishSelfAddress(address) {
    const ssb = await openSsb();
    if (!ssb) return false;
    const msg = { type: "wallet", coin: "ECO", address, updatedAt: new Date().toISOString() };
    await new Promise((resolve, reject) => ssb.publish(msg, (err, val) => err ? reject(err) : resolve(val)));
    return true;
  }

  async function listUsers() {
    const addrLocal = readAddrMap();
    const ids = Object.keys(addrLocal);
    if (ids.length > 0) return ids.map(id => ({ id }));
    return [{ id: config.keys.id }];
  }

  async function getUserAddress(userId) {
    const v = readAddrMap()[userId];
    const local = typeof v === "string" ? v : (v && v.address) || null;
    if (local) return local;
    const ssbAddr = await getWalletFromSSB(userId);
    return ssbAddr;
  }

  async function setUserAddress(userId, address, publishIfSelf) {
    const m = readAddrMap();
    m[userId] = address;
    writeAddrMap(m);
    if (publishIfSelf && idsEqual(userId, config.keys.id)) await publishSelfAddress(address);
    return true;
  }

  async function addAddress({ userId, address }) {
    if (!userId || !address || !isValidEcoinAddress(address)) return { status: "invalid" };
    const m = readAddrMap();
    const prev = m[userId];
    m[userId] = address;
    writeAddrMap(m);
    if (idsEqual(userId, config.keys.id)) await publishSelfAddress(address);
    return { status: prev ? (prev === address || (prev && prev.address === address) ? "exists" : "updated") : "added" };
  }

  async function removeAddress({ userId }) {
    if (!userId) return { status: "invalid" };
    const m = readAddrMap();
    if (!m[userId]) return { status: "not_found" };
    delete m[userId];
    writeAddrMap(m);
    return { status: "deleted" };
  }

  async function listAddressesMerged() {
    const local = readAddrMap();
    const ssbAll = await scanAllWalletsSSB();
    const keys = new Set([...Object.keys(local), ...Object.keys(ssbAll)]);
    const out = [];
    for (const id of keys) {
      if (local[id]) out.push({ id, address: typeof local[id] === "string" ? local[id] : local[id].address, source: "local" });
      else if (ssbAll[id]) out.push({ id, address: ssbAll[id], source: "ssb" });
    }
    return out;
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
      if (k === "interesting" || k === "inspiring") s += 5;
      else if (k === "boring" || k === "spam" || k === "propaganda") s -= 3;
      else s += 1;
    }
    return s;
  }

  async function listAllActions() {
    if (services?.feed?.listAll) {
      const arr = await services.feed.listAll();
      FEED_SRC = "services.feed.listAll";
      return normalizeFeedArray(arr);
    }
    if (services?.activity?.list) {
      const arr = await services.activity.list();
      FEED_SRC = "services.activity.list";
      return normalizeFeedArray(arr);
    }
    if (typeof global.listFeed === "function") {
      const arr = await global.listFeed("all");
      FEED_SRC = "global.listFeed('all')";
      return normalizeFeedArray(arr);
    }
    const ssb = await openSsb();
    if (!ssb || !ssb.createLogStream) {
      FEED_SRC = "none";
      return [];
    }
    const msgs = await new Promise((resolve, reject) =>
      pull(
        ssb.createLogStream({ limit: getLogLimit() }),
        pull.collect((err, arr) => err ? reject(err) : resolve(arr))
      )
    );
    FEED_SRC = "ssb.createLogStream";
    return msgs.map(m => {
      const v = m.value || {};
      const c = v.content || {};
      return {
        id: v.key || m.key,
        author: v.author,
        type: (c.type || "").toLowerCase(),
        value: v,
        content: c
      };
    });
  }

  function normalizeFeedArray(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(x => {
      const value = x.value || {};
      const content = x.content || value.content || {};
      const author = x.author || value.author || content.author || null;
      const type = (content.type || "").toLowerCase();
      return { id: x.id || value.key || x.key, author, type, value, content };
    });
  }

async function publishKarmaScore(userId, karmaScore) {
  const ssb = await openSsb();
  if (!ssb || !ssb.publish) return false;
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

function scoreFromActions(actions) {
  let score = 0;
  for (const action of actions) {
    const t = normalizeType(action);
    const c = action.content || {};
    if (t === "post") score += 10;
    else if (t === "comment") score += 5;
    else if (t === "like") score += 2;
    else if (t === "image") score += 8;
    else if (t === "video") score += 12;
    else if (t === "audio") score += 8;
    else if (t === "document") score += 6;
    else if (t === "bookmark") score += 2;
    else if (t === "feed") score += 6;
    else if (t === "forum") score += c.root ? 5 : 10;
    else if (t === "vote") score += 3 + calculateOpinionScore(c);
    else if (t === "votes") score += Math.min(10, Number(c.totalVotes || 0));
    else if (t === "market") score += scoreMarket(c);
    else if (t === "project") score += scoreProject(c);
    else if (t === "tribe") score += 6 + Math.min(10, Array.isArray(c.members) ? c.members.length * 0.5 : 0);
    else if (t === "event") score += 4 + Math.min(10, Array.isArray(c.attendees) ? c.attendees.length : 0);
    else if (t === "task") score += 3 + priorityBump(c.priority);
    else if (t === "report") score += 4 + (Array.isArray(c.confirmations) ? c.confirmations.length : 0) + severityBump(c.severity);
    else if (t === "curriculum") score += 5;
    else if (t === "aiexchange") score += Array.isArray(c.ctx) ? Math.min(10, c.ctx.length) : 0;
    else if (t === "job") score += 4 + (Array.isArray(c.subscribers) ? c.subscribers.length : 0);
    else if (t === "bankclaim") score += Math.min(20, Math.log(1 + Math.max(0, Number(c.amount) || 0)) * 5);
    else if (t === "bankwallet") score += 2;
    else if (t === "transfer") score += 1;
    else if (t === "about") score += 1;
    else if (t === "contact") score += 1;
    else if (t === "pub") score += 1;
  }
  return Math.max(0, Math.round(score));
}

async function getUserEngagementScore(userId) {
  const ssb = await openSsb();
  const uid = resolveUserId(userId);
  const actions = await fetchUserActions(uid);
  const karmaScore = scoreFromActions(actions);

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
 
  function computePoolVars(pubBal, rules) {
    const alphaCap = (rules.alpha || DEFAULT_RULES.alpha) * pubBal;
    const available = Math.max(0, pubBal - (rules.reserveMin || DEFAULT_RULES.reserveMin));
    const rawMin = Math.min(available, (rules.capPerEpoch || DEFAULT_RULES.capPerEpoch), alphaCap);
    const pool = clamp(rawMin, 0, Number.MAX_SAFE_INTEGER);
    return { pubBal, alphaCap, available, rawMin, pool };
  }

  async function computeEpoch({ epochId, userId, rules = DEFAULT_RULES }) {
    const pubBal = await safeGetBalance("pub");
    const pv = computePoolVars(pubBal, rules);
    const engagementScore = await getUserEngagementScore(userId);
    const userWeight = 1 + engagementScore / 100;
    const weights = [{ user: userId, w: userWeight }];
    const W = weights.reduce((acc, x) => acc + x.w, 0) || 1;
    const capUser = (rules.caps && rules.caps.cap_user_epoch) || DEFAULT_RULES.caps.cap_user_epoch;
    const allocations = weights.map(({ user, w }) => {
      const amount = Math.min(pv.pool * w / W, capUser);
      return {
        id: `alloc:${epochId}:${user}`,
        epoch: epochId,
        user,
        weight: Number(w.toFixed(6)),
        amount: Number(amount.toFixed(6))
      };
    });
    const snapshot = JSON.stringify({ epochId, pool: pv.pool, weights, allocations, rules }, null, 2);
    const hash = crypto.createHash("sha256").update(snapshot).digest("hex");
    return { epoch: { id: epochId, pool: Number(pv.pool.toFixed(6)), weightsSum: Number(W.toFixed(6)), rules, hash }, allocations };
  }

  async function executeEpoch({ epochId, rules = DEFAULT_RULES }) {
    const { epoch, allocations } = await computeEpoch({ epochId, userId: config.keys.id, rules });
    await epochsRepo.save(epoch);
    for (const a of allocations) {
      if (a.amount <= 0) continue;
      await transfersRepo.create({
        id: a.id,
        from: "PUB",
        to: a.user,
        amount: a.amount,
        concept: `UBI ${epochId}`,
        status: "UNCONFIRMED",
        createdAt: new Date().toISOString(),
        deadline: new Date(Date.now() + DEFAULT_RULES.graceDays * 86400000).toISOString(),
        tags: ["UBI", `epoch:${epochId}`],
        opinions: {}
      });
    }
    return { epoch, allocations };
  }

  async function publishBankClaim({ amount, epochId, allocationId, txid }) {
    const ssbClient = await openSsb();
    const content = { type: "bankClaim", amount, epochId, allocationId, txid, timestamp: Date.now() };
    return new Promise((resolve, reject) => ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res)));
  }

  async function claimAllocation({ transferId, claimerId, pubWalletUrl, pubWalletUser, pubWalletPass }) {
    const allocation = await transfersRepo.findById(transferId);
    if (!allocation || allocation.status !== "UNCONFIRMED") throw new Error("Invalid allocation or already confirmed.");
    if (allocation.to !== claimerId) throw new Error("This allocation is not for you.");
    const txid = await rpcCall("sendtoaddress", [pubWalletUrl, allocation.amount, "UBI claim", pubWalletUser, pubWalletPass]);
    return { txid };
  }

  async function updateAllocationStatus(allocationId, status, txid) {
    const all = await transfersRepo.listAll();
    const idx = all.findIndex(t => t.id === allocationId);
    if (idx >= 0) {
      all[idx].status = status;
      all[idx].txid = txid;
      await transfersRepo.create(all[idx]);
    }
  }

  async function listBanking(filter = "overview", userId) {
    const uid = resolveUserId(userId);
    const epochId = epochIdNow();
    const pubBalance = await safeGetBalance("pub");
    const userBalance = await safeGetBalance("user");
    const epochs = await epochsRepo.list();
    const all = await transfersRepo.listByTag("UBI");
    const allocations = all.map(t => ({
      id: t.id, concept: t.concept, from: t.from, to: t.to, amount: t.amount, status: t.status,
      createdAt: t.createdAt || t.deadline || new Date().toISOString(), txid: t.txid
    }));
    let computed = null;
    try { computed = await computeEpoch({ epochId, userId: uid, rules: DEFAULT_RULES }); } catch {}
    const pv = computePoolVars(pubBalance, DEFAULT_RULES);
    const actions = await fetchUserActions(uid);
    const engagementScore = scoreFromActions(actions);
    const poolForEpoch = computed?.epoch?.pool || pv.pool || 0;
    const futureUBI = Number(((engagementScore / 100) * poolForEpoch).toFixed(6));
    const addresses = await listAddressesMerged();
    const summary = {
      userBalance,
      pubBalance,
      epochId,
      pool: poolForEpoch,
      weightsSum: computed?.epoch?.weightsSum || 0,
      userEngagementScore: engagementScore,
      futureUBI
    };
    const exchange = await calculateEcoinValue();
    return { summary, allocations, epochs, rules: DEFAULT_RULES, addresses, exchange };
  }

  async function getAllocationById(id) {
    const t = await transfersRepo.findById(id);
    if (!t) return null;
    return { id: t.id, concept: t.concept, from: t.from, to: t.to, amount: t.amount, status: t.status, createdAt: t.createdAt || new Date().toISOString(), txid: t.txid };
  }

  async function getEpochById(id) {
    const existing = await epochsRepo.get(id);
    if (existing) return existing;
    const all = await transfersRepo.listAll();
    const filtered = all.filter(t => (t.tags || []).includes(`epoch:${id}`));
    const pool = filtered.reduce((s, t) => s + Number(t.amount || 0), 0);
    return { id, pool, weightsSum: 0, rules: DEFAULT_RULES, hash: "-" };
  }

  async function listEpochAllocations(id) {
    const all = await transfersRepo.listAll();
    return all.filter(t => (t.tags || []).includes(`epoch:${id}`)).map(t => ({
      id: t.id, concept: t.concept, from: t.from, to: t.to, amount: t.amount, status: t.status, createdAt: t.createdAt || new Date().toISOString(), txid: t.txid
    }));
  }
  
  async function calculateEcoinValue() {
    let isSynced = false;
    let circulatingSupply = 0;
    try {
      circulatingSupply = await getCirculatingSupply();
      isSynced = circulatingSupply > 0;
    } catch (error) {
      circulatingSupply = 0;
      isSynced = false;
    }
    const totalSupply = 25500000;
    const ecoValuePerHour = await calculateEcoValuePerHour(circulatingSupply);
    const ecoInHours = calculateEcoinHours(circulatingSupply, ecoValuePerHour);
    const inflationFactor = await calculateInflationFactor(circulatingSupply, totalSupply);
    return {
      ecoValue: ecoValuePerHour,
      ecoInHours: Number(ecoInHours.toFixed(2)),
      totalSupply: totalSupply,
      inflationFactor: inflationFactor ? Number(inflationFactor.toFixed(2)) : 0,
      currentSupply: circulatingSupply,
      isSynced: isSynced
    };
  }

  async function calculateEcoValuePerHour(circulatingSupply) {
    const issuanceRate = await getIssuanceRate();
    const inflation = await calculateInflationFactor(circulatingSupply, 25500000);
    const ecoValuePerHour = (circulatingSupply / 100000) * (1 + inflation / 100);
    return ecoValuePerHour;
  }

  function calculateEcoinHours(circulatingSupply, ecoValuePerHour) {
    const ecoInHours = circulatingSupply / ecoValuePerHour;
    return ecoInHours;
  }

  async function calculateInflationFactor(circulatingSupply, totalSupply) {
    const issuanceRate = await getIssuanceRate();
    if (circulatingSupply > 0) {
      const inflationRate = (issuanceRate / circulatingSupply) * 100;
      return inflationRate;
    }
    return 0;
  }

  async function getIssuanceRate() {
    try {
      const result = await rpcCall("getmininginfo", []);
      const blockValue = result?.blockvalue || 0;
      const blocks = result?.blocks || 0;
      return (blockValue / 1e8) * blocks;
    } catch (error) {
      return 0.02;
    }
  }

  async function getCirculatingSupply() {
    try {
      const result = await rpcCall("getinfo", []);
      return result?.moneysupply || 0;
    } catch (error) {
      return 0; 
    }
  }
  
  async function getBankingData(userId) {
    const ecoValue = await calculateEcoinValue();
    const karmaScore = await getUserEngagementScore(userId);
    return {
      ecoValue,
      karmaScore,
    };
  }

  return {
    DEFAULT_RULES,
    computeEpoch,
    executeEpoch,
    getUserEngagementScore,
    publishBankClaim,
    claimAllocation,
    listBanking,
    getAllocationById,
    getEpochById,
    listEpochAllocations,
    addAddress,
    removeAddress,
    ensureSelfAddressPublished,
    getUserAddress,
    setUserAddress,
    listAddressesMerged,
    calculateEcoinValue,
    getBankingData
  };
};

