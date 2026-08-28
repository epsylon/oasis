const pull = require('../server/node_modules/pull-stream');

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
      .then((msgs) => { insert(entry, msgs); entry.warm = true; })
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

const readTyped = async (ssbClient, types, opts = {}) => {
  const limit = opts.limit;
  if (typeof ssbClient.messagesByType !== 'function') {
    return collectStream(ssbClient.createLogStream(limit ? { limit } : {}));
  }
  const cache = cacheFor(ssbClient);
  const wanted = new Set(types);
  const entries = await Promise.all(types.map((type) => syncType(ssbClient, cache, type, limit)));
  const windowEntry = opts.withWindow ? await syncWindow(ssbClient, cache, limit) : null;

  const logTail = (await collectStream(ssbClient.createLogStream({ reverse: true, limit: LOG_TAIL_PROBE }))).reverse();
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
    for (const [k, m] of entry.byKey) if (!union.has(k)) union.set(k, m);
  }
  if (windowEntry) {
    for (const [k, m] of windowEntry.byKey) if (!union.has(k)) union.set(k, m);
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

module.exports = { readTyped, collectStream };
