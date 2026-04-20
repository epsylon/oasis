const fs = require('fs');
const path = require('path');
const { getConfig } = require('../configs/config-manager.js');

const COOLDOWN_MS = 5 * 60 * 1000;
const statePath = path.join(__dirname, '../configs/follow_state.json');

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
};
