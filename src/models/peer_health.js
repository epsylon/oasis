const fs = require('fs');

const FAILURES_MIN = 3;
const DEAD_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_CAP_MS = 3 * 60 * 60 * 1000;
const FEED_ID = /^@[A-Za-z0-9+/]{43}=\.ed25519$/;

const healthPath = () => require('../configs/state-manager').statePath('peer-health.json');
let cache = null;
let cachePath = null;

const canonicalKey = (key) => {
  let k = String(key || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!k) return null;
  if (!k.startsWith('@')) k = '@' + k;
  if (!k.endsWith('.ed25519')) k += '.ed25519';
  if (!/=\.ed25519$/.test(k)) k = k.replace(/\.ed25519$/, '=.ed25519');
  return FEED_ID.test(k) ? k : null;
};

const load = () => {
  const p = healthPath();
  if (!cache || cachePath !== p) {
    cachePath = p;
    try { cache = JSON.parse(fs.readFileSync(p, 'utf8')) || {}; } catch (_) { cache = {}; }
    if (typeof cache !== 'object' || Array.isArray(cache)) cache = {};
  }
  return cache;
};

const save = () => { try { fs.writeFileSync(cachePath, JSON.stringify(cache)); } catch (_) {} };

const observe = ({ connected = [], failing = [], now = Date.now() } = {}) => {
  const h = load();
  let changed = false;
  const up = new Set(connected.map(canonicalKey).filter(Boolean));
  for (const id of up) {
    if (h[id]) { delete h[id]; changed = true; }
  }
  for (const k of failing) {
    const id = canonicalKey(k);
    if (!id || up.has(id) || h[id]) continue;
    h[id] = { failingSince: now };
    changed = true;
  }
  if (changed) save();
  return changed;
};

const isDead = ({ key, failures = 0, now = Date.now() } = {}) => {
  if (!(Number(failures) >= FAILURES_MIN)) return false;
  const e = load()[canonicalKey(key)] || {};
  const observed = Number(e.failingSince) ? now - Number(e.failingSince) : 0;
  return Math.max(observed, Number(failures) * RETRY_CAP_MS) >= DEAD_AFTER_MS;
};

const addressOf = (item) => {
  const m = Array.isArray(item) ? String(item[0] || '').match(/^(?:net|onion):([^:~]+):(\d+)/) : null;
  if (m) return `${m[1]}:${m[2]}`;
  const data = Array.isArray(item) ? item[1] : item;
  return data && data.host ? `${data.host}:${Number(data.port) || 8008}` : null;
};
const failuresByKey = (...sources) => {
  const byKey = new Map();
  for (const list of sources) {
    for (const item of list || []) {
      const data = Array.isArray(item) ? item[1] : item;
      const id = data && canonicalKey(data.key);
      if (!id) continue;
      const f = Number(data.failure) || 0;
      const e = byKey.get(id) || { any: 0, addrs: new Map() };
      const where = addressOf(item);
      if (where) e.addrs.set(where, Math.max(e.addrs.get(where) || 0, f));
      else e.any = Math.max(e.any, f);
      byKey.set(id, e);
    }
  }
  const out = new Map();
  for (const [id, e] of byKey) out.set(id, e.addrs.size ? Math.min(...[...e.addrs.values()].map(f => Math.max(f, e.any))) : e.any);
  return out;
};

const classifyNetError = (err, address = '') => {
  const msg = `${(err && err.code) || ''} ${(err && err.message) || err || ''}`.toLowerCase();
  const onion = /\.onion/i.test(String(address || ''));
  if (msg.includes('network paused')) return 'paused';
  if (onion && /only know|could not connect to/.test(msg)) return 'tor';
  if (/127\.0\.0\.1:9[01]50/.test(msg) || (onion && /econnrefused|socks/.test(msg) && !/ttl|hostunreachable|host unreachable|general/.test(msg))) return 'tor';
  if (/shs\.client: (error when expecting server to accept challenge|server responded with invalid challenge)|application cap/.test(msg)) return 'keys';
  if (/shs\.client: (server hung up when we sent hello|the server's response accepting)/.test(msg)) return 'identity';
  if (/econnrefused/.test(msg)) return 'refused';
  if (/enotfound|eai_again|getaddrinfo/.test(msg)) return 'notfound';
  if (/enetunreach|ehostunreach|ehostdown|enetdown|hostunreachable|host unreachable|networkunreachable/.test(msg)) return 'unreachable';
  if (/timed? ?out|etimedout|ttl/.test(msg)) return 'timeout';
  if (/econnreset|epipe|hung up|aborted|closed/.test(msg)) return 'dropped';
  return 'other';
};
const NET_REASON_KEYS = {
  paused: 'peerErrPaused', tor: 'peerErrTor', keys: 'peerErrKeys', identity: 'peerErrIdentity', refused: 'peerErrRefused',
  notfound: 'peerErrNotFound', unreachable: 'peerErrUnreachable', timeout: 'peerErrTimeout', dropped: 'peerErrDropped', other: 'peerErrOther', silent: 'peerErrSilent'
};

module.exports = { canonicalKey, observe, isDead, failuresByKey, classifyNetError, NET_REASON_KEYS, DEAD_AFTER_MS };
