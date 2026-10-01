const fs = require('fs');
const path = require('path');
const pull = require('./node_modules/pull-stream');
const defer = require('./node_modules/pull-defer');
const toPull = require('./node_modules/stream-to-pull-stream');

module.exports = {
  name: 'snapshot',
  version: '1.0.0',
  manifest: { info: 'async', get: 'source' },
  permissions: { anonymous: { allow: ['info', 'get'] } },
  init(server, config) {
    const file = (opts) => path.join(config.path, 'oasis', 'content', opts && opts.tier === 'recent' ? 'snapshot-recent.oasissn' : 'snapshot.oasissn');
    const stat = (opts) => {
      try { const st = fs.statSync(file(opts)); return { tier: opts && opts.tier === 'recent' ? 'recent' : 'full', bytes: st.size, createdAt: new Date(st.mtimeMs).toISOString() }; } catch (_) { return null; }
    };
    const allowed = (rpc, cb) => {
      const id = rpc && rpc.id;
      if (!id) return cb(null, false);
      if (id === server.id) return cb(null, true);
      if (!server.friends || typeof server.friends.isFollowing !== 'function') return cb(null, false);
      server.friends.isFollowing({ source: server.id, dest: id }, (err, yes) => cb(null, !err && !!yes));
    };
    return {
      info(opts, cb) {
        if (typeof opts === 'function') { cb = opts; opts = {}; }
        allowed(this, (_, ok) => {
          if (!ok) return cb(new Error('snapshot: not allowed'));
          const s = stat(opts);
          if (!s) return cb(new Error('snapshot: not available'));
          cb(null, s);
        });
      },
      get(opts) {
        const source = defer.source();
        allowed(this, (_, ok) => {
          if (!ok) return source.resolve(pull.error(new Error('snapshot: not allowed')));
          if (!stat(opts)) return source.resolve(pull.error(new Error('snapshot: not available')));
          source.resolve(toPull.source(fs.createReadStream(file(opts))));
        });
        return source;
      }
    };
  }
};
