const crypto = require('crypto');
const pull = require('../../src/server/node_modules/pull-stream');
const ssbKeys = require('../../src/server/node_modules/ssb-keys');

let pullPushable;
try {
  pullPushable = require('../../src/server/node_modules/pull-pushable');
} catch (_) {
  try { pullPushable = require('../../src/server/node_modules/@krakenslab/pull-pushable'); } catch (__) {}
}

const generateMsgKey = () => '%' + crypto.randomBytes(32).toString('base64').replace(/=+$/, '') + '.sha256';

function makeNetwork() {
  const log = [];
  const liveListeners = new Set();
  return {
    log,
    publish(msg) {
      log.push(msg);
      for (const cb of liveListeners) {
        try { cb(msg); } catch (_) {}
      }
    },
    listen(cb) {
      liveListeners.add(cb);
      return () => liveListeners.delete(cb);
    },
    reset() {
      log.length = 0;
      liveListeners.clear();
    }
  };
}

function makeNode(network, keypair, opts = {}) {
  const seqByAuthor = new Map();
  const node = {
    id: keypair.id,
    keys: keypair,
    publish(content, cb) {
      let actualContent = content;
      if (content && typeof content === 'object' && Array.isArray(content.recps) && content.recps.length) {
        try {
          actualContent = ssbKeys.box(content, content.recps);
        } catch (e) {
          if (cb) cb(e);
          return;
        }
      }
      const key = generateMsgKey();
      const prev = seqByAuthor.get(keypair.id) || 0;
      const sequence = prev + 1;
      seqByAuthor.set(keypair.id, sequence);
      const ts = Date.now();
      const msg = {
        key,
        value: {
          previous: null,
          sequence,
          author: keypair.id,
          timestamp: ts,
          hash: 'sha256',
          content: actualContent,
          signature: 'mock-sig'
        },
        timestamp: ts
      };
      network.publish(msg);
      if (cb) cb(null, { key, value: msg.value });
    },
    createLogStream(opt = {}) {
      const { limit, reverse, live, old } = opt;
      const items = network.log.slice();
      const baseItems = old !== false ? items : [];
      let prepared = baseItems;
      if (reverse) prepared = prepared.slice().reverse();
      if (limit) prepared = prepared.slice(0, limit);
      if (!live) return pull.values(prepared);
      if (!pullPushable) {
        const initial = pull.values(prepared);
        return initial;
      }
      const p = pullPushable();
      for (const m of prepared) p.push(m);
      const off = network.listen(m => p.push(m));
      const origAbort = p.end;
      p.end = (err) => { off(); if (origAbort) origAbort.call(p, err); };
      return p;
    },
    createUserStream(opt = {}) {
      const { id, reverse, limit } = opt;
      let items = network.log.filter(m => m.value && m.value.author === id);
      if (reverse) items = items.slice().reverse();
      if (limit) items = items.slice(0, limit);
      return pull.values(items);
    },
    get(key, cb) {
      const m = network.log.find(x => x.key === key);
      if (!m) return cb(new Error('not found'));
      cb(null, m.value);
    },
    private: {
      publish(content, recps, cb) {
        let actualContent;
        try {
          actualContent = ssbKeys.box(content, recps);
        } catch (e) { if (cb) cb(e); return; }
        const key = generateMsgKey();
        const prev = seqByAuthor.get(keypair.id) || 0;
        const sequence = prev + 1;
        seqByAuthor.set(keypair.id, sequence);
        const ts = Date.now();
        const msg = { key, value: { previous: null, sequence, author: keypair.id, timestamp: ts, hash: 'sha256', content: actualContent, signature: 'mock-sig' }, timestamp: ts };
        network.publish(msg);
        if (cb) cb(null, { key, value: msg.value });
      },
      unbox(arg) {
        const c = arg && arg.value ? arg.value.content : arg;
        if (typeof c !== 'string' || !c.endsWith('.box')) return null;
        try {
          const decoded = ssbKeys.unbox(c, keypair);
          if (!decoded) return null;
          if (arg && arg.value) {
            return { key: arg.key, value: { ...arg.value, content: decoded }, timestamp: arg.timestamp };
          }
          return decoded;
        } catch (_) { return null; }
      }
    },
    blobs: { has(_url, cb) { cb(null, true); } },
    conn: { hub() { return { listen: () => null }; } },
    replicate: { upto(cb) { if (cb) cb(null, {}); } },
    whoami(cb) { cb(null, { id: keypair.id }); },
    links(opts = {}) {
      const out = [];
      for (const m of network.log) {
        const c = m.value && m.value.content;
        if (!c) continue;
        if (opts.dest && c.target !== opts.dest && c.root !== opts.dest && (!c.branch || (Array.isArray(c.branch) ? !c.branch.includes(opts.dest) : c.branch !== opts.dest))) continue;
        if (opts.rel === 'target' && c.target !== opts.dest) continue;
        if (opts.values) out.push(m);
        else out.push({ source: m.value.author, dest: opts.dest, key: m.key });
      }
      return pull.values(out);
    },
    messagesByType(opts = {}) {
      const wantedType = typeof opts === 'string' ? opts : opts.type;
      const items = network.log.filter(m => {
        const c = m.value && m.value.content;
        return c && typeof c === 'object' && c.type === wantedType;
      });
      return pull.values(items);
    },
    backlinks: {
      read(opts = {}) {
        const filters = opts && opts.query && opts.query[0] && opts.query[0].$filter || {};
        const dest = filters.dest;
        const wantType = filters.value && filters.value.content && filters.value.content.type;
        const wantAuthor = filters.value && filters.value.author;
        const refsFor = (c) => {
          const out = [];
          const walk = (v) => {
            if (!v) return;
            if (typeof v === 'string' && v.startsWith('%')) out.push(v);
            else if (Array.isArray(v)) v.forEach(walk);
            else if (typeof v === 'object') Object.values(v).forEach(walk);
          };
          walk(c);
          return out;
        };
        const matches = network.log.filter(m => {
          const c = m.value && m.value.content;
          if (!c || typeof c !== 'object') return false;
          if (wantType && c.type !== wantType) return false;
          if (wantAuthor && m.value.author !== wantAuthor) return false;
          if (dest && !refsFor(c).includes(dest)) return false;
          return true;
        });
        return pull.values(opts && opts.reverse ? matches.slice().reverse() : matches);
      }
    }
  };
  return node;
}

function makeCooler(node) {
  return { open: async () => node };
}

function generateKeypair() {
  return ssbKeys.generate();
}

module.exports = { makeNetwork, makeNode, makeCooler, generateKeypair };
