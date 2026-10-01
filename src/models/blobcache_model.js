const fs = require('fs');
const pull = require('../server/node_modules/pull-stream');

const BLOB_RE = /&[A-Za-z0-9+/=]{44}\.sha256/g;
const DEFAULT_MAX_MB = 2048;
const PROTECT_MS = 24 * 60 * 60 * 1000;
const FLUSH_MS = 60 * 1000;

const accessPath = () => {
  try { return require('../configs/state-manager').statePath('blob-access.json'); } catch (_) { return null; }
};

module.exports = ({ cooler } = {}) => {
  const openSsb = async () => cooler.open();
  let access = null;
  let dirty = false;
  let flushTimer = null;

  const loadAccess = () => {
    if (access) return access;
    access = {};
    const p = accessPath();
    if (p) { try { access = JSON.parse(fs.readFileSync(p, 'utf8')) || {}; } catch (_) { access = {}; } }
    return access;
  };

  const flush = () => {
    if (!dirty) return;
    const p = accessPath();
    if (!p) return;
    try { fs.writeFileSync(p, JSON.stringify(loadAccess())); dirty = false; } catch (_) {}
  };

  const normalizeId = (raw) => {
    let id = String(raw || '').trim();
    try { id = decodeURIComponent(id); } catch (_) {}
    if (!id) return null;
    if (!id.startsWith('&')) id = `&${id}`;
    return /^&[A-Za-z0-9+/=]{44}\.sha256$/.test(id) ? id : null;
  };

  const touch = (raw) => {
    const id = normalizeId(raw);
    if (!id) return;
    loadAccess()[id] = Date.now();
    dirty = true;
    if (!flushTimer) {
      flushTimer = setTimeout(() => { flushTimer = null; flush(); }, FLUSH_MS);
      if (typeof flushTimer.unref === 'function') flushTimer.unref();
    }
  };

  const listBlobs = async (ssb) => new Promise((resolve) => {
    if (!ssb.blobs || typeof ssb.blobs.ls !== 'function') return resolve([]);
    pull(ssb.blobs.ls({ long: true }), pull.collect((err, arr) => {
      if (err) return resolve([]);
      resolve((arr || []).filter(b => b && b.id).map(b => ({ id: b.id, size: Number(b.size) || 0, ts: Number(b.ts) || 0 })));
    }));
  });

  const ownBlobIds = async (ssb) => {
    const own = new Set();
    const msgs = await new Promise((resolve) => {
      pull(ssb.createUserStream({ id: ssb.id, reverse: false }), pull.collect((err, arr) => resolve(err ? [] : (arr || []))));
    });
    for (const m of msgs) {
      const content = m && m.value && m.value.content;
      if (!content || typeof content !== 'object') continue;
      for (const id of (JSON.stringify(content).match(BLOB_RE) || [])) own.add(id);
    }
    return own;
  };

  const usage = async () => {
    const ssb = await openSsb();
    const blobs = await listBlobs(ssb);
    return { count: blobs.length, bytes: blobs.reduce((n, b) => n + b.size, 0) };
  };

  const collect = async ({ maxBytes, now = Date.now(), protectMs = PROTECT_MS } = {}) => {
    const limit = Number(maxBytes);
    const ssb = await openSsb();
    const blobs = await listBlobs(ssb);
    const total = blobs.reduce((n, b) => n + b.size, 0);
    const result = { before: total, after: total, deleted: 0, freed: 0, kept: blobs.length };
    if (!(limit > 0) || total <= limit) return result;
    const own = await ownBlobIds(ssb);
    const seen = loadAccess();
    const candidates = blobs
      .filter(b => !own.has(b.id))
      .map(b => ({ ...b, last: Math.max(Number(seen[b.id]) || 0, b.ts) }))
      .filter(b => now - b.last > protectMs)
      .sort((a, b) => a.last - b.last);
    let current = total;
    for (const b of candidates) {
      if (current <= limit) break;
      const removed = await new Promise((resolve) => ssb.blobs.rm(b.id, (err) => resolve(!err)));
      if (!removed) continue;
      current -= b.size;
      result.deleted += 1;
      result.freed += b.size;
      delete seen[b.id];
      dirty = true;
    }
    result.after = current;
    result.kept = blobs.length - result.deleted;
    flush();
    return result;
  };

  const maxBytesFor = (cfg, { isPublic = false } = {}) => {
    const mb = Number(cfg && cfg.blobCache && (isPublic ? cfg.blobCache.pubMaxMB : cfg.blobCache.maxMB));
    if (!Number.isFinite(mb) || mb <= 0) return 0;
    return Math.round(mb * 1024 * 1024);
  };

  return { touch, usage, collect, ownBlobIds, maxBytesFor, flush, DEFAULT_MAX_MB };
};
module.exports.DEFAULT_MAX_MB = DEFAULT_MAX_MB;
