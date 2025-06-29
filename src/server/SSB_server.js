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

require('ssb-plugins').loadUserPlugins(SecretStack({ caps }), config);

const Server = SecretStack({ caps })
  .use(SSB)
  .use(require('ssb-master'))
  .use(require('ssb-gossip'))
  .use(require('ssb-ebt'))
  .use(require('ssb-friends'))
  .use(require('ssb-blobs'))
  .use(require('ssb-lan'))
  .use(require('ssb-meme'))
  .use(require('ssb-plugins'))
  .use(require('ssb-conn'))
  .use(require('ssb-box'))
  .use(require('ssb-search'))
  .use(require('ssb-private'))
  .use(require('ssb-friend-pub'))
  .use(require('ssb-invite-client'))
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
  
if (config.autofollow?.enabled !== false) {
  Server.use(require('ssb-autofollow'));
}

const manifestFile = path.join(config.path, 'manifest.json');
let server;
const argv = process.argv.slice(2);

if (argv[0] === 'start') {
  server = Server(config);
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
  printMetadata('OASIS Server Only', colors.cyan);

}

module.exports = {
  config,
  server: server || Server(config),
  open: async () => server || Server(config)
};
