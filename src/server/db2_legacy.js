const pull = require('pull-stream');
const cat = require('pull-cat');
const defer = require('pull-defer');
const pl = require('pull-level');
const bipf = require('bipf');
const ssbKeys = require('ssb-keys');
const ssbMsgs = require('ssb-msgs');
const { heads } = require('ssb-sort');
const Plugin = require('ssb-db2/indexes/plugin');
const { where, and, or, type, author, descending, sortByArrival, toPullStream, seqs, isDecrypted, batch } = require('ssb-db2/operators');

const BIPF_CONTENT = bipf.allocAndEncode('content');
const BIPF_AUTHOR = bipf.allocAndEncode('author');
const LINK_RE = /^[@%&]/;
const SEARCH_LIMIT = 100;
const OPS = ['$gt', '$gte', '$lt', '$lte', '$in', '$is', '$prefix', '$ne', '$truthy', '$eq'];

class LinksIndex extends Plugin {
  constructor(log, dir) {
    super(log, dir, 'oasisLinks', 1, 'json', 'json');
  }

  processRecord(record, seq, pValue) {
    const buf = record.value;
    const pContent = bipf.seekKey2(buf, pValue, BIPF_CONTENT, 0);
    if (pContent < 0) return;
    const content = bipf.decode(buf, pContent);
    if (!content || typeof content !== 'object') return;
    const pAuthor = bipf.seekKey2(buf, pValue, BIPF_AUTHOR, 0);
    const source = pAuthor < 0 ? null : bipf.decode(buf, pAuthor);
    const seen = new Set();
    ssbMsgs.indexLinks(content, (link, rel) => {
      const dest = link && link.link;
      if (typeof dest !== 'string' || !LINK_RE.test(dest)) return;
      const mark = `${dest}\u0000${rel}`;
      if (seen.has(mark)) return;
      seen.add(mark);
      this.batch.push({ type: 'put', key: [dest, seq, rel], value: { s: seq, a: source, r: rel } });
    });
  }

  indexesContent() {
    return true;
  }

  getLinks(dest, cb) {
    pull(
      pl.read(this.level, { gte: [dest, ''], lte: [dest, undefined], keyEncoding: this.keyEncoding, valueEncoding: this.valueEncoding, keys: false }),
      pull.collect((err, arr) => err ? cb(err) : cb(null, (arr || []).filter(Boolean)))
    );
  }
}

const linksOf = (content) => {
  const out = [];
  if (!content || typeof content !== 'object') return out;
  ssbMsgs.indexLinks(content, (link, rel) => {
    const dest = link && link.link;
    if (typeof dest === 'string' && LINK_RE.test(dest)) out.push({ dest, rel });
  });
  return out;
};

const plainOf = (kvt, keys, opts) => {
  if (!kvt || !kvt.value) return null;
  const base = { key: kvt.key, value: kvt.value, timestamp: kvt.timestamp };
  const c = kvt.value.content;
  if (typeof c !== 'string') return opts.decryptedOnly ? null : base;
  if (!opts.private && !opts.decryptedOnly) return base;
  let plain = null;
  try { plain = ssbKeys.unbox(c, keys.private); } catch (_) { plain = null; }
  if (!plain) return opts.decryptedOnly ? null : base;
  return legacy({ key: kvt.key, value: { ...kvt.value, content: plain }, timestamp: kvt.timestamp, meta: { private: true, originalContent: c } }, { private: opts.private });
};

const liveTap = (sbot, keys, opts, match) => {
  const items = [];
  let waiting = null;
  let ended = null;
  const remove = sbot.db.onMsgAdded((ev) => {
    if (ended) return false;
    const m = plainOf(ev && ev.kvt, keys, opts);
    if (!m || (match && !match(m))) return;
    items.push(m);
    if (waiting) { const w = waiting; waiting = null; w(null, items.shift()); }
  }, false);
  return (abort, cb) => {
    if (abort) {
      if (!ended) { ended = abort; items.length = 0; remove(); }
      return cb(abort);
    }
    if (items.length) return cb(null, items.shift());
    if (ended) return cb(ended);
    waiting = cb;
  };
};

const withSync = (old$, live$, opts = {}) => {
  const seen = new Set();
  const parts = [];
  if (opts.old !== false) parts.push(pull(old$, pull.through((m) => { if (m && m.key) seen.add(m.key); })));
  if (opts.sync !== false) parts.push(pull.values([{ sync: true }]));
  parts.push(pull(live$, pull.filter((m) => !(m && m.key && seen.has(m.key)))));
  return cat(parts);
};

const legacy = (msg, opts = {}) => {
  if (!msg || !msg.value || msg.sync) return msg;
  const priv = msg.meta && msg.meta.private === true;
  if (!priv) return { key: msg.key, value: msg.value, timestamp: msg.timestamp };
  if (!opts.private) return { key: msg.key, value: { ...msg.value, content: msg.meta.originalContent }, timestamp: msg.timestamp };
  return {
    key: msg.key,
    value: { ...msg.value, private: true, meta: { ...(msg.value.meta || {}), private: true, original: { content: msg.meta.originalContent } } },
    timestamp: msg.timestamp
  };
};

const isOpObject = (f) => f && typeof f === 'object' && !Array.isArray(f) && Object.keys(f).some(k => OPS.includes(k));

const matchValue = (v, f) => {
  if (isOpObject(f)) {
    for (const op of Object.keys(f)) {
      const arg = f[op];
      if (op === '$gt' && !(v > arg)) return false;
      if (op === '$gte' && !(v >= arg)) return false;
      if (op === '$lt' && !(v < arg)) return false;
      if (op === '$lte' && !(v <= arg)) return false;
      if (op === '$in' && !(Array.isArray(arg) && arg.includes(v))) return false;
      if (op === '$is' && typeof v !== arg) return false;
      if (op === '$prefix' && !(typeof v === 'string' && v.startsWith(arg))) return false;
      if (op === '$ne' && v === arg) return false;
      if (op === '$truthy' && !v) return false;
      if (op === '$eq' && v !== arg) return false;
    }
    return true;
  }
  if (f && typeof f === 'object' && !Array.isArray(f)) {
    if (!v || typeof v !== 'object') return false;
    return Object.keys(f).every(k => matchValue(v[k], f[k]));
  }
  if (Array.isArray(f)) return JSON.stringify(v) === JSON.stringify(f);
  return v === f;
};

const formatter = (opts = {}) => {
  if (opts.keys === false && opts.values !== false) return (m) => (m && m.sync) ? m : m.value;
  if (opts.values === false) return (m) => (m && m.sync) ? m : m.key;
  return (m) => m;
};

const matchFilter = (msg, filter) => {
  if (!filter) return true;
  return Object.keys(filter).every(k => k === 'dest' ? true : matchValue(msg[k], filter[k]));
};

const opsFor = (filter) => {
  const ops = [];
  const value = filter && filter.value;
  const content = value && value.content;
  const t = content && content.type;
  if (typeof t === 'string') ops.push(type(t));
  else if (t && Array.isArray(t.$in) && t.$in.length) ops.push(or(...t.$in.map(x => type(x))));
  if (value && typeof value.author === 'string') ops.push(author(value.author));
  if (!ops.length) return null;
  return ops.length === 1 ? ops[0] : and(...ops);
};

const filterOf = (filter) => filter ? (m) => matchFilter(m, filter) : null;

module.exports = [
  {
    manifest: {
      createUserStream: 'source',
      messagesByType: 'source',
      links: 'source',
      createLogStream: 'source',
      get: 'async',
      whoami: 'sync',
      status: 'sync',
      progress: 'sync',
      rebuild: 'async'
    },
    init(sbot, config) {
      sbot.db.registerIndex(LinksIndex);
      const linksIndex = () => sbot.db.getIndex('oasisLinks');

      const query = (ops, extra) => sbot.db.query(...[ops ? where(ops) : null, ...extra, batch(1000), toPullStream()].filter(Boolean));

      const stream = (ops, opts = {}) => {
        const shape = () => pull.map(m => legacy(m, { private: opts.private }));
        const boxed = () => opts.skipPrivate ? pull.filter(m => m.sync || typeof (m.value && m.value.content) !== 'string') : pull.through();
        const pass = () => opts.filter ? pull.filter(opts.filter) : pull.through();
        const limit = typeof opts.limit === 'number' && opts.limit >= 0 ? opts.limit : -1;
        const order = [opts.arrival ? sortByArrival() : null, opts.reverse ? descending() : null].filter(Boolean);
        const fmt = formatter(opts);
        if (!opts.live) return pull(query(ops, order), shape(), boxed(), pass(), limit >= 0 ? pull.take(limit) : pull.through(), pull.map(fmt));
        const match = (m) => (!opts.skipPrivate || typeof (m.value && m.value.content) !== 'string') && (!opts.match || opts.match(m)) && (!opts.filter || opts.filter(m));
        const live$ = liveTap(sbot, config.keys, { private: opts.private, decryptedOnly: opts.decryptedOnly }, match);
        const old$ = pull(query(ops, order), shape(), boxed(), pass(), limit >= 0 ? pull.take(limit) : pull.through());
        return pull(withSync(old$, live$, opts), pull.map(fmt));
      };

      const bySeqs = (list, opts = {}) => {
        const unique = [...new Set(list)];
        if (!unique.length) return pull.empty();
        return pull(query(seqs(unique), []), pull.map(m => legacy(m, { private: opts.private })));
      };

      const linked = (dest, opts, cb) => {
        sbot.db.onDrain('oasisLinks', () => {
          const idx = linksIndex();
          if (!idx) return cb(null, []);
          idx.getLinks(dest, (err, entries) => {
            if (err) return cb(err);
            const wanted = entries.filter(e => (!opts.rel || e.r === opts.rel) && (!opts.source || e.a === opts.source));
            pull(bySeqs(wanted.map(e => e.s), opts), pull.collect(cb));
          });
        });
      };

      const liveLinked = (dest, opts) => liveTap(sbot, config.keys, { private: opts.private }, (m) =>
        linksOf(m.value && m.value.content).some(l => l.dest === dest && (!opts.rel || l.rel === opts.rel)) && (!opts.source || m.value.author === opts.source));

      const sortLegacy = (arr, byTs, reverse) => {
        const claimed = (m) => Number(m.value && m.value.timestamp) || 0;
        const arrival = (m) => Number(m.timestamp) || 0;
        const seq = (m) => Number(m.value && m.value.sequence) || 0;
        arr.sort((a, b) => (byTs ? (claimed(a) - claimed(b)) : 0) || (arrival(a) - arrival(b)) || (seq(a) - seq(b)));
        if (reverse) arr.reverse();
        return arr;
      };

      const status = () => {
        const st = (sbot.db.getStatus && sbot.db.getStatus().value) || { log: 0, jit: {}, indexes: {}, progress: 1 };
        return {
          sync: { since: Number(st.log) || 0, plugins: { ...(st.indexes || {}) } },
          jit: { ...(st.jit || {}) },
          progress: typeof st.progress === 'number' ? st.progress : 1,
          db: 'ssb-db2'
        };
      };

      const progress = () => {
        const st = status();
        const target = st.sync.since;
        return { indexes: { start: 0, current: Math.min(target, Math.round(st.progress * target)), target } };
      };

      const rebuild = (cb) => {
        if (typeof cb === 'function') return sbot.db.reset(cb);
        return new Promise((resolve, reject) => sbot.db.reset((err) => err ? reject(err) : resolve()));
      };

      const createUserStream = (opts = {}) => {
        const id = typeof opts === 'string' ? opts : opts.id;
        if (!id) return pull.error(new Error('createUserStream: missing id'));
        const seqOf = (m) => Number(m.value && m.value.sequence) || 0;
        const filter = (opts.gt !== undefined || opts.gte !== undefined || opts.lt !== undefined || opts.lte !== undefined)
          ? (m) => (opts.gt === undefined || seqOf(m) > opts.gt) && (opts.gte === undefined || seqOf(m) >= opts.gte) && (opts.lt === undefined || seqOf(m) < opts.lt) && (opts.lte === undefined || seqOf(m) <= opts.lte)
          : null;
        return stream(author(id), { reverse: opts.reverse === true, limit: opts.limit, live: opts.live === true, old: opts.old, sync: opts.sync, filter, match: (m) => m.value && m.value.author === id, private: opts.private === true, arrival: true, keys: opts.keys, values: opts.values });
      };

      const messagesByType = (opts = {}) => {
        const t = typeof opts === 'string' ? opts : opts.type;
        if (!t) return pull.error(new Error('messagesByType: missing type'));
        const o = typeof opts === 'string' ? {} : opts;
        return stream(type(t), { reverse: o.reverse === true, limit: o.limit, live: o.live === true, old: o.old, sync: o.sync, skipPrivate: true, match: (m) => !!(m.value && m.value.content && m.value.content.type === t), arrival: true, keys: o.keys, values: o.values });
      };

      const links = (opts = {}) => {
        const src = defer.source();
        const toLink = (m) => opts.values ? m : { source: m.value.author, dest: opts.dest, rel: opts.rel, key: m.key };
        if (opts.dest) {
          const live$ = opts.live ? liveLinked(opts.dest, { rel: opts.rel, source: opts.source }) : null;
          linked(opts.dest, { rel: opts.rel, source: opts.source }, (err, arr) => {
            if (err) { if (live$) live$(err, () => {}); return src.abort(err); }
            const out = sortLegacy(arr, false, opts.reverse === true);
            if (!live$) return src.resolve(pull(pull.values(out), pull.map(toLink)));
            src.resolve(pull(withSync(pull.values(out), live$, opts), pull.map((m) => m.sync ? m : toLink(m))));
          });
          return src;
        }
        const ops = opts.source ? author(opts.source) : null;
        src.resolve(pull(
          stream(ops, { reverse: opts.reverse === true, arrival: true }),
          pull.map(m => linksOf(m.value && m.value.content).filter(l => !opts.rel || l.rel === opts.rel).map(l => opts.values ? m : { source: m.value.author, dest: l.dest, rel: l.rel, key: m.key })),
          pull.flatten()
        ));
        return src;
      };

      const createLogStream = (opts = {}) => {
        const shaped = stream(null, { reverse: opts.reverse === true, limit: opts.limit, live: opts.live === true, old: opts.old, sync: opts.sync, arrival: true, keys: opts.keys, values: opts.values });
        const hasRange = ['gt', 'gte', 'lt', 'lte'].some(k => opts[k] !== undefined && opts[k] !== null);
        if (!hasRange) return shaped;
        const ts = (m) => Number(m && m.timestamp) || 0;
        return pull(shaped, pull.filter(m => !m || m.sync || typeof m !== 'object' || (
          (opts.gt === undefined || opts.gt === null || ts(m) > opts.gt) &&
          (opts.gte === undefined || opts.gte === null || ts(m) >= opts.gte) &&
          (opts.lt === undefined || opts.lt === null || ts(m) < opts.lt) &&
          (opts.lte === undefined || opts.lte === null || ts(m) <= opts.lte)
        )));
      };

      const get = (idOrObject, cb) => {
        const isObj = !!(idOrObject && typeof idOrObject === 'object');
        const id = isObj ? idOrObject.id : idOrObject;
        sbot.db.getMsg(id, (err, msg) => {
          if (err) return cb(err);
          const shaped = legacy(msg, { private: isObj && idOrObject.private === true });
          cb(null, isObj && idOrObject.meta ? shaped : shaped.value);
        });
      };

      const whoami = () => ({ id: sbot.id });

      sbot._oasisDb2 = { stream, linked, liveLinked, bySeqs, sortLegacy, legacy, matchFilter, opsFor, filterOf, linksOf };
      return { createUserStream, messagesByType, links, createLogStream, get, whoami, status, progress, rebuild };
    }
  },
  {
    name: 'private',
    version: '1.0.0',
    manifest: { publish: 'async', unbox: 'sync', read: 'source' },
    init(sbot, config) {
      return {
        publish(content, recps, cb) {
          const list = (Array.isArray(recps) ? recps : [recps]).map(r => typeof r === 'string' ? r : (r && r.link)).filter(Boolean);
          if (!list.length) return cb(new Error('private.publish: no recipients'));
          sbot.db.create({ content, recps: list, encryptionFormat: 'box' }, (err, kvt) => err ? cb(err) : cb(null, legacy(kvt)));
        },
        unbox(msgOrData) {
          if (typeof msgOrData === 'string') return ssbKeys.unbox(msgOrData, config.keys.private);
          if (!msgOrData || !msgOrData.value || typeof msgOrData.value.content !== 'string') return undefined;
          let plain = null;
          try { plain = ssbKeys.unbox(msgOrData.value.content, config.keys.private); } catch (_) { plain = null; }
          if (!plain) return undefined;
          const v = msgOrData.value;
          return {
            key: msgOrData.key,
            value: { previous: v.previous, author: v.author, sequence: v.sequence, timestamp: v.timestamp, hash: v.hash, content: plain, private: true },
            timestamp: msgOrData.timestamp
          };
        },
        read(opts = {}) {
          return sbot._oasisDb2.stream(isDecrypted('box'), { reverse: opts.reverse === true, limit: opts.limit, live: opts.live === true, old: opts.old, sync: opts.sync, private: true, decryptedOnly: true, arrival: true, keys: opts.keys, values: opts.values });
        }
      };
    }
  },
  {
    name: 'backlinks',
    version: '1.0.0',
    manifest: { read: 'source' },
    init(sbot) {
      return {
        read(opts = {}) {
          const { stream, linked, liveLinked, sortLegacy, matchFilter, opsFor } = sbot._oasisDb2;
          const filter = (opts.query && opts.query[0] && opts.query[0].$filter) || {};
          const priv = opts.private === true;
          const pass = (m) => matchFilter(m, filter);
          if (!filter.dest) {
            return stream(opsFor(filter), { reverse: opts.reverse === true, limit: opts.limit, live: opts.live === true, old: opts.old, sync: opts.sync, filter: pass, private: priv });
          }
          const src = defer.source();
          const limit = typeof opts.limit === 'number' && opts.limit >= 0 ? opts.limit : -1;
          const fmt = formatter(opts);
          const live$ = opts.live ? pull(liveLinked(filter.dest, { private: priv }), pull.filter(pass)) : null;
          const finish = (arr) => {
            let out = sortLegacy(arr.filter(pass), opts.index === 'DTA', opts.reverse === true);
            if (limit >= 0) out = out.slice(0, limit);
            if (!live$) return src.resolve(pull(pull.values(out), pull.map(fmt)));
            src.resolve(pull(withSync(pull.values(out), live$, opts), pull.map(fmt)));
          };
          if (opts.old === false && opts.live) return finish([]), src;
          linked(filter.dest, { private: priv }, (err, arr) => {
            if (!err) return finish(arr);
            if (live$) live$(err, () => {});
            src.abort(err);
          });
          return src;
        }
      };
    }
  },
  {
    name: 'query',
    version: '1.0.0',
    manifest: { read: 'source' },
    init(sbot) {
      return {
        read(opts = {}) {
          const { stream, opsFor, filterOf } = sbot._oasisDb2;
          const filter = (opts.query && opts.query[0] && opts.query[0].$filter) || null;
          return stream(opsFor(filter), { reverse: opts.reverse === true, limit: opts.limit, live: opts.live === true, old: opts.old, sync: opts.sync, filter: filterOf(filter), skipPrivate: true, keys: opts.keys, values: opts.values });
        }
      };
    }
  },
  {
    name: 'search',
    version: '1.0.0',
    manifest: { query: 'source' },
    init(sbot) {
      const textOf = (c) => ['text', 'title', 'description', 'body', 'name', 'summary'].map(k => c && typeof c[k] === 'string' ? c[k] : '').join('\n').toLowerCase();
      return {
        query(opts = {}) {
          const needle = String(opts.query || '').trim().toLowerCase();
          if (!needle) return pull.empty();
          const terms = needle.split(/\s+/).filter(Boolean);
          const limit = typeof opts.limit === 'number' && opts.limit > 0 ? opts.limit : SEARCH_LIMIT;
          return sbot._oasisDb2.stream(null, {
            reverse: opts.reverse !== false,
            limit,
            skipPrivate: true,
            arrival: true,
            filter: (m) => { const c = m.value && m.value.content; if (!c || typeof c !== 'object') return false; const hay = textOf(c); return terms.every(t => hay.includes(t)); }
          });
        }
      };
    }
  },
  {
    name: 'tangle',
    version: '1.0.0',
    manifest: { branch: 'async' },
    init(sbot) {
      return {
        branch(rootKey, cb) {
          if (typeof rootKey !== 'string' || !rootKey.startsWith('%')) return cb(new Error('tangle.branch requires a message key'));
          sbot._oasisDb2.linked(rootKey, {}, (err, arr) => {
            if (err) return cb(err);
            const thread = arr.filter(m => m.value && m.value.content && typeof m.value.content === 'object' && m.value.content.root === rootKey);
            cb(null, heads([{ key: rootKey }, ...thread]));
          });
        }
      };
    }
  }
];

module.exports.LinksIndex = LinksIndex;
module.exports.legacy = legacy;
module.exports.matchFilter = matchFilter;
