const fs = require('fs');
const path = require('path');

const readOasisConfig = () => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'configs', 'oasis-config.json'), 'utf8')) || {}; } catch (_) { return {}; }
};

module.exports = {
  name: 'networkPause',
  version: '1.0.0',
  manifest: { pause: 'sync', resume: 'sync', paused: 'sync', lastErrors: 'sync' },
  init(server) {
    server.oasisNetworkPaused = readOasisConfig().networkPaused === true || process.env.OASIS_NETWORK_PAUSED === '1';
    const refused = () => new Error('network paused');

    if (server.auth && typeof server.auth.hook === 'function') {
      server.auth.hook(function (fn, args) {
        const cb = args[args.length - 1];
        if (server.oasisNetworkPaused && args[0] !== server.id && typeof cb === 'function') return cb(refused());
        return fn.apply(this, args);
      });
    }
    if (server.connect && typeof server.connect.hook === 'function') {
      server.connect.hook(function (fn, args) {
        const cb = args[args.length - 1];
        if (server.oasisNetworkPaused && typeof cb === 'function') return cb(refused());
        return fn.apply(this, args);
      });
    }

    const closeAll = () => {
      try { for (const [addr] of server.conn.query().peersInConnection()) server.conn.disconnect(addr, () => {}); } catch (_) {}
      for (const id of Object.keys(server.peers || {})) {
        if (id === server.id) continue;
        for (const rpc of (server.peers[id] || []).slice()) { try { rpc.close(true, () => {}); } catch (_) {} }
      }
    };

    const lastErrors = new Map();
    const keyOf = (ev) => {
      const { canonicalKey } = require('../models/peer_health');
      const m = String((ev && ev.address) || '').match(/~shs:([A-Za-z0-9+/=_-]{43,44})/);
      return canonicalKey((ev && ev.key) || (m ? m[1] : ''));
    };
    const majorMinor = (v) => String(v || '').split('.').slice(0, 2).map(n => parseInt(n, 10) || 0);
    const ownVersion = (() => { try { return String(require('./package.json').version || ''); } catch (_) { return ''; } })();
    const upToDate = (v) => {
      const [a1, b1] = majorMinor(v), [a2, b2] = majorMinor(ownVersion);
      return a1 > a2 || (a1 === a2 && b1 >= b2);
    };
    const rank = { versions: new Map(), graph: {} };
    const refreshRank = () => {
      const pull = require('pull-stream');
      const latest = new Map();
      const done = () => {
        rank.versions = new Map([...latest].map(([k, m]) => [k, m.version]));
        try { server.friends.graph((err, g) => { if (!err && g) rank.graph = g; }); } catch (_) {}
      };
      try {
        if (typeof server.messagesByType !== 'function') return done();
        pull(server.messagesByType({ type: 'oasisVersion' }), pull.drain((m) => {
          const author = m && m.value && m.value.author;
          const c = m && m.value && m.value.content;
          if (!author || !c || typeof c.version !== 'string') return;
          const ts = Number(m.value.timestamp) || 0;
          const prev = latest.get(author);
          if (!prev || prev.ts <= ts) latest.set(author, { version: c.version, ts });
        }, done));
      } catch (_) { done(); }
    };
    const peerRank = (peer) => {
      const key = peer && peer[1] && peer[1].key;
      if (!key) return 0;
      const follows = rank.graph[key] || {};
      const mine = rank.graph[server.id] || {};
      let total = 0, shared = 0;
      for (const [k, v] of Object.entries(follows)) {
        if (!(v >= 0) || k === key) continue;
        total++;
        if (mine[k] >= 0) shared++;
      }
      const v = rank.versions.get(key);
      const tier = v ? (upToDate(v) ? 2 : 0) : (total > 0 ? 0 : 1);
      return tier * 1e9 + Math.min(shared, 99999) * 1e4 + Math.min(total, 9999);
    };
    server.oasisPeerRank = peerRank;
    setImmediate(refreshRank);
    const rankTimer = setInterval(refreshRank, 10 * 60 * 1000);
    if (rankTimer.unref) rankTimer.unref();
    const fallbackAt = new Map();
    const tryOtherAddress = (key, failed, reason) => {
      if (reason === 'paused' || server.oasisNetworkPaused) return;
      if (Array.isArray(server.peers && server.peers[key]) && server.peers[key].length) return;
      const now = Date.now();
      if (now - (fallbackAt.get(key) || 0) < 10 * 60 * 1000) return;
      const { canonicalKey } = require('../models/peer_health');
      let entries = [];
      try { entries = server.conn.dbPeers(); } catch (_) { return; }
      const failedOnion = /^onion:/.test(String(failed || ''));
      const alt = entries.find(([addr, data]) => addr && addr !== failed && data && canonicalKey(data.key) === key && /^onion:/.test(addr) !== failedOnion);
      if (!alt) return;
      fallbackAt.set(key, now);
      try { server.conn.connect(alt[0], { ...(alt[1] || {}) }, () => {}); } catch (_) {}
    };
    let listening = false;
    const listen = () => {
      if (listening) return;
      try {
        const { classifyNetError } = require('../models/peer_health');
        const hub = server.conn && typeof server.conn.hub === 'function' ? server.conn.hub() : null;
        const stream = hub && typeof hub.listen === 'function' ? hub.listen() : null;
        if (!stream) return;
        listening = true;
        require('pull-stream')(stream, require('pull-stream').drain((ev) => {
          const key = ev && keyOf(ev);
          if (!key) return;
          if (ev.type === 'connected') lastErrors.delete(key);
          else if (ev.type === 'connecting-failed') {
            const reason = classifyNetError(ev.details, ev.address);
            lastErrors.set(key, { reason, at: Date.now() });
            if (lastErrors.size > 500) lastErrors.delete(lastErrors.keys().next().value);
            tryOtherAddress(key, ev.address, reason);
          }
        }, () => { listening = false; }));
      } catch (_) { listening = false; }
    };
    const listenTimer = setInterval(() => { listen(); if (listening) clearInterval(listenTimer); }, 1000);
    if (listenTimer.unref) listenTimer.unref();

    return {
      lastErrors() { return Object.fromEntries(lastErrors); },
      pause() {
        server.oasisNetworkPaused = true;
        try { server.conn.stop(); } catch (_) {}
        try { if (server.lan && typeof server.lan.stop === 'function') server.lan.stop(); } catch (_) {}
        closeAll();
        return true;
      },
      resume() {
        server.oasisNetworkPaused = false;
        try { server.conn.start(); } catch (_) {}
        try { if (server.lan && typeof server.lan.start === 'function') server.lan.start(); } catch (_) {}
        return false;
      },
      paused() { return !!server.oasisNetworkPaused; }
    };
  }
};
