#!/usr/bin/env node
const moduleAlias = require('module-alias');
moduleAlias.addAlias('punycode', 'punycode/');

const fs = require('fs');
const path = require('path');
const SecretStack = require('secret-stack');
const caps = require('ssb-caps');
const SSB = require('ssb-db');
const config = require('./ssb_config');
const { printMetadata } = require('./ssb_metadata');

(() => {
  const realErr = console.error;
  const SHS_NOISE = /shs\.server:|they dailed a wrong number|client hello invalid|invalid challenge|wrong application cap/i;
  const EBT_NOISE = /stream ended with:\s*\d+\s+but wanted:\s*\d+/i;
  const isEbtReplicateException = (args) =>
    args.length >= 2 &&
    typeof args[0] === 'string' &&
    /rpc\.ebt\.replicate exception/i.test(args[0]) &&
    args[1] && typeof args[1].message === 'string' && EBT_NOISE.test(args[1].message);
  const parsePeer = (addr) => {
    if (typeof addr !== 'string') return 'unknown';
    const m = /net:(.+?):(\d+)(?:~|$)/.exec(addr);
    if (!m) return addr;
    return `${m[1].replace(/^::ffff:/, '')}:${m[2]}`;
  };
  const logRejection = (peer) => {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    realErr.call(console, `[${ts}] REJECTED    ${peer} (wrong SHS cap)`);
  };
  console.error = function (...args) {
    if (args.length >= 2 && args[0] === 'server error, from' && typeof args[1] === 'string' && args[1].includes('~shs:')) {
      logRejection(parsePeer(args[1]));
      return;
    }
    if (args.length >= 1 && args[0] && typeof args[0].message === 'string' && SHS_NOISE.test(args[0].message)) {
      logRejection(parsePeer(args[0].address));
      return;
    }
    if (args.length >= 1 && args[0] && typeof args[0].message === 'string' && EBT_NOISE.test(args[0].message)) return;
    if (isEbtReplicateException(args)) return;
    if (args.length >= 1 && typeof args[0] === 'string' && /rpc\.ebt\.replicate exception:.*stream ended with/i.test(args[0])) return;
    return realErr.apply(console, args);
  };
})();

require('ssb-plugins').loadUserPlugins(SecretStack({ caps }), config);

const Server = SecretStack({ caps })
  .use(SSB)
  .use(require('ssb-master'))
  .use(require('ssb-gossip'))
  .use(require('ssb-ebt'))
  .use(require('ssb-friends'))
  .use(require('ssb-blobs'))
  .use(require('ssb-meme'))
  .use(require('ssb-plugins'))
  .use(require('ssb-conn'))
  .use(require('ssb-box'))
  .use(require('ssb-search'))
  .use(require('ssb-private'))
  .use(require('ssb-friend-pub'))
  .use(config.pub ? require('ssb-invite') : require('ssb-invite-client'))
  .use(require('ssb-logging'))
  .use(require('ssb-replication-scheduler'))
  .use(require('ssb-partial-replication'))
  .use(require('ssb-about'))
  .use(require('ssb-onion'))
  .use(require('ssb-unix-socket'))
  .use(require('ssb-no-auth'))
  .use(require('ssb-backlinks'))
  .use(require('ssb-links'))
  .use(require('ssb-tangle'))
  .use(require('ssb-query'));

if (!config.pub) {
  Server.use(require('ssb-lan'));
  Server.use(require('./lanRouter'));
}

if (config.autofollow && typeof config.autofollow === 'object' && !Array.isArray(config.autofollow)) {
  if (config.autofollow.enabled === false) {
    config.autofollow = null;
  } else {
    const feeds = Array.isArray(config.autofollow.feeds) ? config.autofollow.feeds : (Array.isArray(config.autofollow.suggestions) ? config.autofollow.suggestions : []);
    config.autofollow = feeds.filter(f => typeof f === 'string' && f.length > 0);
  }
}
if (config.autofollow && (Array.isArray(config.autofollow) ? config.autofollow.length > 0 : true)) {
  Server.use(require('ssb-autofollow'));
}

const manifestFile = path.join(config.path, 'manifest.json');
let server;
const argv = process.argv.slice(2);

const isLockError = (err) => {
  if (!err) return false;
  if (err.name === 'OpenError') return true;
  const msg = String(err.message || '');
  return /Resource temporarily unavailable/i.test(msg) && /\.ssb\/.*LOCK/i.test(msg);
};

const handleFatal = (err) => {
  if (isLockError(err)) {
    console.log('');
    console.log('Another Oasis instance is already running on this device. Close the other instance (or kill the process) and try again.');
    console.log('');
    process.exit(1);
  }
  throw err;
};

process.on('uncaughtException', handleFatal);

if (argv[0] === 'start') {
  try {
    server = Server(config);
  } catch (err) {
    handleFatal(err);
  }
  fs.writeFileSync(manifestFile, JSON.stringify(server.getManifest(), null, 2));

  const { cmdAliases } = require('../client/cli-cmd-aliases');
  const manifest = server.getManifest();
  for (const k in cmdAliases) {
    server[k] = server[cmdAliases[k]];
    manifest[k] = manifest[cmdAliases[k]];
  }

  manifest.config = 'sync';
  server.config = cb => {
    console.log(JSON.stringify(config, null, 2));
    cb();
  };

  if (process.stdout.isTTY && config.logging?.level !== 'info') {
    const showProgress = () => {
      let prog = -1;
      const bar = r => '\r' + '*'.repeat(Math.floor(r * 50)) + '.'.repeat(50 - Math.floor(r * 50));
      const percent = r => (Math.round(r * 10000) / 100).toFixed(2) + '%';
      const rate = prog => prog.target === prog.current ? 1 : (prog.current - prog.start) / (prog.target - prog.start);
      const interval = setInterval(() => {
        const p = server.progress();
        let r = 1;
        const tasks = [];
        for (const k in p) {
          const pr = rate(p[k]);
          if (pr < 1) tasks.push(`${k}:${percent(pr)}`);
          r = Math.min(r, pr);
        }
        if (r !== prog) {
          prog = r;
          process.stdout.write(bar(r) + ` (${tasks.join(', ')})\x1b[K\r`);
        }
      }, 333);
      interval.unref?.();
    };
    showProgress();
  }

  const { printMetadata, colors } = require('./ssb_metadata');
  printMetadata('OASIS Server Only', colors.cyan, null);

  setTimeout(() => {
    try {
      const pull = require('pull-stream');
      const stream = server.conn && server.conn.hub && server.conn.hub().listen && server.conn.hub().listen();
      if (!stream) return;
      pull(stream, pull.drain((ev) => {
        if (!ev || !ev.type) return;
        const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
        if (ev.type === 'connected') {
          console.log(`[${ts}] CONNECTED    ${ev.address || ''}`);
        } else if (ev.type === 'disconnected') {
          console.log(`[${ts}] DISCONNECTED ${ev.address || ''}`);
        }
      }, () => {}));
    } catch (_) {}
  }, 1000);

  setTimeout(async () => {
    try {
      const bankingModel = require('../models/banking_model.js')({});
      await bankingModel.ensureSelfAddressPublished();
    } catch (_) {}
  }, 5000);

}

module.exports = {
  config,
  server: server || Server(config),
  open: async () => server || Server(config)
};
