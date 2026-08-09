const fs = require('fs');
const pull = require('../server/node_modules/pull-stream');

const SEEN_FILE = 'oasis-mentions-seen';

const seenPath = () => {
  try { return require('../server/ssb_config').statePath(SEEN_FILE); } catch (_) { return null; }
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
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const TEXT_FIELDS = ['text', 'description', 'title', 'concept', 'question', 'rules', 'message', 'body', 'subject'];

const SKIP_TYPES = new Set([
  'about', 'contact', 'vote', 'pub', 'tombstone', 'karmaScore',
  'tribe-invite-msg', 'tribe-invite-tombstone', 'tribe-key-distrib'
]);

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const getAllMessages = async (ssbClient) =>
    new Promise((resolve, reject) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => (err ? reject(err) : resolve(msgs)))
      );
    });

  const mentionsList = (content, feedId) => {
    const m = content && content.mentions;
    if (!m) return false;
    const values = Array.isArray(m) ? m : (typeof m === 'object' ? Object.values(m).flat() : []);
    return values.some(v => v && (v.link === feedId || v === feedId));
  };

  const mentionsText = (content, feedId) => {
    const bare = feedId.startsWith('@') ? feedId.slice(1) : feedId;
    for (const field of TEXT_FIELDS) {
      const v = content[field];
      if (typeof v === 'string' && (v.includes(feedId) || v.includes(bare))) return true;
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
      const tomb = buildValidatedTombstoneSet(messages);

      const out = [];
      const seen = new Set();
      const replaced = new Set();
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
        if (typeof c.replaces === 'string') replaced.add(c.replaces);
        if (!mentionsList(c, myFeedId) && !mentionsText(c, myFeedId)) continue;
        if (seen.has(m.key)) continue;
        seen.add(m.key);
        out.push({
          id: m.key,
          key: m.key,
          author: v.author,
          type: c.type,
          title: titleOf(c),
          text: snippet(c),
          content: c,
          createdAt: new Date(v.timestamp || m.timestamp || 0).toISOString(),
          ts: v.timestamp || m.timestamp || 0
        });
      }

      const fresh = out.filter(x => !replaced.has(x.key));
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
