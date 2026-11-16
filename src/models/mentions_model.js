const fs = require('fs');
const pull = require('../server/node_modules/pull-stream');
const { readTyped, CONTENT_TYPES } = require('./typed_log');
const { isComment } = require('./comments_model');
const { WORD_CHARS } = require('../backend/word_chars');

const SEEN_FILE = 'oasis-mentions-seen';
const ARCHIVE_FILE = 'oasis-mentions-archived';
const DELETED_FILE = 'oasis-mentions-deleted';

const flagPath = (name) => {
  try { return require('../configs/state-manager').statePath(name); } catch (_) { return null; }
};
const seenPath = () => flagPath(SEEN_FILE);

const readKeySet = (name) => {
  const p = flagPath(name);
  if (!p) return new Set();
  try { const arr = JSON.parse(fs.readFileSync(p, 'utf8')); return new Set(Array.isArray(arr) ? arr.map(String) : []); } catch (_) { return new Set(); }
};
const writeKeySet = (name, set) => {
  const p = flagPath(name);
  if (!p) return false;
  try { fs.writeFileSync(p, JSON.stringify(Array.from(set))); return true; } catch (_) { return false; }
};
const changeKeys = (name, keys, add) => {
  const set = readKeySet(name);
  for (const k of (Array.isArray(keys) ? keys : [keys]).filter(Boolean).map(String)) add ? set.add(k) : set.delete(k);
  return writeKeySet(name, set);
};

const MAX_SEEN_KEYS = 500;

const readSeen = () => {
  const p = seenPath();
  if (!p) return { ts: 0, keys: [] };
  let raw = '';
  try { raw = fs.readFileSync(p, 'utf8').trim(); } catch (_) { return { ts: 0, keys: [] }; }
  if (!raw) return { ts: 0, keys: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return { ts: Number(parsed.ts) || 0, keys: Array.isArray(parsed.keys) ? parsed.keys : [] };
    }
  } catch (_) {}
  return { ts: Number(raw) || 0, keys: [] };
};

const writeSeen = (keys, ts) => {
  const p = seenPath();
  if (!p) return false;
  const trimmed = (Array.isArray(keys) ? keys : []).filter(Boolean).slice(0, MAX_SEEN_KEYS);
  try { fs.writeFileSync(p, JSON.stringify({ ts: Number(ts) || Date.now(), keys: trimmed })); return true; } catch (_) { return false; }
};
const { getConfig } = require('../configs/config-manager.js');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { versionGroups, versionEntry } = require('../backend/dedupe');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const TEXT_FIELDS = ['text', 'description', 'title', 'concept', 'question', 'rules', 'message', 'body', 'subject'];

const SKIP_TYPES = new Set([
  'about', 'contact', 'vote', 'pub', 'tombstone', 'karmaScore',
  'tribe-invite-msg', 'tribe-invite-tombstone', 'tribe-key-distrib'
]);

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const getAllMessages = async (ssbClient) => readTyped(ssbClient, CONTENT_TYPES, { limit: logLimit, withWindow: true });

  const mentionsList = (content, feedId) => {
    const m = content && content.mentions;
    if (!m) return false;
    const values = Array.isArray(m) ? m : (typeof m === 'object' ? Object.values(m).flat() : []);
    return values.some(v => v && (v.link === feedId || v === feedId));
  };

  const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nameRes = (names) => names.map(n => new RegExp(`(^|[^${WORD_CHARS}\\[\\]/@])@${escapeRe(n)}(?=$|[^${WORD_CHARS}/+=])`, 'i'));
  const myNamesOf = (messages, feedId) => {
    let latest = null;
    for (const m of messages) {
      const v = m && m.value;
      const c = v && v.content;
      if (!c || c.type !== 'about' || String(v.author) !== String(feedId) || c.about !== feedId || typeof c.name !== 'string' || !c.name.trim()) continue;
      const ts = Number(v.timestamp || m.timestamp || 0);
      if (!latest || ts >= latest.ts) latest = { ts, name: c.name.trim() };
    }
    return latest ? [latest.name] : [];
  };
  const mentionsText = (content, feedId, byName = []) => {
    const bare = feedId.startsWith('@') ? feedId.slice(1) : feedId;
    for (const field of TEXT_FIELDS) {
      const v = content[field];
      if (typeof v === 'string' && (v.includes(feedId) || v.includes(bare) || byName.some(re => re.test(v)))) return true;
    }
    if (Array.isArray(content.tags)) {
      if (content.tags.some(t => typeof t === 'string' && (t.includes(feedId) || t.includes(bare)))) return true;
    }
    return false;
  };

  const snippet = (content) => {
    for (const field of TEXT_FIELDS) {
      const v = content[field];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };

  const scanCache = { fingerprint: '', fresh: null };

  const titleOf = (content) => {
    for (const field of ['title', 'concept', 'question', 'subject']) {
      const v = content[field];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };

  return {
    async listMentions(filter = 'ALL', opts = {}) {
      const ssbClient = await openSsb();
      const myFeedId = ssbClient.id;
      const messages = await getAllMessages(ssbClient);
      const last = messages.length ? messages[messages.length - 1] : null;
      const fingerprint = `${myFeedId}|${messages.length}|${last && last.key}`;
      const fresh = (scanCache.fingerprint === fingerprint && scanCache.fresh)
        ? scanCache.fresh
        : (() => {
      const tomb = buildValidatedTombstoneSet(messages);
      const vg = versionGroups(messages.filter(m => { const c = m && m.value && m.value.content; return c && typeof c === 'object' && c.type && !SKIP_TYPES.has(c.type); }).map(versionEntry));

      const out = [];
      const seen = new Set();
      const byName = nameRes(myNamesOf(messages, myFeedId));
      for (const m of messages) {
        const v = m && m.value;
        const c = v && v.content;
        if (!c || typeof c !== 'object' || !c.type) continue;
        if (tomb.has(m.key)) continue;
        if (SKIP_TYPES.has(c.type)) continue;
        if (c.encryptedPayload || c.encryptedQuestion) continue;
        if (Array.isArray(c.recps) || Array.isArray(v.content && v.content.recps)) continue;
        if (c.tribeId && c.type !== 'tribe') continue;
        if (String(v.author) === String(myFeedId)) continue;
        if (vg.tipOf(m.key) !== m.key || !vg.roots.has(vg.rootOf(m.key))) continue;
        if (!mentionsList(c, myFeedId) && !mentionsText(c, myFeedId, byName)) continue;
        if (seen.has(m.key)) continue;
        seen.add(m.key);
        out.push({
          id: m.key,
          key: m.key,
          root: vg.rootOf(m.key),
          author: v.author,
          type: isComment(c) ? 'comment' : c.type,
          title: titleOf(c),
          text: snippet(c),
          content: c,
          createdAt: new Date(v.timestamp || m.timestamp || 0).toISOString(),
          ts: v.timestamp || m.timestamp || 0
        });
      }

      scanCache.fingerprint = fingerprint;
      scanCache.fresh = out;
      return out;
        })();
      const q = String(opts.q || '').trim().toLowerCase();
      let list = q
        ? fresh.filter(x => x.text.toLowerCase().includes(q) || x.title.toLowerCase().includes(q) || x.type.toLowerCase().includes(q))
        : fresh;

      const f = String(filter || 'ALL').toUpperCase();
      if (f !== 'ALL' && f !== 'RECENT') list = list.filter(x => x.type === filter);

      list.sort((a, b) => b.ts - a.ts);
      return list;
    },

    seenAt: () => readSeen().ts,

    readKeys: () => new Set(readSeen().keys.map(String)),

    archivedKeys: () => readKeySet(ARCHIVE_FILE),
    archive: (key) => changeKeys(ARCHIVE_FILE, key, true),
    unarchive: (key) => changeKeys(ARCHIVE_FILE, key, false),

    deletedKeys: () => readKeySet(DELETED_FILE),
    removeMany(keys) {
      changeKeys(ARCHIVE_FILE, keys, false);
      return changeKeys(DELETED_FILE, keys, true);
    },

    sortOut(list) {
      const deleted = readKeySet(DELETED_FILE);
      const archived = readKeySet(ARCHIVE_FILE);
      const kept = (Array.isArray(list) ? list : []).filter(x => x && !deleted.has(String(x.key)));
      return {
        active: kept.filter(x => !archived.has(String(x.key))),
        archived: kept.filter(x => archived.has(String(x.key)))
      };
    },

    markRead(key) {
      if (!key) return false;
      const seen = readSeen();
      const keys = [String(key)].concat(seen.keys.filter(k => String(k) !== String(key)));
      return writeSeen(keys, seen.ts || Date.now());
    },

    markReadMany(list) {
      const seen = readSeen();
      const add = (Array.isArray(list) ? list : []).filter(Boolean).map(String);
      const rest = seen.keys.filter(k => !add.includes(String(k)));
      return writeSeen(add.concat(rest), seen.ts || Date.now());
    },

    markUnread(key) {
      if (!key) return false;
      const seen = readSeen();
      return writeSeen(seen.keys.filter(k => String(k) !== String(key)), seen.ts);
    },

    markSeen(list) {
      const items = Array.isArray(list) ? list : [];
      const keys = items.map(x => x && x.key).filter(Boolean);
      const newest = items.reduce((max, x) => Math.max(max, Number(x && x.ts) || 0), 0);
      return writeSeen(keys, newest || Date.now());
    },

    unseenOf(list) {
      const seen = readSeen();
      const known = new Set(seen.keys);
      const items = Array.isArray(list) ? list : [];
      if (known.size) return items.filter(x => x && !known.has(x.key));
      if (seen.ts) return items.filter(x => x && (Number(x.ts) || 0) > seen.ts);
      return items;
    },

    async countUnseen() {
      return this.unseenOf(await this.listMentions('ALL')).length;
    },

    async countTypes(list) {
      const counts = {};
      for (const item of (Array.isArray(list) ? list : [])) {
        counts[item.type] = (counts[item.type] || 0) + 1;
      }
      return counts;
    }
  };
};
