const fs = require('fs');
const path = require('path');
const { getConfig } = require('../configs/config-manager.js');

const COOLDOWN_MS = 5 * 60 * 1000;
const statePath = require('../configs/state-manager').statePath('follow_state.json');

const readJson = (p, fallback) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
};
const writeJson = (p, data) => {
  try { fs.writeFileSync(p, JSON.stringify(data, null, 2)); } catch (e) {}
};

const loadState = () => {
  const s = readJson(statePath, { pending: [], accepted: [], lastAcceptMs: 0 });
  if (!Array.isArray(s.pending)) s.pending = [];
  if (!Array.isArray(s.accepted)) s.accepted = [];
  if (typeof s.lastAcceptMs !== 'number') s.lastAcceptMs = 0;
  return s;
};
const saveState = (s) => writeJson(statePath, s);

const lanPeersPath = require('../configs/state-manager').statePath('lan-peers.json');
const FEED_ID = /^@[A-Za-z0-9+/]{43}=\.ed25519$/;
let lanKnown = null;

const canonicalFeedId = (key) => {
  let k = String(key || '').trim();
  if (!k) return null;
  if (!k.startsWith('@')) k = '@' + k;
  if (!k.endsWith('.ed25519')) k += '.ed25519';
  return FEED_ID.test(k) ? k : null;
};

const isPrivateHost = (host) => {
  const h = String(host || '').replace(/^\[|\]$/g, '').replace(/^::ffff:/i, '').toLowerCase();
  if (!h) return false;
  if (/^(10|127)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return h === '::1' || /^f[cd][0-9a-f]{0,2}:/.test(h) || /^fe[89ab][0-9a-f]?:/.test(h);
};

const hostOfAddress = (address) => {
  const net = String(address || '').split('~')[0];
  if (!net.startsWith('net:')) return '';
  const hp = net.slice(4);
  const i = hp.lastIndexOf(':');
  return i > 0 ? hp.slice(0, i) : hp;
};

const lanKeysFromConn = (entries) => {
  const out = [];
  for (const e of entries || []) {
    if (!Array.isArray(e) || !e[1]) continue;
    const [address, data] = e;
    const key = canonicalFeedId(data.key);
    if (!key) continue;
    if (data.type === 'lan' || data.inferredType === 'lan' || isPrivateHost(hostOfAddress(address))) out.push(key);
  }
  return out;
};

const lanPeers = () => {
  if (!lanKnown) {
    const list = readJson(lanPeersPath, []);
    lanKnown = new Set((Array.isArray(list) ? list : []).map(canonicalFeedId).filter(Boolean));
  }
  return lanKnown;
};

const rememberLanPeers = (keys) => {
  const set = lanPeers();
  let changed = false;
  for (const k of keys || []) {
    const id = canonicalFeedId(k);
    if (id && !set.has(id)) { set.add(id); changed = true; }
  }
  if (changed) writeJson(lanPeersPath, [...set]);
  return changed;
};

const filterByWish = async (items, { wish, viewer, authorOf: author, isOwn, isMutual, lan } = {}) => {
  if (!Array.isArray(items)) return items;
  const own = (it) => !!(isOwn && isOwn(it, viewer));
  if (wish === 'local') return items.filter(own);
  if (wish === 'only-lan') {
    const near = lan || new Set();
    return items.filter(it => { const a = author(it); return !a || a === viewer || own(it) || near.has(a); });
  }
  if (wish === 'mutuals' && typeof isMutual === 'function') {
    const out = [];
    for (const it of items) {
      const a = author(it);
      if (!a || a === viewer || await isMutual(a)) out.push(it);
    }
    return out;
  }
  return items;
};

const wishMutualsOnly = () => getConfig().wish === 'mutuals';
const pmMutualsOnly = () => getConfig().pmVisibility === 'mutuals';
const isFrictionActive = () => wishMutualsOnly() || pmMutualsOnly();

const listPending = () => loadState().pending;
const enqueuePending = (followerId, extra = {}) => {
  if (!followerId) return false;
  const s = loadState();
  if (s.pending.some(x => x.followerId === followerId)) return false;
  s.pending.push({ followerId, at: new Date().toISOString(), ...extra });
  saveState(s);
  return true;
};
const removePending = (followerId) => {
  const s = loadState();
  s.pending = s.pending.filter(x => x.followerId !== followerId);
  saveState(s);
};

const loadAccepted = () => loadState().accepted;
const isAccepted = (followerId) => loadState().accepted.includes(followerId);
const addAccepted = (followerId) => {
  if (!followerId) return;
  const s = loadState();
  if (!s.accepted.includes(followerId)) { s.accepted.push(followerId); saveState(s); }
};
const removeAccepted = (followerId) => {
  const s = loadState();
  s.accepted = s.accepted.filter(x => x !== followerId);
  saveState(s);
};

const canAutoAcceptNow = () => (Date.now() - loadState().lastAcceptMs) >= COOLDOWN_MS;
const markAutoAccept = () => {
  const s = loadState();
  s.lastAcceptMs = Date.now();
  saveState(s);
};

const makeMutualCache = (friendModel) => {
  const cache = new Map();
  const frictionActive = isFrictionActive();
  return async (otherId) => {
    if (!otherId) return false;
    if (cache.has(otherId)) return cache.get(otherId);
    try {
      const rel = await friendModel.getRelationship(otherId);
      const basic = !!(rel && rel.following && rel.followsMe);
      const mutual = frictionActive ? (basic && isAccepted(otherId)) : basic;
      cache.set(otherId, mutual);
      return mutual;
    } catch (e) {
      cache.set(otherId, false);
      return false;
    }
  };
};

const authorOf = (item) => {
  if (!item) return null;
  if (item.value && item.value.author) return item.value.author;
  if (item.author) return item.author;
  if (item.feed) return item.feed;
  if (item.id && typeof item.id === 'string' && item.id.startsWith('@')) return item.id;
  return null;
};

const applyMutualSupportFilter = async (items, viewerId, friendModel) => {
  if (!wishMutualsOnly()) return items;
  if (!Array.isArray(items)) return items;
  const isMutual = makeMutualCache(friendModel);
  const out = [];
  for (const it of items) {
    const a = authorOf(it);
    if (!a || a === viewerId) { out.push(it); continue; }
    if (await isMutual(a)) out.push(it);
  }
  return out;
};

const canSendPmTo = async (viewerId, recipientId, friendModel) => {
  if (!pmMutualsOnly()) return { allowed: true };
  if (viewerId === recipientId) return { allowed: true };
  const isMutual = makeMutualCache(friendModel);
  if (await isMutual(recipientId)) return { allowed: true };
  return { allowed: false, reason: 'non-mutual' };
};

module.exports = {
  COOLDOWN_MS,
  wishMutualsOnly,
  pmMutualsOnly,
  isFrictionActive,
  listPending,
  enqueuePending,
  removePending,
  loadAccepted,
  isAccepted,
  addAccepted,
  removeAccepted,
  canAutoAcceptNow,
  markAutoAccept,
  makeMutualCache,
  applyMutualSupportFilter,
  canSendPmTo,
  authorOf,
  isPrivateHost,
  lanKeysFromConn,
  lanPeers,
  rememberLanPeers,
  filterByWish,
};
