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

const isDeletion = (m) => {
  const c = m && m.value && m.value.content;
  return !!c && typeof c === 'object' && c.type === 'tombstone';
};

const readContentWindow = (ssb, limit) => {
  if (!limit) return collectStream(ssb.createLogStream({ reverse: true }));
  let kept = 0;
  return collectStream(pull(
    ssb.createLogStream({ reverse: true }),
    pull.take((m) => { if (!isDeletion(m)) kept++; return kept <= limit; })
  ));
};

const caches = new WeakMap();

const cacheFor = (ssb) => {
  let c = caches.get(ssb);
  if (!c) {
    c = { types: new Map(), window: null, results: new Map() };
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

const UNCAPPED_TYPES = new Set(['tombstone']);
const syncType = async (ssb, cache, type, requestedLimit) => {
  const limit = UNCAPPED_TYPES.has(type) ? 0 : requestedLimit;
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
    entry.warming = readContentWindow(ssb, limit)
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
    const all = await readContentWindow(ssb, limit);
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

const logTailOf = async (ssb, n) => {
  if (ssb.activity && typeof ssb.activity.tail === 'function') {
    const store = requestScope.getStore();
    const fresh = !(store && store.method === 'GET');
    const fast = await new Promise((resolve) => {
      try { ssb.activity.tail(n, { fresh }, (err, arr) => resolve(err ? null : arr)); } catch (_) { resolve(null); }
    });
    if (Array.isArray(fast)) return fast;
  }
  return collectStream(ssb.createLogStream({ reverse: true, limit: n }));
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

  const logTail = (await logTailOf(ssbClient, LOG_TAIL_PROBE)).reverse();
  const tipKey = logTail.length ? logTail[logTail.length - 1].key : null;
  const inTail = new Set(logTail.map((m) => m && m.key));
  const upToDate = (e) => !!e && e.warm && e.tip === tipKey;
  const caughtUp = (e) => !!e && e.warm && !!e.tip && (e.tip === tipKey || inTail.has(e.tip));
  const allWarm = types.every((type) => upToDate(cache.types.get(type)))
    && (!opts.withWindow || upToDate(cache.window));

  const entries = await Promise.all(types.map((type) => {
    const e = cache.types.get(type);
    return caughtUp(e) ? e : syncType(ssbClient, cache, type, limit);
  }));
  const windowEntry = opts.withWindow
    ? (caughtUp(cache.window) ? cache.window : await syncWindow(ssbClient, cache, limit))
    : null;
  const withPrivate = opts.withPrivate === true;
  const resultKey = `${types.join(',')}|${limit || 0}|${opts.withWindow ? 1 : 0}|${withPrivate ? 1 : 0}`;
  if (allWarm && (!withPrivate || !wanted.size || upToDate(cache.private))) {
    const hit = cache.results.get(resultKey);
    if (hit && hit.tip === tipKey) {
      if (hit.capped) noteCapped(limit, limit);
      return hit.list.slice();
    }
  }
  const privateEntry = withPrivate && wanted.size
    ? (!upToDate(cache.private) ? await syncPrivate(ssbClient, cache) : cache.private)
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
  let capped = false;
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.capped) { capped = true; noteCapped(limit, limit); }
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
  const sorted = Array.from(union.values()).sort((a, b) => {
    const at = (a.value && a.value.timestamp) || 0;
    const bt = (b.value && b.value.timestamp) || 0;
    if (at !== bt) return at - bt;
    const ar = a.timestamp || 0;
    const br = b.timestamp || 0;
    if (ar !== br) return ar - br;
    if (a.value && b.value && a.value.author === b.value.author) return (a.value.sequence || 0) - (b.value.sequence || 0);
    return 0;
  });
  const complete = entries.every((e) => e && e.warm)
    && (!windowEntry === !opts.withWindow) && (!windowEntry || windowEntry.warm)
    && (!(withPrivate && wanted.size) || (privateEntry && privateEntry.warm));
  if (tipKey && complete) cache.results.set(resultKey, { tip: tipKey, capped, list: sorted });
  return sorted.slice();
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

const logTip = async (ssb) => {
  const tail = await logTailOf(ssb, 1);
  return tail[0] && tail[0].key ? tail[0].key : null;
};

const activityCache = new WeakMap();
const ACTIVITY_TTL_MS = 5000;
const authorActivity = (ssb) => {
  if (!ssb || !ssb.activity || typeof ssb.activity.latest !== 'function') return Promise.resolve(null);
  const hit = activityCache.get(ssb);
  if (hit && Date.now() - hit.at < ACTIVITY_TTL_MS) return hit.pending;
  const store = requestScope.getStore();
  const fresh = !(store && store.method === 'GET');
  const pending = new Promise((resolve) => {
    try { ssb.activity.latest(null, { fresh }, (err, all) => resolve(err || !all ? null : new Map(Object.entries(all)))); } catch (_) { resolve(null); }
  });
  activityCache.set(ssb, { at: Date.now(), pending });
  return pending;
};

const memoIndex = (name, messages, build) => {
  const store = requestScope.getStore();
  if (!store) return build(messages);
  const list = Array.isArray(messages) ? messages : [];
  const first = list[0];
  const last = list[list.length - 1];
  const sig = `${list.length}|${first && first.key}|${last && last.key}`;
  if (!store.indexMemo) store.indexMemo = new Map();
  const hit = store.indexMemo.get(name);
  if (hit && hit.sig === sig) return hit.idx;
  const idx = build(messages);
  store.indexMemo.set(name, { sig, idx });
  return idx;
};

module.exports = { readTyped, collectStream, readContentWindow, CONTENT_TYPES, discoverContentTypes, requestScope, memoIndex, logTip, authorActivity };
