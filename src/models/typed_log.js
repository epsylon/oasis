const pull = require('../server/node_modules/pull-stream');
const { AsyncLocalStorage } = require('async_hooks');

const requestScope = new AsyncLocalStorage();
const noteCapped = (limit, size) => {
  if (!limit || !(size >= limit)) return;
  const store = requestScope.getStore();
  if (store) { store.capped = true; store.limit = limit; }
};

const TAIL_PROBE = 50;
const LOG_TAIL_PROBE = 20;

const collectStream = (stream) =>
  new Promise((resolve, reject) => {
    pull(stream, pull.collect((err, msgs) => (err ? reject(err) : resolve(msgs))));
  });

const caches = new WeakMap();

const cacheFor = (ssb) => {
  let c = caches.get(ssb);
  if (!c) {
    c = { types: new Map(), window: null };
    caches.set(ssb, c);
  }
  return c;
};

const insert = (entry, msgs) => {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m && m.key && !entry.byKey.has(m.key)) entry.byKey.set(m.key, m);
  }
};

const syncType = async (ssb, cache, type, limit) => {
  let entry = cache.types.get(type);
  if (!entry) {
    entry = { byKey: new Map(), warming: null, warm: false };
    cache.types.set(type, entry);
    entry.warming = collectStream(ssb.messagesByType(limit ? { type, reverse: true, limit } : { type, reverse: true }))
      .then((msgs) => { insert(entry, msgs); entry.warm = true; entry.capped = !!(limit && msgs.length >= limit); })
      .catch(() => { cache.types.delete(type); });
    await entry.warming;
    return entry;
  }
  await entry.warming;
  if (!entry.warm) return entry;
  const tail = await collectStream(ssb.messagesByType({ type, reverse: true, limit: TAIL_PROBE }));
  const fresh = tail.filter((m) => m && m.key && !entry.byKey.has(m.key));
  if (fresh.length === tail.length && tail.length === TAIL_PROBE) {
    const all = await collectStream(ssb.messagesByType(limit ? { type, reverse: true, limit } : { type, reverse: true }));
    insert(entry, all);
    entry.capped = !!(limit && all.length >= limit);
  } else {
    insert(entry, fresh);
  }
  return entry;
};

const syncWindow = async (ssb, cache, limit) => {
  let entry = cache.window;
  if (!entry) {
    entry = { byKey: new Map(), warming: null, warm: false };
    cache.window = entry;
    entry.warming = collectStream(ssb.createLogStream(limit ? { reverse: true, limit } : { reverse: true }))
      .then((msgs) => { insert(entry, msgs); entry.warm = true; })
      .catch(() => { cache.window = null; });
    await entry.warming;
    return entry;
  }
  await entry.warming;
  if (!entry.warm) return entry;
  const tail = await collectStream(ssb.createLogStream({ reverse: true, limit: TAIL_PROBE }));
  const fresh = tail.filter((m) => m && m.key && !entry.byKey.has(m.key));
  if (fresh.length === tail.length && tail.length === TAIL_PROBE) {
    const all = await collectStream(ssb.createLogStream(limit ? { reverse: true, limit } : { reverse: true }));
    insert(entry, all);
  } else {
    insert(entry, fresh);
  }
  return entry;
};

const syncPrivate = async (ssb, cache) => {
  if (!ssb.private || typeof ssb.private.read !== 'function') return null;
  let entry = cache.private;
  if (!entry) {
    entry = { byKey: new Map(), warming: null, warm: false };
    cache.private = entry;
    entry.warming = collectStream(ssb.private.read({ reverse: true }))
      .then((msgs) => { insert(entry, msgs); entry.warm = true; })
      .catch(() => { cache.private = null; });
    await entry.warming;
    return entry;
  }
  await entry.warming;
  if (!entry.warm) return entry;
  const tail = await collectStream(ssb.private.read({ reverse: true, limit: TAIL_PROBE }));
  const fresh = tail.filter((m) => m && m.key && !entry.byKey.has(m.key));
  if (fresh.length === tail.length && tail.length === TAIL_PROBE) {
    insert(entry, await collectStream(ssb.private.read({ reverse: true })));
  } else {
    insert(entry, fresh);
  }
  return entry;
};

const readTyped = async (ssbClient, types, opts = {}) => {
  const limit = opts.limit;
  if (typeof ssbClient.messagesByType !== 'function') {
    const all = await collectStream(ssbClient.createLogStream(limit ? { limit } : {}));
    noteCapped(limit, all.length);
    return all;
  }
  const cache = cacheFor(ssbClient);
  const wanted = new Set(types);

  const logTail = (await collectStream(ssbClient.createLogStream({ reverse: true, limit: LOG_TAIL_PROBE }))).reverse();
  const tipKey = logTail.length ? logTail[logTail.length - 1].key : null;
  const upToDate = (e) => !!e && e.warm && e.tip === tipKey;
  const allWarm = types.every((type) => upToDate(cache.types.get(type)))
    && (!opts.withWindow || upToDate(cache.window));

  const entries = !allWarm
    ? await Promise.all(types.map((type) => syncType(ssbClient, cache, type, limit)))
    : types.map((type) => cache.types.get(type));
  const windowEntry = opts.withWindow
    ? (!allWarm ? await syncWindow(ssbClient, cache, limit) : cache.window)
    : null;
  const withPrivate = opts.withPrivate === true;
  const privateEntry = withPrivate && wanted.size
    ? (!allWarm || !upToDate(cache.private) ? await syncPrivate(ssbClient, cache) : cache.private)
    : null;
  for (const e of [...entries, windowEntry, privateEntry]) if (e && e.warm) e.tip = tipKey;

  for (const m of logTail) {
    if (!m || !m.key || !m.value) continue;
    const t = m.value.content && m.value.content.type;
    if (typeof t === 'string' && wanted.has(t)) {
      const entry = cache.types.get(t);
      if (entry && entry.warm && !entry.byKey.has(m.key)) entry.byKey.set(m.key, m);
    }
    if (windowEntry && windowEntry.warm && !windowEntry.byKey.has(m.key)) windowEntry.byKey.set(m.key, m);
  }

  const union = new Map();
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.capped) noteCapped(limit, limit);
    for (const [k, m] of entry.byKey) if (!union.has(k)) union.set(k, m);
  }
  if (windowEntry) {
    for (const [k, m] of windowEntry.byKey) if (!union.has(k)) union.set(k, m);
  }
  if (privateEntry && privateEntry.warm) {
    for (const [k, m] of privateEntry.byKey) {
      const t = m && m.value && m.value.content && m.value.content.type;
      if (typeof t === 'string' && wanted.has(t)) union.set(k, m);
    }
  }
  return Array.from(union.values()).sort((a, b) => {
    const at = (a.value && a.value.timestamp) || 0;
    const bt = (b.value && b.value.timestamp) || 0;
    if (at !== bt) return at - bt;
    const ar = a.timestamp || 0;
    const br = b.timestamp || 0;
    if (ar !== br) return ar - br;
    if (a.value && b.value && a.value.author === b.value.author) return (a.value.sequence || 0) - (b.value.sequence || 0);
    return 0;
  });
};

const NON_MESSAGE_LITERALS = new Set([
  'hidden', 'submit', 'text', 'file', 'number', 'checkbox', 'radio', 'password', 'date', 'datetime-local', 'time', 'url', 'email', 'search', 'button', 'reset',
  'png', 'jpeg', 'jpg', 'gif', 'svg', 'webp', 'pdf', 'zip', 'json', 'html', 'error', 'meta', 'msg', 'blob', 'peer', 'inhabitant', 'chatThread', 'taskAssignment'
]);
const CORE_TYPES = ['post', 'about', 'contact', 'vote', 'pub', 'tombstone', 'file', 'textChunk'];

const discoverContentTypes = () => {
  const fs = require('fs');
  const path = require('path');
  const found = new Set(CORE_TYPES);
  const sources = [];
  try {
    for (const f of fs.readdirSync(__dirname)) if (f.endsWith('.js') && f !== 'typed_log.js') sources.push(path.join(__dirname, f));
    sources.push(path.join(__dirname, '..', 'backend', 'backend.js'));
  } catch (_) {}
  for (const file of sources) {
    let src = '';
    try { src = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
    for (const m of src.matchAll(/\btype:\s*['"]([A-Za-z][\w-]*)['"]/g)) {
      if (!NON_MESSAGE_LITERALS.has(m[1])) found.add(m[1]);
    }
    for (const m of src.matchAll(/\b(?:const|let)\s+(?:[A-Z][A-Z0-9_]*_)?TYPE\s*=\s*['"]([A-Za-z][\w-]*)['"]/g)) {
      if (!NON_MESSAGE_LITERALS.has(m[1])) found.add(m[1]);
    }
  }
  return Array.from(found).sort();
};

const CONTENT_TYPES = discoverContentTypes();

module.exports = { readTyped, collectStream, CONTENT_TYPES, discoverContentTypes, requestScope };
