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

const failuresByKey = (...sources) => {
  const out = new Map();
  for (const list of sources) {
    for (const item of list || []) {
      const data = Array.isArray(item) ? item[1] : item;
      const id = data && canonicalKey(data.key);
      if (!id) continue;
      const f = Number(data.failure) || 0;
      if (f > (out.get(id) || 0)) out.set(id, f);
    }
  }
  return out;
};

module.exports = { canonicalKey, observe, isDead, failuresByKey, DEAD_AFTER_MS };
