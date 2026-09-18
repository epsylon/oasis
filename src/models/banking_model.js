const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const pull = require("../server/node_modules/pull-stream");
const { readTyped, CONTENT_TYPES } = require("./typed_log");
const { getConfig } = require("../configs/config-manager.js");
const { config } = require("../server/SSB_server.js");
const sharedState = require("../configs/shared-state.js");

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

const MAX_PENDING_EPOCHS = 12;

const DEFAULT_RULES = {
  epochKind: "MONTHLY",
  alpha: 0.2,
  reserveMin: 500,
  capPerEpoch: 2000,
  caps: { cap_user_epoch: 50, floor_user: 1, w_min: 0.2, w_max: 6 },
  graceDays: 30
};

const STORAGE_DIR = process.env.OASIS_BANKING_DIR || path.join(__dirname, "..", "configs");
const EPOCHS_PATH = path.join(STORAGE_DIR, "banking-epochs.json");
const TRANSFERS_PATH = path.join(STORAGE_DIR, "banking-allocations.json");
const ADDR_PATH = path.join(STORAGE_DIR, "wallet-addresses.json");
const BOOK_PATH = path.join(STORAGE_DIR, "banking-address-book.json");
const ECO_HISTORY_PATH = path.join(STORAGE_DIR, "banking-eco-history.json");
const ECO_HISTORY_MIN_GAP_MS = 5 * 60 * 1000;

const ECOIN_PER_GRAM_CO2 = 0.1;
const ECOIN_PER_DAY_OF_HISTORY = 0.001;
const ONE_DAY_MS = 86400000;
const ONE_MIB = 1024 * 1024;
const carbonGramsFromBytes = (b) => (Number(b) || 0) / ONE_MIB * 0.095;
const ecoinTaxFromGrams = (g) => (Number(g) || 0) * ECOIN_PER_GRAM_CO2;
const ecoinTaxFromBytes = (b) => ecoinTaxFromGrams(carbonGramsFromBytes(b));
const archTaxFromDays = (days) => Math.max(0, Number(days) || 0) * ECOIN_PER_DAY_OF_HISTORY;

function ensureStoreFiles() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
  if (!fs.existsSync(EPOCHS_PATH)) fs.writeFileSync(EPOCHS_PATH, "[]");
  if (!fs.existsSync(TRANSFERS_PATH)) fs.writeFileSync(TRANSFERS_PATH, "[]");
  if (!fs.existsSync(ADDR_PATH)) fs.writeFileSync(ADDR_PATH, "{}");
  if (!fs.existsSync(ECO_HISTORY_PATH)) fs.writeFileSync(ECO_HISTORY_PATH, "[]");
}

function readEcoHistory() {
  ensureStoreFiles();
  try { return JSON.parse(fs.readFileSync(ECO_HISTORY_PATH, "utf8")) || []; } catch (_) { return []; }
}

const ECO_HISTORY_TIERS = [
  { olderThanMs: 2 * ONE_DAY_MS, keepEveryMs: 60 * 60 * 1000 },
  { olderThanMs: 60 * ONE_DAY_MS, keepEveryMs: ONE_DAY_MS }
];
const ECO_HISTORY_HARD_MAX = 20000;

function compactEcoHistory(arr) {
  const now = Date.now();
  const out = [];
  let lastKeptTs = -Infinity;
  for (const s of arr) {
    const ts = Number(s.ts) || 0;
    const age = now - ts;
    const tier = ECO_HISTORY_TIERS.slice().reverse().find(t => age > t.olderThanMs);
    if (!tier || ts - lastKeptTs >= tier.keepEveryMs) { out.push(s); lastKeptTs = ts; }
  }
  return out.length > ECO_HISTORY_HARD_MAX ? out.slice(out.length - ECO_HISTORY_HARD_MAX) : out;
}

const RANGE_MS = { today: ONE_DAY_MS, week: 7 * ONE_DAY_MS, month: 30 * ONE_DAY_MS, year: 365 * ONE_DAY_MS, "5y": 5 * 365 * ONE_DAY_MS, all: Infinity };
const normalizeRange = (r) => (Object.prototype.hasOwnProperty.call(RANGE_MS, String(r || "")) ? String(r) : "today");
const filterByRange = (arr, range, key = "ts") => {
  const span = RANGE_MS[normalizeRange(range)];
  if (!Number.isFinite(span)) return arr;
  const from = Date.now() - span;
  return arr.filter(x => Number(x[key]) >= from);
};
const RANGE_ORDER = ["today", "week", "month", "year", "5y", "all"];
const widenRange = (arr, range, key = "ts") => {
  const start = Math.max(0, RANGE_ORDER.indexOf(normalizeRange(range)));
  for (let i = start; i < RANGE_ORDER.length; i++) {
    const r = RANGE_ORDER[i];
    if (filterByRange(arr, r, key).length >= 2) return r;
  }
  return normalizeRange(range);
};

function appendEcoHistory(sample) {
  ensureStoreFiles();
  let arr = readEcoHistory();
  if (!Array.isArray(arr)) arr = [];
  const last = arr[arr.length - 1];
  if (last && Number(sample.ts) - Number(last.ts) < ECO_HISTORY_MIN_GAP_MS) return arr;
  arr.push(sample);
  arr = compactEcoHistory(arr);
  try { fs.writeFileSync(ECO_HISTORY_PATH, JSON.stringify(arr)); } catch (_) {}
  return arr;
}

function epochIdNow() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
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

const rpcFailureLog = new Map();
function logRpcFailure(method, kind, reason) {
  const key = `${kind}:${method}:${reason}`;
  const now = Date.now();
  if (now - (rpcFailureLog.get(key) || 0) < 5 * 60 * 1000) return;
  rpcFailureLog.set(key, now);
  if (kind === "pub") console.warn(`[ECOin RPC] ${kind} ${method} failed: ${reason}`);
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
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
      signal: controller.signal,
    });
    if (!res.ok) {
      logRpcFailure(method, kind, `HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (data.error) {
      logRpcFailure(method, kind, data.error.message || JSON.stringify(data.error));
      return null;
    }
    return data.result;
  } catch (err) {
    logRpcFailure(method, kind, err && err.name === "AbortError" ? "timeout" : (err && err.message) || String(err));
    return null;
  } finally {
    clearTimeout(timer);
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

function readAddressBook() {
  const raw = readJson(BOOK_PATH, []);
  return Array.isArray(raw) ? raw : [];
}

function listAddressBook() {
  return readAddressBook().map(e => ({ entryId: e.id, id: e.userId || null, address: e.address, label: e.label || "", source: "book", createdAt: e.createdAt }));
}

function addAddressBookEntry({ label, address, userId }) {
  if (!isValidEcoinAddress(address)) return { status: "invalid" };
  const book = readAddressBook();
  const cleanLabel = String(label || "").trim().slice(0, 80);
  const cleanUser = /^@[A-Za-z0-9+/]+={0,2}\.ed25519$/.test(String(userId || "")) ? String(userId) : null;
  const dup = book.find(e => e.address === address && (e.label || "") === cleanLabel && (e.userId || null) === cleanUser);
  if (dup) return { status: "exists" };
  book.push({ id: crypto.randomBytes(6).toString("hex"), label: cleanLabel, address, userId: cleanUser, createdAt: new Date().toISOString() });
  writeJson(BOOK_PATH, book);
  return { status: "added" };
}

function removeAddressBookEntry(entryId) {
  const book = readAddressBook();
  const next = book.filter(e => e.id !== String(entryId || ""));
  if (next.length === book.length) return { status: "not_found" };
  writeJson(BOOK_PATH, next);
  return { status: "deleted" };
}

function getLogLimit() {
  return getConfig().ssbLogStream?.limit || 1000;
}

function isValidEcoinAddress(addr) {
  return typeof addr === "string" && /^E[1-9A-HJ-NP-Za-km-z]{32,34}$/.test(addr);
}

function getWalletCfg(kind) {
  const cfg = getConfig() || {};
  if (kind === "pub") {
    if (!isPubNode()) return null;
    return cfg.wallet || null;
  }
  return cfg.wallet || null;
}

function isPubNode() {
  const cfg = getConfig() || {};
  return config?.pub === true && !!(cfg.wallet && cfg.wallet.url) && !!config?.keys?.id;
}

function getDefaultPubId() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "configs", "snh-invite-code.json"), "utf8"));
    const m = String(raw.code || "").match(/(@[A-Za-z0-9+/]+={0,2}\.ed25519)/);
    return m ? m[1] : "";
  } catch (_) { return ""; }
}
const PUB_DISCOVERY_TTL_MS = 60 * 1000;
const PUB_ANNOUNCE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const PUB_ANNOUNCE_REFRESH_MS = 12 * 60 * 60 * 1000;
const CLAIMANT_MIN_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const REBALANCE_MIN_CLAIMANTS = 3;
const REBALANCE_MAX_PER_EPOCH = 200;
const REBALANCE_PAYOUT_RATIO = 0.5;
const REBALANCE_CONCEPT = "OASIS UBI Rebalance";
const UBI_PAYMENT_CONCEPT = "UBI - ";
const UBI_PAYMENT_PREFIXES = ["UBI - ", "OASIS UBI Payment"];
const isUbiPayoutConcept = (c) => UBI_PAYMENT_PREFIXES.some(p => String(c || "").startsWith(p));
const TXID_RE = /\b([0-9a-f]{64})\b/i;
const OWN_SCORE_CAP = 200;
const RECEIVED_AUTHOR_MIN_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const NEGATIVE_OPINIONS = new Set(["boring", "spam", "propaganda"]);
const ACTIONS_CACHE_TTL_MS = 60 * 1000;

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

  const BANKING_TYPES = ["wallet", "karmaScore", "ubiClaim", "ubiClaimResult", "ubiAllocation", "ubiRefuse", "pubAvailability", "tombstone"];

  async function scanLogStream() {
    const ssb = await openSsb();
    if (!ssb) return [];
    return readTyped(ssb, BANKING_TYPES, { limit: getLogLimit(), withWindow: true });
  }

  const isWalletMessage = (c) => !!c && typeof c.address === "string" && isValidEcoinAddress(c.address) &&
    ((c.type === "wallet" && c.coin === "ECO") || c.type === "bankWallet");

  async function scanWalletMessages() {
    const ssb = await openSsb();
    if (!ssb) return [];
    const msgs = await readTyped(ssb, ["wallet", "bankWallet"], { limit: Math.max(getLogLimit(), 20000) });
    return msgs.slice().sort((a, b) => ((b.value && b.value.timestamp) || 0) - ((a.value && a.value.timestamp) || 0));
  }

  async function getWalletFromSSB(userId) {
    const msgs = await scanWalletMessages();
    for (const m of msgs) {
      const v = m.value || {};
      if (v.author === userId && isWalletMessage(v.content)) return v.content.address;
    }
    return null;
  }

  async function hasPublishedAddress(userId) {
    return !!(await getWalletFromSSB(userId));
  }

  async function scanAllWalletsSSB() {
    const latest = {};
    const msgs = await scanWalletMessages();
    for (const m of msgs) {
      const v = m.value || {};
      const c = v.content || {};
      if (isWalletMessage(c) && !latest[v.author]) latest[v.author] = c.address;
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
    if (v === "__removed__") return null;
    const local = typeof v === "string" ? v : (v && v.address) || null;
    if (local) return local;
    const ssbAddr = await getWalletFromSSB(userId);
    return ssbAddr;
  }

  async function setUserAddress(userId, address, publishIfSelf) {
    if (!userId || !isValidEcoinAddress(address)) return false;
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
    const hadLocal = !!m[userId] && m[userId] !== "__removed__";
    const ssbAll = await scanAllWalletsSSB();
    if (ssbAll[userId]) {
      m[userId] = "__removed__";
      writeAddrMap(m);
      return { status: "deleted" };
    }
    if (hadLocal) {
      delete m[userId];
      writeAddrMap(m);
      return { status: "deleted" };
    }
    return { status: "not_found" };
  }

  async function listAddressesMerged() {
    const local = readAddrMap();
    const ssbAll = await scanAllWalletsSSB();
    const keys = new Set([...Object.keys(local), ...Object.keys(ssbAll)]);
    const out = [];
    for (const id of keys) {
      if (local[id] === "__removed__") continue;
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
      if (k === "interesting" || k === "inspiring") s += 5;
      else if (k === "boring" || k === "spam" || k === "propaganda") s -= 3;
      else s += 1;
    }
    return s;
  }

  let actionsCache = null;
  async function listAllActions() {
    const ssb = await openSsb();
    if (!ssb) {
      FEED_SRC = "none";
      return [];
    }
    const ownSeq = await ownFeedSeq(ssb);
    if (actionsCache && actionsCache.ownSeq === ownSeq && Date.now() - actionsCache.ts < ACTIONS_CACHE_TTL_MS) return actionsCache.value;
    const msgs = await readTyped(ssb, CONTENT_TYPES, { limit: Math.max(getLogLimit(), 20000) });
    FEED_SRC = "messagesByType";
    const value = msgs.map(m => {
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
  else if (t === "shop" || t === "shopproduct") return 6;
  else if (t === "shop-purchase") return 2;
  else if (t === "pad" || t === "padentry") return 3;
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

function receivedScoreFor(userId, actions) {
  const nowMs = Date.now();
  const mine = new Set();
  const firstTs = new Map();
  for (const a of actions) {
    if (!a.author) continue;
    const ts = Number(a.value?.timestamp) || 0;
    if (ts && (!firstTs.has(a.author) || ts < firstTs.get(a.author))) firstTs.set(a.author, ts);
    if (a.author === userId && a.id) mine.add(a.id);
  }
  const seen = new Set();
  const perTarget = new Map();
  let score = 0;
  const add = (author, kind, target, pts, ts, capPerTarget = Infinity) => {
    const k = `${kind}:${author}:${target}`;
    if (seen.has(k)) return;
    const n = perTarget.get(`${kind}:${target}`) || 0;
    if (n >= capPerTarget) return;
    seen.add(k);
    perTarget.set(`${kind}:${target}`, n + 1);
    score += pts * decayFor(ts, nowMs);
  };
  for (const a of actions) {
    const b = a.author;
    if (!b || b === userId) continue;
    if (!firstTs.has(b) || nowMs - firstTs.get(b) < RECEIVED_AUTHOR_MIN_AGE_MS) continue;
    const c = a.content || {};
    const type = String(c.type || "");
    const ts = a.value?.timestamp;
    if (/Opinion$/.test(type) && type !== "pollOpinion" && mine.has(c.target)) add(b, "opinion", c.target, NEGATIVE_OPINIONS.has(String(c.category || "").toLowerCase()) ? -3 : 3, ts);
    else if (type === "vote" && c.vote && mine.has(c.vote.link)) add(b, "opinion", c.vote.link, Number(c.vote.value) > 0 ? 3 : -3, ts);
    else if (type === "feed-action" && c.action === "vote" && mine.has(c.root || c.target)) add(b, "opinion", c.root || c.target, 3, ts);
    else if (type === "feed-action" && c.action === "comment" && mine.has(c.root)) add(b, "comment", c.root, 2, ts, 10);
    else if (type === "feed-action" && c.action === "refeed" && mine.has(c.root)) add(b, "refeed", c.root, 2, ts, 10);
    else if (type === "post" && c.root && mine.has(c.root)) add(b, "comment", c.root, 2, ts, 10);
    else if (type === "contact" && c.following === true && c.contact === userId) add(b, "follow", userId, 2, ts);
    else if (type === "marketPurchase" && mine.has(c.target)) add(b, "purchase", c.target, 5, ts);
    else if (type === "shop-purchase" && c.seller === userId) add(b, "purchase", c.productId || a.id, 5, ts);
    else if (type === "schoolEnroll" && c.value === true && mine.has(c.courseId)) add(b, "enroll", c.courseId, 5, ts);
    else if (type === "transferConfirm" && mine.has(c.target)) add(b, "confirm", c.target, 3, ts);
  }
  return Math.max(0, Math.round(score));
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

async function getBytesForUser(userId) {
  const ssb = await openSsb();
  if (!ssb || !userId) return 0;
  return new Promise((resolve) => {
    let bytes = 0;
    pull(
      ssb.createUserStream({ id: userId }),
      pull.drain(
        (m) => { try { bytes += Buffer.byteLength(JSON.stringify(m && m.value), 'utf8'); } catch (_) {} },
        () => resolve(bytes)
      )
    );
  });
}

let _ecoTaxStatsCache = null;
const ECO_TAX_STATS_TTL_MS = 60 * 1000;

async function calculateEcoTaxStatsInternal() {
  const ssb = await (async () => {
    try { return await openSsb(); } catch (_) { return null; }
  })();
  if (!ssb) return null;
  return new Promise((resolve) => {
    let totalBytes = 0;
    let totalBlocks = 0;
    let maxBlockBytes = 0;
    let oldestTs = Infinity;
    let newestTs = 0;
    pull(
      ssb.createLogStream({}),
      pull.drain(
        (m) => {
          try {
            const v = m && m.value;
            if (!v) return;
            totalBlocks += 1;
            const size = Buffer.byteLength(JSON.stringify(v), 'utf8');
            totalBytes += size;
            if (size > maxBlockBytes) maxBlockBytes = size;
            const ts = Number(v.timestamp || 0);
            if (ts && ts < oldestTs) oldestTs = ts;
            if (ts && ts > newestTs) newestTs = ts;
          } catch (_) {}
        },
        () => {
          const totalGramsCO2 = carbonGramsFromBytes(totalBytes);
          const totalEcoinTax = ecoinTaxFromGrams(totalGramsCO2);
          const spanMs = (newestTs && oldestTs && oldestTs !== Infinity) ? Math.max(1, newestTs - oldestTs) : 1;
          const spanDays = spanMs / 86400000;
          const annualEcoinTax = spanDays > 0 ? totalEcoinTax * (365 / spanDays) : totalEcoinTax;
          const monthlyEcoinTax = annualEcoinTax / 12;
          try { sharedState.setMaxBlockBytes(maxBlockBytes); } catch (_) {}
          const ecoTaxes = {
            lifetime: Number(totalEcoinTax.toFixed(6)),
            annual: Number(annualEcoinTax.toFixed(6)),
            monthly: Number(monthlyEcoinTax.toFixed(6))
          };
          const archLifetime = archTaxFromDays(spanDays);
          const archAnnual = archTaxFromDays(365);
          const archMonthly = archTaxFromDays(365 / 12);
          const archTaxes = {
            lifetime: Number(archLifetime.toFixed(6)),
            annual: Number(archAnnual.toFixed(6)),
            monthly: Number(archMonthly.toFixed(6))
          };
          const byType = { eco: ecoTaxes, arch: archTaxes };
          const totals = {
            lifetimeEcoinTax: Number(Object.values(byType).reduce((s, t) => s + (t.lifetime || 0), 0).toFixed(6)),
            annualEcoinTax: Number(Object.values(byType).reduce((s, t) => s + (t.annual || 0), 0).toFixed(6)),
            monthlyEcoinTax: Number(Object.values(byType).reduce((s, t) => s + (t.monthly || 0), 0).toFixed(6))
          };
          resolve({
            totalBlocks,
            totalBytes,
            maxBlockBytes,
            totalGramsCO2: Number(totalGramsCO2.toFixed(6)),
            totalEcoinTax: ecoTaxes.lifetime,
            annualEcoinTax: ecoTaxes.annual,
            monthlyEcoinTax: ecoTaxes.monthly,
            byType,
            totals,
            spanDays: Number(spanDays.toFixed(3)),
            oldestTs: oldestTs === Infinity ? 0 : oldestTs,
            newestTs,
            ecoinPerGramCO2: ECOIN_PER_GRAM_CO2,
            ecoinPerDayOfHistory: ECOIN_PER_DAY_OF_HISTORY
          });
        }
      )
    );
  });
}

async function calculateEcoTaxStats() {
  const now = Date.now();
  if (_ecoTaxStatsCache && (now - _ecoTaxStatsCache.ts) < ECO_TAX_STATS_TTL_MS) {
    return _ecoTaxStatsCache.value;
  }
  const value = await calculateEcoTaxStatsInternal().catch(() => null);
  if (value) _ecoTaxStatsCache = { ts: now, value };
  return value || {
    totalBlocks: 0, totalBytes: 0, totalGramsCO2: 0,
    totalEcoinTax: 0, annualEcoinTax: 0, monthlyEcoinTax: 0,
    byType: {
      eco: { lifetime: 0, annual: 0, monthly: 0 },
      arch: { lifetime: 0, annual: 0, monthly: 0 }
    },
    totals: { lifetimeEcoinTax: 0, annualEcoinTax: 0, monthlyEcoinTax: 0 },
    spanDays: 0, oldestTs: 0, newestTs: 0,
    ecoinPerGramCO2: ECOIN_PER_GRAM_CO2,
    ecoinPerDayOfHistory: ECOIN_PER_DAY_OF_HISTORY
  };
}

async function getUserEcoinTax(userId) {
  const bytes = await getBytesForUser(userId).catch(() => 0);
  return ecoinTaxFromBytes(bytes);
}

async function getUserFirstBlockTs(userId) {
  const ssb = await openSsb();
  if (!ssb || !userId) return 0;
  return new Promise((resolve) => {
    let first = 0;
    pull(
      ssb.createUserStream({ id: userId, limit: 1 }),
      pull.drain(
        (m) => { if (m && m.value && m.value.timestamp && !first) first = Number(m.value.timestamp); },
        () => resolve(first || 0)
      )
    );
  });
}

async function getUserArchTax(userId) {
  const firstTs = await getUserFirstBlockTs(userId).catch(() => 0);
  if (!firstTs) return 0;
  const stats = await calculateEcoTaxStats().catch(() => null);
  const newestTs = stats && Number.isFinite(stats.newestTs) && stats.newestTs > 0
    ? stats.newestTs
    : Date.now();
  const ageDays = Math.max(0, (newestTs - firstTs) / ONE_DAY_MS);
  return archTaxFromDays(ageDays);
}

let _industryModel = null;
function industryModel() {
  if (_industryModel) return _industryModel;
  if (!services || !services.cooler) return null;
  try { _industryModel = require("./industry_model")({ cooler: services.cooler }); } catch (_) { _industryModel = null; }
  return _industryModel;
}

async function getIndustryBalance(userId) {
  const uid = resolveUserId(userId);
  const industry = industryModel();
  if (!industry) return { received: 0, sent: 0, net: 0, networkTotal: 0 };
  const builds = await industry.listAllBuilds().catch(() => []);
  let production = 0;
  let earned = 0;
  for (const b of (builds || [])) {
    const est = parseFloat(b && b.estTotal);
    if (Number.isFinite(est) && est > 0) production += est;
    const mine = parseFloat(b && b.points && b.points[uid]);
    if (Number.isFinite(mine) && mine > 0) earned += mine;
  }
  return {
    received: Number(earned.toFixed(6)),
    sent: 0,
    net: Number(earned.toFixed(6)),
    networkTotal: Number(production.toFixed(6))
  };
}

async function getSchoolBalance(userId) {
  const uid = resolveUserId(userId);
  const ssb = await openSsb();
  const collect = (type) => new Promise((resolve) => {
    if (!ssb.messagesByType) return resolve([]);
    pull(ssb.messagesByType({ type }), pull.collect((err, msgs) => resolve(err ? [] : msgs)));
  });
  const [transfers, confirms] = await Promise.all([collect("transfer"), collect("transferConfirm")]);
  const confirmsByTarget = new Map();
  for (const m of confirms) {
    const c = m.value && m.value.content;
    if (!c || !c.target) continue;
    if (!confirmsByTarget.has(c.target)) confirmsByTarget.set(c.target, new Set());
    if (m.value.author) confirmsByTarget.get(c.target).add(m.value.author);
  }
  const monthKey = new Date().toISOString().slice(0, 7);
  let received = 0;
  let lifetime = 0;
  for (const m of transfers) {
    const c = m.value && m.value.content;
    if (!c || c.to !== uid) continue;
    const tags = Array.isArray(c.tags) ? c.tags.map(t => String(t).toUpperCase()) : [];
    if (!tags.includes("SCHOOL")) continue;
    const signatures = new Set(Array.isArray(c.confirmedBy) ? c.confirmedBy : []);
    if (c.from) signatures.add(c.from);
    for (const a of (confirmsByTarget.get(m.key) || [])) signatures.add(a);
    if (signatures.size < 2) continue;
    const amount = parseFloat(c.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    lifetime += amount;
    if (String(c.createdAt || "").slice(0, 7) === monthKey) received += amount;
  }
  return { received: Number(received.toFixed(6)), lifetime: Number(lifetime.toFixed(6)), net: Number(received.toFixed(6)) };
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

  function computePoolVars(pubBal, rules) {
    const alphaCap = (rules.alpha ?? DEFAULT_RULES.alpha) * pubBal;
    const available = Math.max(0, pubBal - (rules.reserveMin ?? DEFAULT_RULES.reserveMin));
    const rawMin = Math.min(available, (rules.capPerEpoch ?? DEFAULT_RULES.capPerEpoch), alphaCap);
    const pool = clamp(rawMin, 0, Number.MAX_SAFE_INTEGER);
    return { pubBal, alphaCap, available, rawMin, pool };
  }

  async function computeEpoch({ epochId, userId, rules = DEFAULT_RULES }) {
    const pubBal = await safeGetBalance("pub");
    const pv = computePoolVars(pubBal, rules);
    const addresses = await listAddressesMerged();
    const eligible = addresses.filter(a => a.address && isValidEcoinAddress(a.address));
    const capUser = rules.caps?.cap_user_epoch ?? DEFAULT_RULES.caps.cap_user_epoch;
    const wMin = rules.caps?.w_min ?? DEFAULT_RULES.caps.w_min;
    const wMax = rules.caps?.w_max ?? DEFAULT_RULES.caps.w_max;
    const floorUbi = rules.caps?.floor_user ?? DEFAULT_RULES.caps.floor_user ?? 1;
    const weights = [];
    for (const entry of eligible) {
      const score = await getUserEngagementScore(entry.id);
      weights.push({ user: entry.id, w: clamp(1 + score / 100, wMin, wMax) });
    }
    if (!weights.length && userId) {
      const score = await getUserEngagementScore(userId);
      weights.push({ user: userId, w: clamp(1 + score / 100, wMin, wMax) });
    }
    const W = weights.reduce((acc, x) => acc + x.w, 0) || 1;
    const allocations = [];
    for (const { user, w } of weights) {
      const gross = Math.max(floorUbi, Math.min(pv.pool * w / W, capUser));
      const surplus = Math.max(0, gross - floorUbi);
      const userEcoTax = await getUserEcoinTax(user).catch(() => 0);
      const userArchTax = await getUserArchTax(user).catch(() => 0);
      const userTotalTax = userEcoTax + userArchTax;
      const taxedSurplus = Math.max(0, surplus - userTotalTax);
      const amount = floorUbi + taxedSurplus;
      allocations.push({
        id: `alloc:${epochId}:${user}`,
        epoch: epochId,
        user,
        weight: Number(w.toFixed(6)),
        gross: Number(gross.toFixed(6)),
        ecoTax: Number((userEcoTax || 0).toFixed(6)),
        archTax: Number((userArchTax || 0).toFixed(6)),
        totalTax: Number((userTotalTax || 0).toFixed(6)),
        amount: Number(amount.toFixed(6))
      });
    }
    const snapshot = JSON.stringify({ epochId, pool: pv.pool, weights, allocations, rules }, null, 2);
    const hash = crypto.createHash("sha256").update(snapshot).digest("hex");
    return { epoch: { id: epochId, pool: Number(pv.pool.toFixed(6)), weightsSum: Number(W.toFixed(6)), rules, hash }, allocations };
  }

  async function executeEpoch({ epochId, rules = DEFAULT_RULES } = {}) {
    const eid = epochId || epochIdNow();
    await expireOldAllocations();
    const existing = await epochsRepo.get(eid);
    if (existing) return { epoch: existing, allocations: await transfersRepo.listByTag(`epoch:${eid}`) };
    const { epoch, allocations } = await computeEpoch({ epochId: eid, userId: config.keys.id, rules });
    await epochsRepo.save(epoch);
    for (const a of allocations) {
      if (a.amount <= 0) continue;
      const record = {
        id: a.id,
        from: config.keys.id,
        to: a.user,
        amount: a.amount,
        ecoTax: a.ecoTax,
        archTax: a.archTax,
        totalTax: a.totalTax,
        concept: `${UBI_PAYMENT_CONCEPT}${eid}`,
        status: "UNCLAIMED",
        createdAt: new Date().toISOString(),
        deadline: new Date(Date.now() + ((rules.graceDays ?? DEFAULT_RULES.graceDays) * 86400000)).toISOString(),
        tags: ["UBI", `epoch:${eid}`],
        opinions: {}
      };
      await transfersRepo.create(record);
      try { await publishUbiAllocation(record); } catch (_) {}
    }
    return { epoch, allocations };
  }

  async function publishBankClaim({ amount, epochId, allocationId, txid }) {
    const ssbClient = await openSsb();
    const content = { type: "bankClaim", amount, epochId, allocationId, txid, timestamp: Date.now() };
    return new Promise((resolve, reject) => ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res)));
  }

  async function claimAllocation({ transferId, claimerId, forcePub = false }) {
    const allocation = await transfersRepo.findById(transferId);
    if (!allocation || (allocation.status !== "UNCLAIMED" && allocation.status !== "UNCONFIRMED")) throw new Error("Invalid allocation or already claimed.");
    if (claimerId && allocation.to !== claimerId) throw new Error("This allocation is not for you.");
    const addr = await getUserAddress(allocation.to);
    if (!addr || !isValidEcoinAddress(addr)) throw new Error("No valid ECOin address registered.");
    const txid = await rpcCall("sendtoaddress", [addr, allocation.amount, "OASIS UBI Payment"], "pub");
    if (!txid) throw new Error("RPC sendtoaddress failed. Check PUB wallet configuration.");
    await transfersRepo.markClosed(transferId, txid);
    const epochId = String((allocation.tags || []).find(t => String(t).startsWith("epoch:")) || "").replace(/^epoch:/, "") || epochIdNow();
    console.log(`[UBI] paid ${allocation.amount} ECO to ${String(allocation.to).slice(0, 12)}… (${epochId}) tx ${txid}`);
    try { await publishUbiClaimResult(transferId, epochId, txid, allocation.to, allocation.amount); } catch (_) {}
    try { await publishUbiTransfer({ to: allocation.to, amount: allocation.amount, epochId, txid }); } catch (_) {}
    return { txid };
  }

  async function publishUbiTransfer({ to, amount, epochId, txid }) {
    const ssb = await openSsb();
    if (!ssb || !ssb.publish) return;
    const now = new Date().toISOString();
    const content = {
      type: "transfer",
      from: config.keys.id,
      to,
      concept: `${UBI_PAYMENT_CONCEPT}${epochId}`,
      amount: Number(amount).toFixed(6),
      category: "ECONOMIC",
      createdAt: now,
      updatedAt: now,
      deadline: null,
      confirmedBy: [config.keys.id],
      status: "UNCONFIRMED",
      tags: ["UBI", `epoch:${epochId}`],
      opinions: {},
      opinions_inhabitants: [],
      txid
    };
    const published = await new Promise((resolve, reject) => ssb.publish(content, (err, msg) => err ? reject(err) : resolve(msg)));
    if (services && typeof services.notifyUbiPaid === "function") {
      try { await services.notifyUbiPaid({ to, amount: Number(amount).toFixed(6), epochId, txid, transferKey: published && published.key ? published.key : null }); } catch (_) {}
    }
    return published;
  }

  async function claimUBI(userId) {
    const uid = resolveUserId(userId);
    const epochId = epochIdNow();
    const pubId = await resolvePubId();
    if (!pubId) throw new Error("no_pub_configured");
    const alreadyClaimed = await hasClaimedThisMonth(uid);
    if (alreadyClaimed) throw new Error("already_claimed");
    const ssb = await openSsb();
    if (!ssb || !ssb.publish) throw new Error("ssb_unavailable");
    const now = new Date().toISOString();
    const claimContent = { type: "ubiClaim", pubId, epochId, claimedAt: now };
    await new Promise((resolve, reject) => ssb.publish(claimContent, (err, res) => err ? reject(err) : resolve(res)));
    return { status: "claimed_pending", epochId };
  }

  async function updateAllocationStatus(allocationId, status, txid) {
    if (status === "CLOSED") {
      await transfersRepo.markClosed(allocationId, txid);
      return;
    }
    ensureStoreFiles();
    const all = readJson(TRANSFERS_PATH, []);
    const idx = all.findIndex(t => t.id === allocationId);
    if (idx >= 0) {
      all[idx].status = status;
      if (txid) all[idx].txid = txid;
      writeJson(TRANSFERS_PATH, all);
    }
  }

  async function hasRefusedThisMonth(userId) {
    const epochId = epochIdNow();
    const msgs = await scanLogStream();
    return msgs.some(m => m.value && m.value.author === userId && m.value.content && m.value.content.type === "ubiRefuse" && m.value.content.epochId === epochId);
  }

  async function refuseUBI(userId) {
    const uid = resolveUserId(userId);
    const epochId = epochIdNow();
    if (await hasClaimedThisMonth(uid)) throw new Error("already_claimed");
    if (await hasRefusedThisMonth(uid)) throw new Error("already_refused");
    const pubId = await resolvePubId();
    const ssb = await openSsb();
    if (!ssb || !ssb.publish) throw new Error("ssb_unavailable");
    const content = { type: "ubiRefuse", pubId, epochId, refusedAt: new Date().toISOString() };
    await new Promise((resolve, reject) => ssb.publish(content, (err, res) => err ? reject(err) : resolve(res)));
    return { status: "refused", epochId };
  }

  async function claimAvailability(userId) {
    const uid = resolveUserId(userId);
    if (isPubNode()) return { available: false, reason: "pub" };
    const pub = await discoverUbiPub();
    if (!pub.pubId || !pub.available) return { available: false, reason: "no_pub" };
    const address = await getUserAddress(uid);
    const cfg = getWalletCfg("user") || {};
    if (!address || !isValidEcoinAddress(address) || !cfg.url) return { available: false, reason: "no_wallet" };
    if (await hasClaimedThisMonth(uid)) return { available: false, reason: "claimed" };
    if (await hasRefusedThisMonth(uid)) return { available: false, reason: "refused" };
    return { available: true, epochId: epochIdNow(), pubId: pub.pubId };
  }

  async function hasClaimedThisMonth(userId) {
    const epochId = epochIdNow();
    const msgs = await scanLogStream();
    for (const m of msgs) {
      const v = m.value || {};
      const c = v.content || {};
      if (c.type === "ubiClaimResult" && c.userId === userId && c.epochId === epochId) return true;
      if (c.type === "ubiClaim" && v.author === userId && c.epochId === epochId) return true;
    }
    return false;
  }

  async function getUbiClaimHistory(userId) {
    const msgs = await scanLogStream();
    let lastClaimedDate = null;
    let totalClaimed = 0;
    let claimCount = 0;
    for (const m of msgs) {
      const v = m.value || {};
      const c = v.content || {};
      if (c.type === "ubiClaimResult" && c.userId === userId) {
        totalClaimed += Number(c.amount) || 0;
        claimCount += 1;
        const d = c.processedAt || null;
        if (d && (!lastClaimedDate || d > lastClaimedDate)) lastClaimedDate = d;
      }
    }
    return { lastClaimedDate, totalClaimed: Number(totalClaimed.toFixed(6)), claimCount };
  }

  async function getUbiAllocationsFromSSB() {
    const pubId = isPubNode() ? config.keys.id : await resolvePubId();
    if (!pubId) return [];
    const msgs = await scanLogStream();
    const out = [];
    for (const m of msgs) {
      const v = m.value || {};
      const c = v.content || {};
      if (v.author === pubId && c && c.type === "ubiAllocation") {
        out.push({
          id: c.allocationId,
          from: pubId,
          to: c.to,
          amount: c.amount,
          concept: c.concept,
          epochId: c.epochId,
          status: c.status || "UNCLAIMED",
          createdAt: c.createdAt || new Date().toISOString()
        });
      }
    }
    return out;
  }

  let lastAnnounce = null;
  async function loadLastAnnounce(ssb) {
    if (lastAnnounce) return lastAnnounce;
    const msgs = await readTyped(ssb, ["pubAvailability"], { limit: Math.max(getLogLimit(), 5000) });
    let best = { available: null, timestamp: 0 };
    for (const m of msgs) {
      const v = m.value || {};
      const c = v.content || {};
      if (v.author !== config.keys.id || !c || c.type !== "pubAvailability") continue;
      const ts = Number(c.timestamp) || 0;
      if (ts > best.timestamp) best = { available: !!c.available, timestamp: ts, balance: Number(c.balance) || 0 };
    }
    lastAnnounce = best;
    return lastAnnounce;
  }

  async function scanUbiAnnouncements() {
    const ssb = await openSsb();
    if (!ssb) return new Map();
    const msgs = await readTyped(ssb, ["pubAvailability"], { limit: Math.max(getLogLimit(), 5000) });
    const latestByPub = new Map();
    for (const m of msgs) {
      const v = m.value || {};
      const c = v.content || {};
      if (!c || c.type !== "pubAvailability" || c.coin !== "ECO") continue;
      const ts = Number(c.timestamp) || Number(v.timestamp) || 0;
      const prev = latestByPub.get(v.author);
      if (!prev || ts > prev.timestamp) latestByPub.set(v.author, { pubId: v.author, available: !!c.available, timestamp: ts, balance: Number(c.balance) || 0, pool: Number(c.pool) || 0, address: isValidEcoinAddress(c.address) ? String(c.address) : null });
    }
    return latestByPub;
  }

  async function listUbiPubsDetailed() {
    const pubs = await listUbiPubs();
    if (!pubs.length) return [];
    const ssb = await openSsb();
    const { transfers } = ssb ? await readUbiLedger(ssb) : { transfers: [] };
    const defaultPubId = getDefaultPubId();
    const connected = (await discoverUbiPub()).pubId;
    return pubs.map(p => {
      const payouts = transfers.filter(t => t.author === p.pubId && isUbiPayoutConcept(t.concept));
      const lastPayoutAt = payouts.reduce((acc, t) => Math.max(acc, Date.parse(t.createdAt || "") || 0), 0);
      const paidOut = payouts.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
      const address = p.address || null;
      return { ...p, address, lastPayoutAt, paidOut: Number(paidOut.toFixed(6)), payouts: payouts.length, isDefault: p.pubId === defaultPubId, isConnected: p.pubId === connected };
    });
  }

  async function listUbiCharts() {
    const ssb = await openSsb();
    if (!ssb) return { monthly: [], pool: [] };
    const { transfers } = await readUbiLedger(ssb);
    const byMonth = new Map();
    for (const t of transfers) {
      if (!isUbiPayoutConcept(t.concept)) continue;
      const month = (String(t.concept).match(/(\d{4}-\d{2})/) || [])[1] || String(t.createdAt || "").slice(0, 7);
      if (!month) continue;
      const cur = byMonth.get(month) || { month, amount: 0, count: 0 };
      cur.amount += Number(t.amount) || 0;
      cur.count += 1;
      byMonth.set(month, cur);
    }
    const monthly = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({ ...m, amount: Number(m.amount.toFixed(6)) }));
    const pubId = (await discoverUbiPub()).pubId;
    const msgs = pubId ? await readTyped(ssb, ["pubAvailability"], { limit: Math.max(getLogLimit(), 5000) }) : [];
    const pool = msgs
      .filter(m => m.value && m.value.author === pubId && m.value.content && m.value.content.type === "pubAvailability")
      .map(m => ({ ts: Number(m.value.content.timestamp) || Number(m.value.timestamp) || 0, balance: Number(m.value.content.balance) || 0 }))
      .filter(x => x.ts > 0)
      .sort((a, b) => a.ts - b.ts)
      .slice(-120);
    return { monthly, pool };
  }

  async function listWealthSeries(range = "all", explicit = true) {
    const ssb = await openSsb();
    if (!ssb) return { points: [], totals: { distributed: 0, taxes: 0 } };
    const { transfers } = await readUbiLedger(ssb);
    const allocs = await readTyped(ssb, ["ubiAllocation"], { limit: Math.max(getLogLimit(), 20000) });
    const events = [];
    for (const t of transfers) {
      if (!isUbiPayoutConcept(t.concept)) continue;
      const ts = Date.parse(t.createdAt || "") || 0;
      if (ts) events.push({ ts, distributed: Number(t.amount) || 0, taxes: 0 });
    }
    for (const m of allocs) {
      const c = m.value && m.value.content;
      if (!c || c.type !== "ubiAllocation") continue;
      const ts = Date.parse(c.createdAt || "") || Number(m.value.timestamp) || 0;
      if (ts) events.push({ ts, distributed: 0, taxes: Number(c.totalTax) || 0 });
    }
    events.sort((a, b) => a.ts - b.ts);
    const totals = events.reduce((acc, e) => ({ distributed: acc.distributed + e.distributed, taxes: acc.taxes + e.taxes }), { distributed: 0, taxes: 0 });
    totals.distributed = Number(totals.distributed.toFixed(6));
    totals.taxes = Number(totals.taxes.toFixed(6));
    const effective = explicit ? normalizeRange(range) : widenRange(events, range);
    const inRange = filterByRange(events, effective);
    const bucketMs = effective === "today" ? 60 * 60 * 1000 : (effective === "week" || effective === "month") ? ONE_DAY_MS : 0;
    const bucketOf = (ts) => {
      if (bucketMs) return Math.floor(ts / bucketMs) * bucketMs;
      const d = new Date(ts);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    };
    const buckets = new Map();
    for (const e of inRange) {
      const b = bucketOf(e.ts);
      const cur = buckets.get(b) || { ts: b, distributed: 0, taxes: 0 };
      cur.distributed += e.distributed;
      cur.taxes += e.taxes;
      buckets.set(b, cur);
    }
    const points = Array.from(buckets.values()).sort((a, b) => a.ts - b.ts).map(p => ({ ts: p.ts, distributed: Number(p.distributed.toFixed(6)), taxes: Number(p.taxes.toFixed(6)) })).slice(-240);
    return { points, totals, range: effective, hasAnyData: events.length >= 1, bucket: bucketMs === 60 * 60 * 1000 ? "hour" : bucketMs ? "day" : "month" };
  }

  async function listKarmaHistory(userId) {
    const ssb = await openSsb();
    if (!ssb) return [];
    const uid = resolveUserId(userId);
    const msgs = await readTyped(ssb, ["karmaScore"], { limit: Math.max(getLogLimit(), 5000) });
    return msgs
      .filter(m => m.value && m.value.author === uid && m.value.content && m.value.content.type === "karmaScore")
      .map(m => ({ ts: Date.parse(m.value.content.timestamp || "") || Number(m.value.timestamp) || 0, score: Number(m.value.content.karmaScore) || 0 }))
      .filter(x => x.ts > 0)
      .sort((a, b) => a.ts - b.ts)
      .slice(-120);
  }

  async function listUbiPubs() {
    const latestByPub = await scanUbiAnnouncements();
    const out = [];
    for (const cand of latestByPub.values()) {
      if (Date.now() - cand.timestamp > PUB_ANNOUNCE_MAX_AGE_MS) continue;
      out.push(cand);
    }
    return out.sort((a, b) => b.timestamp - a.timestamp);
  }

  async function publishPubAvailability() {
    if (!isPubNode()) return;
    const balance = await safeGetBalance("pub");
    const floor = Math.max(1, DEFAULT_RULES?.caps?.floor_user ?? 1);
    const available = Number(balance) >= floor;
    const ssb = await openSsb();
    if (!ssb || !ssb.publish) return;
    const last = await loadLastAnnounce(ssb);
    const stale = Date.now() - last.timestamp > PUB_ANNOUNCE_REFRESH_MS;
    const pv = computePoolVars(Number(balance) || 0, DEFAULT_RULES);
    const announcedBalance = Number(pv.available.toFixed(6));
    const balanceMoved = Math.abs(announcedBalance - (Number(last.balance) || 0)) > Math.max(1, (Number(last.balance) || 0) * 0.2);
    if (last.available === available && !stale && !balanceMoved) return available;
    const address = await getAnyWalletAddress().catch(() => null);
    const content = { type: "pubAvailability", available, coin: "ECO", balance: announcedBalance, pool: Number(pv.pool.toFixed(6)), address: isValidEcoinAddress(address) ? address : undefined, timestamp: Date.now() };
    await new Promise((resolve, reject) => ssb.publish(content, (err, res) => err ? reject(err) : resolve(res)));
    lastAnnounce = { available, timestamp: content.timestamp, balance: announcedBalance };
    console.log(`[UBI] announced ${available ? "available" : "unavailable"} (PUB wallet ${Number(balance).toFixed(6)} ECO)`);
    return available;
  }

  let discoveredPub = { pubId: "", available: false, timestamp: 0, checkedAt: 0 };
  async function discoverUbiPub() {
    if (Date.now() - discoveredPub.checkedAt < PUB_DISCOVERY_TTL_MS) return discoveredPub;
    const latestByPub = await scanUbiAnnouncements();
    const defaultPubId = getDefaultPubId();
    const fresh = (cand) => cand && Date.now() - cand.timestamp <= PUB_ANNOUNCE_MAX_AGE_MS;
    const defaultCand = latestByPub.get(defaultPubId) || null;
    let best = null;
    if (fresh(defaultCand) && defaultCand.available) best = defaultCand;
    else {
      for (const cand of latestByPub.values()) {
        if (!fresh(cand) || !cand.available) continue;
        if (!best || cand.timestamp > best.timestamp) best = cand;
      }
    }
    if (!best && defaultPubId) best = { pubId: defaultPubId, available: false, timestamp: (defaultCand && defaultCand.timestamp) || 0 };
    discoveredPub = { pubId: (best && best.pubId) || "", available: !!(best && best.available), timestamp: (best && best.timestamp) || 0, balance: (best && best.balance) || 0, pool: (best && best.pool) || 0, checkedAt: Date.now() };
    return discoveredPub;
  }

  async function resolvePubId() {
    return (await discoverUbiPub()).pubId;
  }

  async function getPubAvailabilityFromSSB() {
    const pubId = await resolvePubId();
    if (!pubId) return false;
    return (await discoverUbiPub()).available;
  }

  async function listBanking(filter = "overview", userId, opts = {}) {
    const explicitRange = !!opts.range;
    const range = normalizeRange(opts.range);
    const uid = resolveUserId(userId);
    const epochId = epochIdNow();
    let pubBalance = 0;
    let ubiAvailable = false;
    let allocations;
    if (isPubNode()) {
      pubBalance = await safeGetBalance("pub");
      const floor = Math.max(1, DEFAULT_RULES?.caps?.floor_user ?? 1);
      ubiAvailable = Number(pubBalance) >= floor;
      const all = await transfersRepo.listByTag("UBI");
      allocations = all.map(t => ({
        id: t.id, concept: t.concept, from: t.from, to: t.to, amount: t.amount, status: t.status,
        createdAt: t.createdAt || t.deadline || new Date().toISOString(), txid: t.txid
      }));
    } else {
      ubiAvailable = await getPubAvailabilityFromSSB();
      allocations = await getUbiAllocationsFromSSB();
    }
    const userBalance = await safeGetBalance("user");
    const industryBal = await getIndustryBalance(uid).catch(() => ({ received: 0, sent: 0, net: 0, networkTotal: 0 }));
    const schoolBal = await getSchoolBalance(uid).catch(() => ({ received: 0, lifetime: 0, net: 0 }));
    const epochs = await epochsRepo.list();
    let computed = null;
    try { computed = await computeEpoch({ epochId, userId: uid, rules: DEFAULT_RULES }); } catch {}
    const pv = computePoolVars(pubBalance, DEFAULT_RULES);
    const actions = await fetchUserActions(uid);
    const rawScore = scoreFromActions(actions);
    const carbonGramsForScore = await getCarbonGramsForUser(uid).catch(() => 0);
    const engagementScore = Math.max(0, Math.round(rawScore - carbonGramsForScore));
    let poolForEpoch = computed?.epoch?.pool || pv.pool || 0;
    if (!isPubNode()) {
      const info = await discoverUbiPub();
      poolForEpoch = Number(info.pool) || computePoolVars((Number(info.balance) || 0) + (DEFAULT_RULES.reserveMin || 0), DEFAULT_RULES).pool || 0;
    }
    const futureUBI = Number(((engagementScore / 100) * poolForEpoch).toFixed(6));
    const addresses = await listAddressesMerged();
    const alreadyClaimed = await hasClaimedThisMonth(uid);
    const pubId = isPubNode() ? config.keys.id : await resolvePubId();
    const pubLastSeen = isPubNode() ? (lastAnnounce ? lastAnnounce.timestamp : 0) : (await discoverUbiPub()).timestamp;
    const userAddress = await getUserAddress(uid);
    const userWalletCfg = getWalletCfg("user") || {};
    const hasValidWallet = !!(userAddress && isValidEcoinAddress(userAddress) && userWalletCfg.url);
    const addressPublished = await hasPublishedAddress(uid).catch(() => false);
    const summary = {
      userBalance,
      industryBalance: industryBal.net,
      schoolBalance: schoolBal.net,
      schoolLifetime: schoolBal.lifetime,
      industryNetworkTotal: industryBal.networkTotal,
      industryReceived: industryBal.received,
      industrySent: industryBal.sent,
      epochId,
      pool: poolForEpoch,
      weightsSum: computed?.epoch?.weightsSum || 0,
      userEngagementScore: engagementScore,
      futureUBI,
      alreadyClaimed,
      alreadyRefused: await hasRefusedThisMonth(uid).catch(() => false),
      pubId,
      wealthTotals: (await listWealthSeries("all").catch(() => ({ totals: { distributed: 0, taxes: 0 } }))).totals,
      pubLastSeen,
      pubBalance: isPubNode() ? pubBalance : null,
      addressPublished,
      hasValidWallet,
      ubiAvailability: ubiAvailable ? "OK" : "NO_FUNDS"
    };
    const exchange = await calculateEcoinValue();
    const fullHistory = readEcoHistory();
    const valueRange = explicitRange ? range : widenRange(fullHistory, range);
    const exchangeHistory = filterByRange(fullHistory, valueRange);
    const valueHasAnyData = Array.isArray(fullHistory) && fullHistory.length >= 2;
    let taxStats = null;
    let userEcoinTax = 0;
    if (filter === 'taxes' || filter === 'exchange' || filter === 'overview') {
      try { taxStats = await calculateEcoTaxStats(); } catch (_) { taxStats = null; }
      try { userEcoinTax = await getUserEcoinTax(uid); } catch (_) { userEcoinTax = 0; }
    }
    const taxRules = { ecoinPerGramCO2: ECOIN_PER_GRAM_CO2, gramsCO2PerMiB: 0.095, ecoinPerDayOfHistory: ECOIN_PER_DAY_OF_HISTORY };
    let userArchTax = 0;
    if (filter === 'taxes' || filter === 'exchange' || filter === 'overview') {
      try { userArchTax = await getUserArchTax(uid); } catch (_) { userArchTax = 0; }
    }
    const userTotalTax = (userEcoinTax || 0) + (userArchTax || 0);
    const ubiPubs = filter === 'ubi' ? await listUbiPubsDetailed().catch(() => []) : [];
    const ubiCharts = filter === 'ubi' ? await listUbiCharts().catch(() => null) : null;
    const karmaHistory = filter === 'overview' ? await listKarmaHistory(uid).catch(() => []) : [];
    const wealth = filter === 'exchange' || filter === 'overview' ? await listWealthSeries(range, explicitRange).catch(() => ({ points: [], totals: { distributed: 0, taxes: 0 } })) : { points: [], totals: { distributed: 0, taxes: 0 } };
    return {
      summary, allocations, epochs, rules: DEFAULT_RULES, taxRules, addresses, exchange, exchangeHistory, taxStats, ubiPubs, ubiCharts, karmaHistory, wealth, range, valueRange, valueHasAnyData,
      userEcoinTax: Number((userEcoinTax || 0).toFixed(6)),
      userArchTax: Number((userArchTax || 0).toFixed(6)),
      userTotalTax: Number(userTotalTax.toFixed(6))
    };
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

  let genesisTimeCache = null;

  async function getAvgBlockSeconds(blocks) {
    if (!blocks || blocks < 2) return 0;
    try {
      if (!genesisTimeCache) {
        const h1 = await rpcCall("getblockhash", [1]);
        if (!h1) return 0;
        const b1 = await rpcCall("getblock", [h1]);
        genesisTimeCache = b1?.time || null;
        if (!genesisTimeCache) return 0;
      }
      const hCur = await rpcCall("getblockhash", [blocks]);
      if (!hCur) return 0;
      const bCur = await rpcCall("getblock", [hCur]);
      const curTime = bCur?.time || 0;
      if (!curTime) return 0;
      const elapsed = curTime - genesisTimeCache;
      return elapsed > 0 ? elapsed / (blocks - 1) : 0;
    } catch (_) { return 0; }
  }

  async function getRecentBlockSeconds(blocks, window = 720) {
    if (!blocks || blocks <= window + 1) return 0;
    try {
      const hCur = await rpcCall("getblockhash", [blocks]);
      const hOld = await rpcCall("getblockhash", [blocks - window]);
      if (!hCur || !hOld) return 0;
      const bCur = await rpcCall("getblock", [hCur]);
      const bOld = await rpcCall("getblock", [hOld]);
      const elapsed = (bCur?.time || 0) - (bOld?.time || 0);
      return elapsed > 0 ? elapsed / window : 0;
    } catch (_) { return 0; }
  }

  function observedInflationFromHistory(currentSupply) {
    const hist = readEcoHistory();
    if (!Array.isArray(hist) || hist.length < 2 || !(currentSupply > 0)) return null;
    const now = Date.now();
    const windowStart = now - 30 * ONE_DAY_MS;
    const base = hist.find(s => Number(s.ts) >= windowStart && Number(s.currentSupply) > 0) || hist.find(s => Number(s.currentSupply) > 0);
    if (!base) return null;
    const spanMs = now - Number(base.ts);
    if (spanMs < 6 * 60 * 60 * 1000) return null;
    const growth = (currentSupply - Number(base.currentSupply)) / Number(base.currentSupply);
    return growth * (365 * ONE_DAY_MS / spanMs) * 100;
  }

  async function calculateEcoinValue() {
    const totalSupply = 25500000;
    let circulatingSupply = 0;
    let blocks = 0;
    let blockValueEco = 0;
    let isSynced = false;
    try {
      const info = await rpcCall("getinfo", []);
      circulatingSupply = info?.moneysupply || 0;
      blocks = info?.blocks || 0;
      isSynced = circulatingSupply > 0;
      const mining = await rpcCall("getmininginfo", []);
      blockValueEco = (mining?.blockvalue || 0) / 1e8;
    } catch (_) {}
    const recentSec = await getRecentBlockSeconds(blocks);
    const avgSec = recentSec > 0 ? recentSec : await getAvgBlockSeconds(blocks);
    const ecoValuePerHour = avgSec > 0 ? (3600 / avgSec) * blockValueEco : 0;
    const maturity = totalSupply > 0 ? circulatingSupply / totalSupply : 0;
    const ecoTimeMs = maturity * 3600 * 1000;
    const annualIssuance = ecoValuePerHour * 24 * 365;
    const inflationIssuance = circulatingSupply > 0 ? (annualIssuance / circulatingSupply) * 100 : 0;
    const inflationObserved = isSynced ? observedInflationFromHistory(circulatingSupply) : null;
    const inflationFactor = inflationObserved !== null && Number.isFinite(inflationObserved) ? inflationObserved : inflationIssuance;
    const inflationMonthly = inflationFactor / 12;
    const result = {
      ecoValue: Number(ecoValuePerHour.toFixed(6)),
      ecoTimeMs: Number(ecoTimeMs.toFixed(3)),
      totalSupply,
      inflationFactor: Number(inflationFactor.toFixed(2)),
      inflationMonthly: Number(inflationMonthly.toFixed(2)),
      inflationIssuance: Number(inflationIssuance.toFixed(2)),
      inflationObserved: inflationObserved === null ? null : Number(inflationObserved.toFixed(2)),
      currentSupply: circulatingSupply,
      isSynced
    };
    if (isSynced) {
      appendEcoHistory({
        ts: Date.now(),
        ecoValue: result.ecoValue,
        currentSupply: result.currentSupply,
        inflationFactor: result.inflationFactor,
        blockValueEco: Number(blockValueEco.toFixed(8)),
        avgBlockSec: Number((avgSec || 0).toFixed(2)),
        blocks
      });
    }
    return result;
  }

  async function getBankingData(userId) {
    const ecoValue = await calculateEcoinValue();
    const karmaScore = await getUserEngagementScore(userId);
    let estimatedUBI = 0;
    try {
      const pubBal = isPubNode() ? await safeGetBalance("pub") : 0;
      const pv = computePoolVars(pubBal, DEFAULT_RULES);
      const pool = pv.pool || 0;
      const addresses = await listAddressesMerged();
      const eligible = addresses.filter(a => a.address && isValidEcoinAddress(a.address));
      const wMin = DEFAULT_RULES.caps?.w_min ?? 0.2;
      const wMax = DEFAULT_RULES.caps?.w_max ?? 6;
      const userW = clamp(1 + karmaScore / 100, wMin, wMax);
      const otherUsers = Math.max(0, eligible.length - 1);
      const totalW = Math.max(1, userW + otherUsers);
      const cap = DEFAULT_RULES.caps?.cap_user_epoch ?? 50;
      const floor = DEFAULT_RULES.caps?.floor_user ?? 1;
      estimatedUBI = eligible.length > 0
        ? Math.max(floor, Math.min(pool * (userW / totalW), cap))
        : 0;
    } catch (_) {}
    const uid = resolveUserId(userId);
    const userEcoinTax = await getUserEcoinTax(uid).catch(() => 0);
    const userArchTax = await getUserArchTax(uid).catch(() => 0);
    const userTotalTax = userEcoinTax + userArchTax;
    const estimatedUBIBeforeTax = estimatedUBI;
    const baseFloor = DEFAULT_RULES.caps?.floor_user ?? 1;
    const surplus = Math.max(0, estimatedUBI - baseFloor);
    estimatedUBI = baseFloor + Math.max(0, surplus - userTotalTax);
    const claimHistory = await getUbiClaimHistory(userId).catch(() => ({ lastClaimedDate: null, totalClaimed: 0 }));
    return {
      ecoValue,
      karmaScore,
      estimatedUBI,
      estimatedUBIBeforeTax: Number(estimatedUBIBeforeTax.toFixed(6)),
      userEcoinTax: Number(userEcoinTax.toFixed(6)),
      userArchTax: Number(userArchTax.toFixed(6)),
      userTotalTax: Number(userTotalTax.toFixed(6)),
      lastClaimedDate: claimHistory.lastClaimedDate,
      totalClaimed: claimHistory.totalClaimed
    };
  }

  async function expireOldAllocations() {
    const cutoffMs = MAX_PENDING_EPOCHS * 30 * 86400000;
    const now = Date.now();
    const allocs = await transfersRepo.listAll();
    for (const a of allocs) {
      if ((a.status === "UNCLAIMED" || a.status === "UNCONFIRMED") &&
          (now - new Date(a.createdAt).getTime()) > cutoffMs) {
        await updateAllocationStatus(a.id, "EXPIRED");
      }
    }
  }

  async function publishUbiAllocation(allocation) {
    const ssb = await openSsb();
    if (!ssb) return;
    const epochTag = (allocation.tags || []).find(t => t.startsWith("epoch:"));
    const content = {
      type: "ubiAllocation",
      allocationId: allocation.id,
      to: allocation.to,
      amount: allocation.amount,
      ecoTax: Number(allocation.ecoTax) || 0,
      archTax: Number(allocation.archTax) || 0,
      totalTax: Number(allocation.totalTax) || 0,
      concept: allocation.concept,
      epochId: epochTag ? epochTag.slice(6) : "",
      status: "UNCLAIMED",
      createdAt: allocation.createdAt
    };
    return new Promise((resolve, reject) => ssb.publish(content, (err, res) => err ? reject(err) : resolve(res)));
  }

  async function publishUbiClaim(allocationId, epochId) {
    const ssb = await openSsb();
    if (!ssb) return;
    const content = { type: "ubiClaim", allocationId, epochId, claimedAt: new Date().toISOString() };
    return new Promise((resolve, reject) => ssb.publish(content, (err, res) => err ? reject(err) : resolve(res)));
  }

  async function publishUbiClaimResult(allocationId, epochId, txid, userId, amount) {
    const ssb = await openSsb();
    if (!ssb) return;
    const content = { type: "ubiClaimResult", allocationId, epochId, txid, userId, amount, processedAt: new Date().toISOString() };
    return new Promise((resolve, reject) => ssb.publish(content, (err, res) => err ? reject(err) : resolve(res)));
  }

  async function isEligibleClaimant(userId) {
    const addr = await getUserAddress(userId);
    if (!addr || !isValidEcoinAddress(addr)) return { ok: false, reason: "no published ECOin address" };
    const firstTs = await getUserFirstBlockTs(userId).catch(() => 0);
    if (!firstTs || Date.now() - firstTs < CLAIMANT_MIN_AGE_MS) return { ok: false, reason: "feed younger than 30 days" };
    const score = await getUserEngagementScore(userId).catch(() => 0);
    if (!(Number(score) > 0)) return { ok: false, reason: "no activity" };
    return { ok: true, address: addr, score: Number(score) };
  }

  function ubiAmountFor({ pool, userW, totalW, score, ecoTax, archTax }) {
    const floorUbi = Math.max(1, DEFAULT_RULES.caps.floor_user ?? 1);
    const capUser = DEFAULT_RULES.caps.cap_user_epoch;
    const gross = Math.max(floorUbi, Math.min(pool * userW / totalW, capUser));
    const surplus = Math.max(0, gross - floorUbi);
    const tax = (Number(ecoTax) || 0) + (Number(archTax) || 0);
    return Number((floorUbi + Math.max(0, surplus - tax)).toFixed(6));
  }

  async function processPendingClaims() {
    if (!isPubNode()) return;
    const ssb = await openSsb();
    if (!ssb) return;
    const claims = [];
    const results = [];
    await new Promise((resolve, reject) => {
      pull(ssb.messagesByType({ type: "ubiClaim", reverse: false }),
        pull.drain(msg => {
          if (msg.value?.content?.type === "ubiClaim") {
            claims.push({ ...msg.value.content, _author: msg.value.author });
          }
        },
          err => err ? reject(err) : resolve()));
    });
    await new Promise((resolve, reject) => {
      pull(ssb.messagesByType({ type: "ubiClaimResult", reverse: false }),
        pull.drain(msg => { if (msg.value?.content?.type === "ubiClaimResult") results.push(msg.value.content); },
          err => err ? reject(err) : resolve()));
    });
    const processedEpochUser = new Set(results.map(r => `${r.epochId}:${r.userId}`));
    const refused = new Set();
    await new Promise((resolve, reject) => {
      pull(ssb.messagesByType({ type: "ubiRefuse", reverse: false }),
        pull.drain(msg => { const c = msg.value?.content; if (c && c.type === "ubiRefuse") refused.add(`${c.epochId}:${msg.value.author}`); },
          err => err ? reject(err) : resolve()));
    });
    const epochId = epochIdNow();
    for (const claim of claims) {
      const claimantId = claim._author;
      if (!claimantId) continue;
      const claimEpoch = claim.epochId || epochId;
      if (processedEpochUser.has(`${claimEpoch}:${claimantId}`)) continue;
      if (refused.has(`${claimEpoch}:${claimantId}`)) { console.warn(`[UBI] claim ${claimEpoch} by ${claimantId.slice(0, 12)}… skipped: refused by the inhabitant`); continue; }
      try {
        const eligibility = await isEligibleClaimant(claimantId);
        if (!eligibility.ok) { console.warn(`[UBI] claim ${claimEpoch} by ${claimantId.slice(0, 12)}… skipped: ${eligibility.reason}`); continue; }
        const addr = eligibility.address;
        const pubBal = await safeGetBalance("pub");
        if (pubBal <= 0) { console.warn(`[UBI] claim ${claimEpoch} by ${claimantId.slice(0, 12)}… skipped: PUB wallet balance is 0`); continue; }
        const pv = computePoolVars(pubBal, DEFAULT_RULES);
        const addresses = await listAddressesMerged();
        const eligible = addresses.filter(a => a.address && isValidEcoinAddress(a.address));
        const karmaScore = eligibility.score;
        const wMin = DEFAULT_RULES.caps.w_min;
        const wMax = DEFAULT_RULES.caps.w_max;
        const userW = clamp(1 + karmaScore / 100, wMin, wMax);
        const totalW = eligible.reduce((acc) => acc + clamp(1, wMin, wMax), 0) || 1;
        const ecoTax = await getUserEcoinTax(claimantId).catch(() => 0);
        const archTax = await getUserArchTax(claimantId).catch(() => 0);
        const amount = ubiAmountFor({ pool: pv.pool, userW, totalW, score: karmaScore, ecoTax, archTax });
        const txid = await rpcCall("sendtoaddress", [addr, amount, "OASIS UBI Payment"], "pub");
        if (!txid) { console.warn(`[UBI] claim ${claimEpoch} by ${claimantId.slice(0, 12)}… skipped: sendtoaddress failed`); continue; }
        console.log(`[UBI] paid ${amount} ECO to ${claimantId.slice(0, 12)}… (${claimEpoch}) tx ${txid}`);
        await publishUbiClaimResult(claim.allocationId || `claim:${claimEpoch}:${claimantId}`, claimEpoch, txid, claimantId, amount);
        await publishBankClaim({ amount, epochId: claimEpoch, allocationId: claim.allocationId || `claim:${claimEpoch}:${claimantId}`, txid });
        await publishUbiTransfer({ to: claimantId, amount, epochId: claimEpoch, txid });
      } catch (err) { console.warn(`[UBI] claim by ${String(claimantId).slice(0, 12)}… failed after payment: ${(err && err.message) || err}`); }
    }
  }

  async function readUbiLedger(ssb) {
    const msgs = await readTyped(ssb, ["transfer", "transferConfirm", "ubiClaim"], { limit: Math.max(getLogLimit(), 20000) });
    const transfers = [];
    const confirms = new Map();
    const claims = [];
    for (const m of msgs) {
      const v = m.value || {};
      const c = v.content || {};
      if (!c || typeof c !== "object") continue;
      if (c.type === "transfer" && Array.isArray(c.tags) && c.tags.some(t => String(t).toUpperCase() === "UBI")) transfers.push({ key: m.key, author: v.author, ...c });
      else if (c.type === "transferConfirm" && c.target) { if (!confirms.has(c.target)) confirms.set(c.target, new Set()); confirms.get(c.target).add(v.author); }
      else if (c.type === "ubiClaim") claims.push({ key: m.key, author: v.author, pubId: c.pubId, epochId: c.epochId });
    }
    return { transfers, confirms, claims };
  }

  function isFollowing(ssb, source, dest) {
    return new Promise((resolve) => {
      if (!ssb || !ssb.friends || typeof ssb.friends.isFollowing !== "function") return resolve(false);
      ssb.friends.isFollowing({ source, dest }, (err, val) => resolve(!err && !!val));
    });
  }

  async function rebalanceUbiPools() {
    if (!isPubNode()) return [];
    const ssb = await openSsb();
    if (!ssb || !ssb.publish) return [];
    const me = config.keys.id;
    const epochId = epochIdNow();
    const myBal = await safeGetBalance("pub");
    const pv = computePoolVars(myBal, DEFAULT_RULES);
    let surplus = pv.available - (DEFAULT_RULES.capPerEpoch ?? 2000);
    if (surplus <= 0) return [];
    const pubs = (await listUbiPubs()).filter(p => p.pubId !== me && !p.available);
    if (!pubs.length) return [];
    const { transfers, confirms, claims } = await readUbiLedger(ssb);
    const confirmedBy = (t) => confirms.get(t.key) || new Set();
    const sent = [];
    for (const pub of pubs) {
      const tag = pub.pubId.slice(0, 12);
      try {
        if (!(await isFollowing(ssb, me, pub.pubId))) { console.warn(`[UBI] rebalance to ${tag}… skipped: this PUB does not follow it`); continue; }
        const address = pub.address || await getUserAddress(pub.pubId).catch(() => null);
        if (!address || !isValidEcoinAddress(address)) { console.warn(`[UBI] rebalance to ${tag}… skipped: no ECOin address`); continue; }
        const claimants = new Set();
        for (const c of claims) {
          if (c.pubId !== pub.pubId || c.epochId !== epochId || claimants.has(c.author)) continue;
          const el = await isEligibleClaimant(c.author);
          if (el.ok) claimants.add(c.author);
        }
        if (claimants.size < REBALANCE_MIN_CLAIMANTS) { console.warn(`[UBI] rebalance to ${tag}… skipped: ${claimants.size} eligible claimant(s), ${REBALANCE_MIN_CLAIMANTS} required`); continue; }
        const receivedBefore = transfers.filter(t => t.author === me && t.to === pub.pubId && String(t.concept || "").startsWith(REBALANCE_CONCEPT)).reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
        const sentThisEpoch = transfers.filter(t => t.author === me && t.to === pub.pubId && String(t.concept || "").endsWith(`· ${epochId}`) && String(t.concept || "").startsWith(REBALANCE_CONCEPT)).reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
        const paidOut = transfers.filter(t => t.author === pub.pubId && isUbiPayoutConcept(t.concept) && confirmedBy(t).has(t.to)).reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
        if (receivedBefore > 0 && paidOut < receivedBefore * REBALANCE_PAYOUT_RATIO) { console.warn(`[UBI] rebalance to ${tag}… skipped: paid out ${paidOut.toFixed(6)} of ${receivedBefore.toFixed(6)} received`); continue; }
        const need = Math.min(REBALANCE_MAX_PER_EPOCH, claimants.size * DEFAULT_RULES.caps.cap_user_epoch) - (Number(pub.balance) || 0);
        const amount = Number(Math.min(surplus, need, REBALANCE_MAX_PER_EPOCH - sentThisEpoch).toFixed(6));
        if (!(amount >= 1)) { console.warn(`[UBI] rebalance to ${tag}… skipped: nothing needed this epoch`); continue; }
        const txid = await rpcCall("sendtoaddress", [address, amount, REBALANCE_CONCEPT], "pub");
        if (!txid) { console.warn(`[UBI] rebalance to ${tag}… skipped: sendtoaddress failed`); continue; }
        surplus -= amount;
        const now = new Date().toISOString();
        const content = { type: "transfer", from: me, to: pub.pubId, concept: `${REBALANCE_CONCEPT} · ${epochId}`, amount: amount.toFixed(6), category: "ECONOMIC", createdAt: now, updatedAt: now, deadline: null, confirmedBy: [me], status: "UNCONFIRMED", tags: ["UBI", "REBALANCE", `epoch:${epochId}`], opinions: {}, opinions_inhabitants: [], txid };
        await new Promise((resolve, reject) => ssb.publish(content, (err, msg) => err ? reject(err) : resolve(msg)));
        console.log(`[UBI] rebalanced ${amount} ECO to PUB ${tag}… (${claimants.size} claimants) tx ${txid}`);
        sent.push({ pubId: pub.pubId, amount, txid });
      } catch (err) { console.warn(`[UBI] rebalance to ${tag}… failed: ${(err && err.message) || err}`); }
      if (surplus < 1) break;
    }
    return sent;
  }

  async function confirmIncomingTransfers() {
    if (!services || !services.transfers || typeof services.transfers.confirmTransferById !== "function") return [];
    const kind = isPubNode() ? "pub" : "user";
    const cfg = getWalletCfg(kind) || {};
    if (!cfg.url) return [];
    const ssb = await openSsb();
    if (!ssb) return [];
    const me = config.keys.id;
    const msgs = await readTyped(ssb, ["transfer", "transferConfirm"], { limit: Math.max(getLogLimit(), 20000) });
    const confirms = new Map();
    const incoming = [];
    for (const m of msgs) {
      const v = m.value || {};
      const c = v.content || {};
      if (c.type === "transferConfirm" && c.target) { if (!confirms.has(c.target)) confirms.set(c.target, new Set()); confirms.get(c.target).add(v.author); }
      else if (c.type === "transfer" && c.to === me && v.author !== me && String(c.status || "").toUpperCase() === "UNCONFIRMED") incoming.push({ key: m.key, ...c });
    }
    const done = [];
    for (const t of incoming) {
      if ((confirms.get(t.key) || new Set()).has(me)) continue;
      const txid = String(t.txid || "").match(TXID_RE) ? String(t.txid) : (String(t.concept || "").match(TXID_RE) || [])[1];
      if (!txid) continue;
      const tx = await rpcCall("gettransaction", [txid], kind);
      if (!tx || !(Number(tx.confirmations) >= 1)) continue;
      try {
        await services.transfers.confirmTransferById(t.key);
        console.log(`[WALLET] confirmed incoming ${Number(t.amount).toFixed(6)} ECO from ${String(t.from).slice(0, 12)}… (${t.concept}) tx ${txid}`);
        done.push(t.key);
      } catch (_) {}
    }
    return done;
  }

  return {
    DEFAULT_RULES,
    isPubNode,
    computeEpoch,
    executeEpoch,
    getUserEngagementScore,
    publishBankClaim,
    publishUbiAllocation,
    publishUbiClaim,
    publishUbiClaimResult,
    publishPubAvailability,
    getPubAvailabilityFromSSB,
    hasClaimedThisMonth,
    getUbiClaimHistory,
    claimUBI,
    processPendingClaims,
    expireOldAllocations,
    claimAllocation,
    listBanking,
    getAllocationById,
    getEpochById,
    listEpochAllocations,
    addAddress,
    removeAddress,
    listAddressBook,
    addAddressBookEntry,
    removeAddressBookEntry,
    ensureSelfAddressPublished,
    getUserAddress,
    setUserAddress,
    listAddressesMerged,
    hasPublishedAddress,
    discoverUbiPub,
    resolvePubId,
    listUbiPubs,
    listUbiPubsDetailed,
    listUbiCharts,
    listKarmaHistory,
    listWealthSeries,
    normalizeRange,
    filterByRange,
    compactEcoHistory,
    isEligibleClaimant,
    ubiAmountFor,
    rebalanceUbiPools,
    confirmIncomingTransfers,
    refuseUBI,
    hasRefusedThisMonth,
    claimAvailability,
    calculateEcoinValue,
    calculateEcoTaxStats,
    getUserEcoinTax,
    getUserArchTax,
    getUserFirstBlockTs,
    getBankingData,
    ECOIN_PER_GRAM_CO2,
    ECOIN_PER_DAY_OF_HISTORY
  };
};
