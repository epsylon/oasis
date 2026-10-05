#!/usr/bin/env node
const moduleAlias = require('module-alias');
moduleAlias.addAlias('punycode', 'punycode/');

const fs = require('fs');
const path = require('path');
const SecretStack = require('secret-stack');
const caps = require('ssb-caps');
const db2Defaults = require('ssb-db2/defaults');
const config = require('./ssb_config');
const { printMetadata } = require('./ssb_metadata');

(() => {
  const realErr = console.error;
  const SHS_NOISE = /shs\.server:|they dailed a wrong number|client hello invalid|invalid challenge|wrong application cap/i;
  const EBT_NOISE = /stream ended with:\s*\d+\s+but wanted:\s*\d+/i;
  const EBT_HANDSHAKE_NOISE = /does not support RPC ebt\./i;
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
    if (!(process.argv.includes('--debug') || process.env.OASIS_DEBUG === '1' || process.env.OASIS_DEBUG === 'true')) return;
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
  const realWarn = console.warn;
  console.warn = function (...args) {
    if (args.length >= 1 && typeof args[0] === 'string' && EBT_HANDSHAKE_NOISE.test(args[0])) return;
    return realWarn.apply(console, args);
  };
})();

require('ssb-plugins').loadUserPlugins(SecretStack({ caps }), config);

try {
  if (require('../configs/config-manager.js').getConfig().networkPaused === true || process.env.OASIS_NETWORK_PAUSED === '1') config.conn = { ...(config.conn || {}), autostart: false };
} catch (_) {}

const Server = SecretStack({ caps })
  .use(require('ssb-db2/core'))
  .use(require('ssb-classic'))
  .use(require('ssb-box'))
  .use(require('ssb-db2/compat/publish'))
  .use(require('ssb-db2/compat/post'))
  .use(require('ssb-db2/compat/db'))
  .use(require('ssb-db2/compat/log-stream'))
  .use(require('ssb-db2/compat/history-stream'))
  .use(require('ssb-db2/compat/ebt'))
  .use(require('ssb-db2/compat/feedstate'))
  .use(require('./db2_legacy'))
  .use(require('ssb-master'))
  .use(require('ssb-gossip'))
  .use(require('ssb-ebt'))
  .use(require('ssb-friends'))
  .use(require('ssb-blobs'))
  .use(require('ssb-plugins'))
  .use(require('ssb-conn'))
  .use(require('ssb-friend-pub'))
  .use(config.pub ? require('ssb-invite') : require('ssb-invite-client'))
  .use(require('ssb-logging'))
  .use(require('ssb-replication-scheduler'))
  .use(require('ssb-partial-replication'))
  .use(require('ssb-onion'))
  .use(require('ssb-unix-socket'))
  .use(require('ssb-no-auth'))
  .use(require('./snapshot_plugin'))
  .use(require('./phone_module'))
  .use(require('./network_pause'));

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

const isCorruptStoreError = (err) => {
  const msg = String((err && err.message) || '');
  const stack = String((err && err.stack) || '');
  return /JSON|Unexpected token|Unexpected end|bipf|Invalid|corrupt/i.test(msg)
    && /flumelog-offset|aligned-block-file|flumeview|flumedb|async-append-only-log|jitdb|bipf|ssb-db2/i.test(stack);
};

const migration = { running: false, percent: 0, done: false, error: null };
let migrationPromise = null;
const MIGRATED_MARKER = 'OASIS: this log was migrated to ssb-db2';
const oldLogIsMarker = (file) => {
  try {
    const st = fs.statSync(file);
    return st.size < 4096 && fs.readFileSync(file, 'utf8').startsWith(MIGRATED_MARKER);
  } catch (_) { return false; }
};
const writeMigratedMarker = () => {
  try {
    fs.mkdirSync(db2Defaults.flumePath(config.path), { recursive: true });
    fs.writeFileSync(db2Defaults.oldLogPath(config.path), `${MIGRATED_MARKER} (${config.path}/db2/log.bipf) on ${new Date().toISOString()}.\nThis file is a guard: an Oasis older than the ssb-db2 move cannot read it and refuses to start, instead of starting with an empty log and forking your feed. Do not delete it unless you are moving back to that version on purpose, and never run both versions on this folder.\n`);
  } catch (_) {}
};
const migrateFlume = () => {
  if (migrationPromise) return migrationPromise;
  migrationPromise = new Promise((resolve, reject) => {
    const oldLog = db2Defaults.oldLogPath(config.path);
    if (!fs.existsSync(oldLog) || oldLogIsMarker(oldLog)) { migration.done = true; return resolve(false); }
    if (isDebug()) console.log('- Database: migrating the local log to ssb-db2');
    migration.running = true;
    let mig;
    try {
      mig = SecretStack({ caps })
        .use(require('ssb-db2/migrate'))
        .call(null, { ...config, connections: { incoming: {}, outgoing: {} }, db2: { ...(config.db2 || {}), automigrate: false, dangerouslyKillFlumeWhenMigrated: true } });
    } catch (err) { migration.running = false; migration.error = err; return reject(err); }
    const pull = require('pull-stream');
    let shown = -1;
    pull(mig.db2migrate.progress(), pull.drain((p) => {
      const pct = Math.max(0, Math.min(100, Math.floor((Number(p) || 0) * 100)));
      migration.percent = pct;
      if (pct !== shown && isDebug()) { shown = pct; console.log(`  migrating ${pct}%`); }
    }));
    const finish = () => {
      const waitGone = (tries) => {
        if (!fs.existsSync(db2Defaults.oldLogPath(config.path))) {
          mig.close(() => {
            writeMigratedMarker();
            migration.running = false; migration.done = true; migration.percent = 100;
            if (isDebug()) console.log('  migrated 100%');
            resolve(true);
          });
          return;
        }
        if (tries <= 0) {
          try { fs.rmSync(db2Defaults.flumePath(config.path), { recursive: true, force: true }); } catch (_) {}
          mig.close(() => {
            if (!fs.existsSync(db2Defaults.oldLogPath(config.path))) writeMigratedMarker();
            else if (isDebug()) console.log('  the old log could not be removed; it is left in place');
            migration.running = false; migration.done = true; migration.percent = 100;
            resolve(true);
          });
          return;
        }
        setTimeout(() => waitGone(tries - 1), 200);
      };
      waitGone(300);
    };
    try { mig.db2migrate.start(); } catch (err) { migration.running = false; migration.error = err; return reject(err); }
    mig.db2migrate.synchronized((synced) => {
      if (synced !== true) return;
      finish();
      return false;
    });
  });
  return migrationPromise;
};

const isDebug = () => process.argv.includes('--debug') || process.env.OASIS_DEBUG === '1' || process.env.OASIS_DEBUG === 'true';

const isPortInUseError = (err) => String((err && err.code) || '') === 'EADDRINUSE';

const handleFatal = (err) => {
  if (isPortInUseError(err)) {
    console.log('');
    console.log('Another Oasis instance is already running on this device. Close the other instance (or kill the process) and try again.');
    if (isDebug()) console.log(`Detail: ${String((err && err.message) || err)}`);
    console.log('');
    process.exit(1);
  }
  if (isLockError(err)) {
    console.log('');
    console.log('Another Oasis instance is already running on this device. Close the other instance (or kill the process) and try again.');
    if (isDebug()) {
      console.log(`Detail: ${String((err && err.message) || err)}`);
      console.log(String((err && err.stack) || '').split('\n').slice(1, 4).join('\n'));
    }
    console.log('');
    process.exit(1);
  }
  if (isCorruptStoreError(err)) {
    console.log('');
    console.log('Oasis could not read its local database (a record in ~/.ssb/db2 looks corrupted).');
    console.log('This usually happens after an unclean shutdown or a disk error.');
    console.log('');
    console.log('What you can try, in order:');
    console.log('  1. Simply start Oasis again — transient read errors often clear on the next boot.');
    console.log('  2. Check your disk health (e.g. run fsck on the partition holding ~/.ssb).');
    console.log('  3. Rebuild the indexes from Settings once Oasis starts, or remove ~/.ssb/db2/indexes');
    console.log('     and ~/.ssb/db2/jit (NOT log.bipf, NOT secret) so they are regenerated from the log.');
    console.log('');
    if (isDebug()) console.log(`Technical detail: ${String((err && err.message) || err)}`);
    process.exit(1);
  }
  throw err;
};

process.on('uncaughtException', handleFatal);

const startServerOnly = () => {
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

  const ownFeedSeq = () => new Promise((res) => {
    try {
      const pull = require('pull-stream');
      pull(
        server.createUserStream({ id: server.id, reverse: true, limit: 1 }),
        pull.collect((err, msgs) => res(err || !msgs || !msgs.length ? 0 : (msgs[0].value && msgs[0].value.sequence) || 0))
      );
    } catch (_) { res(0); }
  });

  setTimeout(async () => {
    try {
      if (!(await ownFeedSeq())) return;
      const bankingModel = require('../models/banking_model.js')({});
      await bankingModel.ensureSelfAddressPublished();
    } catch (_) {}
  }, 5000);

  setTimeout(async () => {
    try {
      if (!(await ownFeedSeq())) return;
      const pull = require('pull-stream');
      const version = String(require('./package.json').version || '');
      if (!version) return;
      pull(
        server.createUserStream({ id: server.id, reverse: true }),
        pull.filter(m => m && m.value && m.value.content && m.value.content.type === 'oasisVersion'),
        pull.take(1),
        pull.collect((err, msgs) => {
          const mine = !err && msgs && msgs.length ? msgs[0].value.content.version : null;
          if (mine !== version) {
            try { server.publish({ type: 'oasisVersion', version, updatedAt: new Date().toISOString() }, () => {}); } catch (_) {}
          }
        })
      );
    } catch (_) {}
  }, 7000);

};

if (argv[0] === 'start') {
  migrateFlume().then(startServerOnly, handleFatal);
}

module.exports = {
  config,
  get server() {
    return server;
  },
  migrationStatus: () => ({ ...migration }),
  open: async () => {
    await migrateFlume();
    if (!server) server = Server(config);
    return server;
  }
};
