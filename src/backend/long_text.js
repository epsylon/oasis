const crypto = require('crypto');

const CHUNK_TYPE = 'textChunk';
const TEXT_CAP = 60000;
const CONTENT_BYTES = { plain: 6500, boxed: 4500, sealed: 3300 };
const MIN_HEAD_BYTES = 200;
const CACHE_MAX = 400;
const KEY_RE = /^%[A-Za-z0-9+/]{43}=?\.sha256$/;
const KEY_SAMPLE = '%' + 'A'.repeat(44) + '.sha256';

const byteLength = (s) => Buffer.byteLength(String(s == null ? '' : s), 'utf8');
const contentBytes = (content) => { try { return byteLength(JSON.stringify(content)); } catch (_) { return Infinity; } };
const isChunkKey = (k) => typeof k === 'string' && KEY_RE.test(k);
const tooLong = (text) => String(text == null ? '' : text).length > TEXT_CAP;

const cutAt = (text, maxBytes) => {
  let i = 0, bytes = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i);
    const len = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + len > maxBytes) break;
    bytes += len;
    i += cp >= 0x10000 ? 2 : 1;
  }
  if (i >= text.length) return text.length;
  const min = Math.floor(i / 2);
  const para = text.lastIndexOf('\n\n', i);
  if (para > min) return para + 2;
  const line = text.lastIndexOf('\n', i);
  if (line > min) return line + 1;
  const space = text.lastIndexOf(' ', i);
  if (space > min) return space + 1;
  return Math.max(i, 1);
};

const splitText = (text, maxBytes, firstMax = maxBytes) => {
  const s = String(text == null ? '' : text);
  const out = [];
  let rest = s;
  let limit = Math.max(1, firstMax);
  while (rest.length) {
    const cut = cutAt(rest, limit);
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
    limit = Math.max(1, maxBytes);
  }
  return out.length ? out : [''];
};

const chunkTemplate = (extra) => ({ type: CHUNK_TYPE, text: '', index: 999, total: 999, group: 'g'.repeat(16), ...extra });
const chunkBudget = (extra, maxBytes) => maxBytes - contentBytes(chunkTemplate(extra));
const headBudget = (content, field, maxBytes, count) => maxBytes - contentBytes({ ...content, [field]: '', chunks: new Array(count).fill(KEY_SAMPLE) });

const needsChunking = (content, maxBytes = CONTENT_BYTES.plain) => contentBytes(content) > maxBytes;

const planPieces = (content, field, { maxBytes = CONTENT_BYTES.plain, extra = {} } = {}) => {
  const text = String(content[field] == null ? '' : content[field]);
  if (tooLong(text)) throw new Error('Text too long');
  if (!needsChunking(content, maxBytes)) return null;
  const perChunk = chunkBudget(extra, maxBytes);
  if (perChunk < MIN_HEAD_BYTES) throw new Error('Text does not fit');
  let count = 0;
  let pieces = null;
  for (let guard = 0; guard < 12; guard++) {
    const head = headBudget(content, field, maxBytes, count);
    if (head < MIN_HEAD_BYTES) throw new Error('Text does not fit');
    pieces = splitText(text, perChunk, head);
    if (pieces.length - 1 <= count) return pieces;
    count = pieces.length - 1;
  }
  return pieces;
};

const publishChunks = async (pieces, publish, { extra = {}, group } = {}) => {
  const g = group || crypto.randomBytes(8).toString('hex');
  const total = pieces.length;
  const keys = [];
  for (let i = 0; i < pieces.length; i++) {
    const r = await publish({ type: CHUNK_TYPE, text: pieces[i], index: i + 1, total, group: g, ...extra });
    const key = r && typeof r === 'object' ? r.key : r;
    if (!isChunkKey(key)) throw new Error('Chunk publish failed');
    keys.push(key);
  }
  return keys;
};

const chunkContent = async (content, field, { maxBytes = CONTENT_BYTES.plain, extra = {}, publish } = {}) => {
  const base = { ...content };
  delete base.chunks;
  const pieces = planPieces(base, field, { maxBytes, extra });
  if (!pieces) return base;
  const keys = await publishChunks(pieces.slice(1), publish, { extra });
  return { ...base, [field]: pieces[0], chunks: keys };
};

const chunkOf = (author, c) => {
  if (!c || typeof c !== 'object' || typeof c.text !== 'string') return null;
  if (c.type !== CHUNK_TYPE && c.k !== CHUNK_TYPE) return null;
  return { author, text: c.text, index: Number(c.index) || 0, total: Number(c.total) || 0, group: String(c.group || '') };
};

const joinText = (head, keys, lookup, author) => {
  let out = String(head == null ? '' : head);
  if (!Array.isArray(keys) || !keys.length) return out;
  let group = null;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (!isChunkKey(k)) break;
    const ch = lookup(k);
    if (!ch || (author && ch.author !== author)) break;
    if (group === null) group = ch.group; else if (ch.group !== group) break;
    if (ch.index !== i + 1 || ch.total !== keys.length) break;
    out += ch.text;
  }
  return out;
};

const hasChunks = (content) => !!content && Array.isArray(content.chunks) && content.chunks.length > 0;

const resolveField = (content, field, author, lookup) => {
  if (!hasChunks(content)) return content;
  return { ...content, [field]: joinText(content[field], content.chunks, lookup, author) };
};

const indexChunks = (messages, decode) => {
  const index = new Map();
  for (const m of messages || []) {
    const v = m && m.value;
    if (!v || !m.key) continue;
    const raw = v.content;
    const c = decode ? decode(raw, m) : raw;
    const ch = chunkOf(v.author, c);
    if (ch) index.set(m.key, ch);
  }
  return index;
};

const lookupIn = (index) => (k) => index.get(k) || null;

const caches = new WeakMap();
const cacheFor = (ssb) => {
  let c = caches.get(ssb);
  if (!c) { c = new Map(); caches.set(ssb, c); }
  return c;
};
const remember = (cache, key, value) => {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return value;
};

const fetchChunk = async (ssb, key, unbox) => {
  const cache = cacheFor(ssb);
  if (cache.has(key)) { const v = cache.get(key); cache.delete(key); cache.set(key, v); return v; }
  const raw = await new Promise((resolve) => { try { ssb.get(key, (err, m) => resolve(err ? null : m)); } catch (_) { resolve(null); } });
  if (!raw) return null;
  let content = raw.content;
  if (typeof content === 'string' && unbox) { try { content = unbox(content); } catch (_) { content = null; } }
  const ch = chunkOf(raw.author, content);
  return ch ? remember(cache, key, ch) : null;
};

const joinChunks = async (ssb, content, author, { field = 'text', unbox = null } = {}) => {
  if (!hasChunks(content)) return content;
  const found = new Map();
  for (const k of content.chunks) {
    if (!isChunkKey(k)) break;
    const ch = await fetchChunk(ssb, k, unbox);
    if (!ch) break;
    found.set(k, ch);
  }
  return resolveField(content, field, author, lookupIn(found));
};

module.exports = {
  CHUNK_TYPE,
  TEXT_CAP,
  CONTENT_BYTES,
  byteLength,
  contentBytes,
  tooLong,
  splitText,
  needsChunking,
  planPieces,
  publishChunks,
  chunkContent,
  chunkOf,
  joinText,
  hasChunks,
  resolveField,
  indexChunks,
  lookupIn,
  joinChunks
};
