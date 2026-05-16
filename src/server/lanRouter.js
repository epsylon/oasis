const pull = require('./node_modules/pull-stream');
const Ref = require('./node_modules/ssb-ref');

const staged = new Set();

function stagePeer(ssb, address, key, eagerReplicate) {
  if (!address || !key || key === ssb.id) return;
  if (staged.has(address)) return;
  staged.add(address);
  let routed = false;
  try {
    if (ssb.conn && typeof ssb.conn.stage === 'function') {
      ssb.conn.stage(address, { type: 'lan', key });
      routed = true;
    }
  } catch (_) {}
  if (!routed) {
    try {
      if (ssb.gossip && typeof ssb.gossip.add === 'function') {
        ssb.gossip.add(address, 'local');
      }
    } catch (_) {}
  }
  if (eagerReplicate) {
    try {
      if (ssb.ebt && typeof ssb.ebt.request === 'function') {
        ssb.ebt.request(key, true);
      }
    } catch (_) {}
    try {
      if (ssb.replicate && typeof ssb.replicate.request === 'function') {
        ssb.replicate.request(key, true);
      }
    } catch (_) {}
  }
}

function handleDiscovery(ssb, d, opts) {
  if (!d || !d.address) return;
  if (!d.verified && !opts.acceptUnverified) return;
  let key = null;
  try { key = Ref.getKeyFromAddress(d.address); } catch (_) {}
  if (key) stagePeer(ssb, d.address, key, opts.eagerReplicate);
}

function startRouter(ssb, opts) {
  if (!ssb.lan || typeof ssb.lan.discoveredPeers !== 'function') return;
  try { ssb.lan.start(); } catch (_) {}
  pull(
    ssb.lan.discoveredPeers(),
    pull.drain(d => handleDiscovery(ssb, d, opts), () => {})
  );
}

module.exports = {
  name: 'lanRouter',
  version: '1.1.0',
  manifest: {},
  init(ssb, config) {
    const lanCfg = (config && config.lan) || {};
    const opts = {
      acceptUnverified: lanCfg.acceptUnverified === true,
      eagerReplicate: lanCfg.eagerReplicate === true
    };
    setImmediate(() => startRouter(ssb, opts));
    return {};
  }
};
