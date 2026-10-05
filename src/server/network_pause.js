const fs = require('fs');
const path = require('path');

const readOasisConfig = () => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'configs', 'oasis-config.json'), 'utf8')) || {}; } catch (_) { return {}; }
};

module.exports = {
  name: 'networkPause',
  version: '1.0.0',
  manifest: { pause: 'sync', resume: 'sync', paused: 'sync' },
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

    return {
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
