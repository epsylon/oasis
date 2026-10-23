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

const CHUNK_FIELD = 'chunkField';
const MAX_MESSAGE_CHARS = 8192;
const UNCHUNKABLE = new Set(['type', 'recps', 'chunks', CHUNK_FIELD, 'encryptedPayload', 'p', 'fp']);
const SEALED_TYPES = new Set(['tribe-msg']);
const looksLikeReference = (s) => /^[%&@]/.test(s) || /^https?:\/\//i.test(s) || /^data:/i.test(s);
const looksLikeCiphertext = (s) => (s.length >= 64 && /^[A-Fa-f0-9]+$/.test(s)) || /\.box\d*$/.test(s);
const chunkableField = (content) => {
  let best = null;
  let bestBytes = 0;
  for (const [k, v] of Object.entries(content)) {
    if (UNCHUNKABLE.has(k) || typeof v !== 'string' || looksLikeReference(v) || looksLikeCiphertext(v)) continue;
    const n = byteLength(v);
    if (n > bestBytes) { best = k; bestBytes = n; }
  }
  return bestBytes >= MIN_HEAD_BYTES ? best : null;
};
const hasRecps = (content) => Array.isArray(content.recps) && content.recps.length > 0;
const messageChars = (content) => {
  try {
    return JSON.stringify({ previous: '%' + 'x'.repeat(44) + '.sha256', sequence: 1000000, author: '@' + 'x'.repeat(44) + '.ed25519', timestamp: Date.now(), hash: 'sha256', content, signature: 'x'.repeat(88) + '.sig.ed25519' }, null, 2).length;
  } catch (_) { return Infinity; }
};
const mustSplit = (content) => hasRecps(content) ? contentBytes(content) > CONTENT_BYTES.boxed : messageChars(content) > MAX_MESSAGE_CHARS;
const autoChunk = async (content, publish) => {
  if (!content || typeof content !== 'object' || Array.isArray(content) || hasChunks(content) || SEALED_TYPES.has(content.type)) return content;
  const budget = hasRecps(content) ? CONTENT_BYTES.boxed : CONTENT_BYTES.plain;
  if (!mustSplit(content)) return content;
  const field = chunkableField(content);
  if (!field) return content;
  let out;
  try {
    out = await chunkContent(content, field, { maxBytes: budget, extra: hasRecps(content) ? { recps: content.recps } : {}, publish });
  } catch (e) {
    if (e && /does not fit/.test(String(e.message))) return content;
    throw e;
  }
  return hasChunks(out) ? { ...out, [CHUNK_FIELD]: field } : out;
};
const PACKED_FIELD = 'packed';
const packBody = async (body, { maxBytes = CONTENT_BYTES.sealed, extra = {}, publish } = {}) => {
  const head = { k: body.k, rootId: body.rootId, replaces: body.replaces, op: body.op, [PACKED_FIELD]: JSON.stringify(body) };
  for (const key of Object.keys(head)) if (head[key] === undefined) delete head[key];
  return chunkContent(head, PACKED_FIELD, { maxBytes, extra, publish });
};
const isPacked = (body) => !!body && typeof body === 'object' && typeof body[PACKED_FIELD] === 'string';
const unpackBody = (body, lookup, author) => {
  if (!isPacked(body)) return body;
  const full = hasChunks(body) ? joinText(body[PACKED_FIELD], body.chunks, lookup || (() => null), author) : body[PACKED_FIELD];
  try { return JSON.parse(full); } catch (_) { return null; }
};
const autoJoin = async (msg, getChunk) => {
  const value = msg && msg.value;
  const c = value && value.content;
  if (!c || typeof c !== 'object' || typeof c[CHUNK_FIELD] !== 'string' || !hasChunks(c)) return msg;
  const found = new Map();
  for (const k of c.chunks) {
    if (!isChunkKey(k)) break;
    let ch = null;
    try { ch = await getChunk(k); } catch (_) { ch = null; }
    if (!ch) break;
    found.set(k, ch);
  }
  const joined = resolveField(c, c[CHUNK_FIELD], value.author, lookupIn(found));
  const { chunks, [CHUNK_FIELD]: field, ...rest } = joined;
  return { ...msg, value: { ...value, content: rest } };
};

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
  CHUNK_FIELD,
  PACKED_FIELD,
  packBody,
  isPacked,
  unpackBody,
  MAX_MESSAGE_CHARS,
  messageChars,
  chunkableField,
  autoChunk,
  autoJoin,
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
