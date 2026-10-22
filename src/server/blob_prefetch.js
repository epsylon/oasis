const BLOB_REF_RE = /&[A-Za-z0-9+/]{43}=\.sha256/g;
const SEEN_MAX = 5000;
const DEFAULT_BACKFILL_LIMIT = 2000;
const pull = require('./node_modules/pull-stream');

const backfillLimit = () => {
  try { return Number(require('../configs/config-manager.js').getConfig().ssbLogStream.limit) || DEFAULT_BACKFILL_LIMIT; } catch (_) { return DEFAULT_BACKFILL_LIMIT; }
};

const blobRefsOf = (content) => {
  if (!content || typeof content !== 'object') return [];
  return Array.from(new Set(JSON.stringify(content).match(BLOB_REF_RE) || []));
};

module.exports = {
  name: 'blobPrefetch',
  version: '1.0.0',
  manifest: {},
  blobRefsOf,
  init(server, config) {
    if (!config || !config.pub) return;
    if (!server.db || typeof server.db.onMsgAdded !== 'function' || !server.blobs || !server.friends) return;
    const seen = new Set();
    const remember = (ref) => {
      if (seen.size >= SEEN_MAX) seen.delete(seen.values().next().value);
      seen.add(ref);
    };
    const fetch = (ref) => {
      if (seen.has(ref)) return;
      remember(ref);
      server.blobs.has(ref, (err, has) => {
        if (!err && has) return;
        try { server.blobs.want(ref, () => {}); } catch (_) {}
      });
    };
    const consider = (value) => {
      const refs = blobRefsOf(value && value.content);
      if (!refs.length || !value.author || value.author === server.id) return;
      server.friends.isFollowing({ source: server.id, dest: value.author }, (err, following) => {
        if (err || !following) return;
        refs.forEach(fetch);
      });
    };
    server.db.onMsgAdded((ev) => consider(ev && ev.kvt && ev.kvt.value), false);
    if (typeof server.createLogStream === 'function') {
      try { pull(server.createLogStream({ reverse: true, limit: backfillLimit() }), pull.drain((m) => consider(m && m.value), () => {})); } catch (_) {}
    }
  }
};
