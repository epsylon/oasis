const pull = require('./node_modules/pull-stream');
const Ref = require('./node_modules/ssb-ref');
const fs = require('fs');
const path = require('path');

const staged = new Set();

function readOasisConfig() {
  try {
    const dir = process.env.OASIS_STATE_DIR || process.env.ssb_path || path.join(require('os').homedir(), '.ssb');
    const p = [path.join(dir, 'oasis', 'oasis-config.json'), path.join(dir, 'oasis-config.json')].find(f => fs.existsSync(f));
    return JSON.parse(fs.readFileSync(p || path.join(__dirname, '..', 'configs', 'oasis-config.json'), 'utf8')) || {};
  } catch (_) { return {}; }
}

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
  try { require('../models/viewer_filters').rememberLanPeers([key]); } catch (_) {}
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

function guardLan(ssb, isEnabled) {
  const lan = ssb && ssb.lan;
  if (!lan || typeof lan.start !== 'function' || lan.oasisGuarded) return false;
  const start = lan.start.bind(lan);
  lan.start = (...args) => {
    if (!isEnabled()) return undefined;
    try { return start(...args); } catch (_) { return undefined; }
  };
  lan.oasisGuarded = true;
  if (!isEnabled() && typeof lan.stop === 'function') { try { lan.stop(); } catch (_) {} }
  return true;
}

function startRouter(ssb, opts, isEnabled) {
  if (!ssb.lan || typeof ssb.lan.discoveredPeers !== 'function') return;
  if (isEnabled()) { try { ssb.lan.start(); } catch (_) {} }
  else if (typeof ssb.lan.stop === 'function') { try { ssb.lan.stop(); } catch (_) {} }
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
    const isEnabled = () => { const c = readOasisConfig(); return c.lanBroadcasting !== false && c.networkPaused !== true; };
    guardLan(ssb, isEnabled);
    setImmediate(() => startRouter(ssb, opts, isEnabled));
    return {};
  }
};

module.exports.guardLan = guardLan;
