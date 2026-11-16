const fs = require('fs');
const path = require('path');
const { statePath } = require('../configs/state-manager');

const FILE = 'tribe-watch.json';
const MEDIA_SECTIONS = new Set(['images', 'audios', 'videos', 'documents', 'files', 'bookmarks', 'torrents']);
const SECTION_OF = { chat: 'chats', forum: 'forum', 'forum-reply': 'forum', event: 'events', task: 'tasks', votation: 'votations', feed: 'feed', calendar: 'calendars', map: 'maps', wiki: 'wiki', pad: 'pads', room: 'rooms', poll: 'polls', torrent: 'torrents', file: 'files', chatThread: 'chats' };

const sectionOf = (kind, mediaType) => {
  if (kind === 'media') {
    const s = `${String(mediaType || '').toLowerCase()}s`;
    return MEDIA_SECTIONS.has(s) ? s : null;
  }
  return SECTION_OF[kind] || null;
};

let state = null;
let activity = new Map();

const fresh = () => ({ since: Date.now(), tribes: {}, items: {}, seen: {}, noticed: {} });

const save = () => {
  try {
    const file = statePath(FILE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (_) {}
};

const load = () => {
  if (state) return state;
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(statePath(FILE), 'utf8')); } catch (_) {}
  const base = fresh();
  state = raw && typeof raw === 'object' ? { ...base, ...raw } : base;
  for (const k of ['tribes', 'items', 'seen', 'noticed']) if (!state[k] || typeof state[k] !== 'object') state[k] = {};
  if (!Number.isFinite(Number(state.since))) state.since = base.since;
  if (!raw) save();
  return state;
};

const reset = () => { state = null; activity = new Map(); };

const followsTribe = (tribeId) => load().tribes[tribeId] === true;
const itemSetting = (id) => { const v = load().items[id]; return v === 'on' || v === 'off' ? v : null; };
const watches = (entry) => {
  const own = itemSetting(entry.id);
  return own === 'on' || (own !== 'off' && (followsTribe(entry.tribeId) || (!!entry.parentTribeId && followsTribe(entry.parentTribeId))));
};

const setTribe = (tribeId, on) => {
  if (!tribeId) return;
  const s = load();
  if (on) s.tribes[tribeId] = true; else delete s.tribes[tribeId];
  save();
};

const setItem = (id, on) => {
  if (!id) return;
  load().items[id] = on ? 'on' : 'off';
  save();
};

const markSeen = (id, ts = Date.now()) => {
  if (!id) return;
  const s = load();
  if ((s.seen[id] || 0) >= ts) return;
  s.seen[id] = ts;
  save();
};

const markSectionSeen = (tribeId, section, ts = Date.now()) => {
  const s = load();
  let changed = false;
  for (const e of activity.values()) {
    if (e.tribeId !== tribeId || e.section !== section || (s.seen[e.id] || 0) >= ts) continue;
    s.seen[e.id] = ts;
    changed = true;
  }
  if (changed) save();
};

const seenAt = (id) => Math.max(Number(load().seen[id]) || 0, Number(load().since) || 0);
const isNew = (entry) => (Number(entry.lastOtherAt) || 0) > seenAt(entry.id);

const setActivity = (entries) => {
  const next = new Map();
  for (const e of entries || []) {
    if (!e || !e.id || !e.tribeId || !e.section) continue;
    const prev = next.get(e.id);
    if (!prev || (Number(e.lastOtherAt) || 0) > (Number(prev.lastOtherAt) || 0)) next.set(e.id, { ...e, lastOtherAt: Number(e.lastOtherAt) || 0 });
  }
  activity = next;
  const s = load();
  let pruned = false;
  for (const k of ['seen', 'noticed']) {
    for (const id of Object.keys(s[k])) if (!next.has(id)) { delete s[k][id]; pruned = true; }
  }
  if (pruned) save();
};

const newCounts = (tribeId) => {
  const sections = {};
  let total = 0;
  for (const e of activity.values()) {
    if ((e.tribeId !== tribeId && e.parentTribeId !== tribeId) || !isNew(e)) continue;
    const section = e.tribeId === tribeId ? e.section : 'subtribes';
    sections[section] = (sections[section] || 0) + 1;
    total += 1;
  }
  return { total, sections };
};

const pendingNotices = () => {
  const s = load();
  const out = [];
  for (const e of activity.values()) {
    if (!watches(e) || !isNew(e)) continue;
    const noticed = Number(s.noticed[e.id]) || 0;
    if (noticed >= e.lastOtherAt || noticed > (Number(s.seen[e.id]) || 0)) continue;
    out.push(e);
  }
  return out;
};

const markNoticed = (id, ts) => {
  if (!id) return;
  load().noticed[id] = Number(ts) || Date.now();
  save();
};

module.exports = {
  sectionOf, followsTribe, itemSetting, watches, setTribe, setItem, markSeen, markSectionSeen,
  isNew, setActivity, newCounts, pendingNotices, markNoticed, reset
};
