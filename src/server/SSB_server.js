#!/usr/bin/env node

const moduleAlias = require('module-alias');
moduleAlias.addAlias('punycode', 'punycode/');

var fs = require('fs')
var path = require('path')
const SecretStack = require('secret-stack')
var caps = require('ssb-caps')
var SSB = require('ssb-db')
var Client       = require('ssb-client')
var cmdAliases   = require('../client/cli-cmd-aliases')
var packageJson  = require('./package.json')
var Config       = require('ssb-config/inject')
var minimist     = require('minimist')
var muxrpcli     = require('muxrpcli')

const configPath = path.resolve(__dirname, '../configs', 'server-config.json');
const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));

let argv = process.argv.slice(2);
const i = argv.indexOf('--');
const conf = argv.slice(i + 1);
argv = ~i ? argv.slice(0, i) : argv;

let config = Config('ssb', minimist(conf));
config = {...config, ...configData};

const manifestFile = path.join(config.path, 'manifest.json');

console.log("=========================");
console.log("Package:", packageJson.name, "[Version: " + packageJson.version + "]");
//console.log("Server path:", config.path);
//console.log("Loading configuration from:", configPath);
console.log("Logging Level:", config.logging.level);
console.log("Public Key ID: [", config.keys.public,"]");
console.log("=========================");
const modules = [
  'ssb-master', 'ssb-gossip', 'ssb-ebt', 'ssb-friends', 'ssb-blobs', 'ssb-lan', 'ssb-meme',
  'ssb-ooo', 'ssb-plugins', 'ssb-conn', 'ssb-box', 'ssb-search', 'ssb-friend-pub', 'ssb-invite-client',
  'ssb-logging', 'ssb-replication-scheduler', 'ssb-partial-replication', 'ssb-about', 'ssb-onion',
  'ssb-unix-socket', 'ssb-no-auth', 'ssb-backlinks', 'ssb-links'
];
console.log("Modules loaded: [", modules.length, "] ->", modules.join(', '));
console.log("=========================");

function showProgress(progress) {
  function bar(r) {
    let s = '\r', M = 50;
    for (let i = 0; i < M; i++) {
      s += i < M * r ? '*' : '.';
    }
    return s;
  }

  function round(n, p) {
    return Math.round(n * p) / p;
  }

  function percent(n) {
    return (round(n, 1000) * 100).toString().substring(0, 4) + '%';
  }

  function rate(prog) {
    if (prog.target == prog.current) return 1;
    return (prog.current - prog.start) / (prog.target - prog.start);
  }

  let prog = -1;
  const int = setInterval(function () {
    const p = progress();
    let r = 1, c = 0;
    const tasks = [];
    for (let k in p) {
      const _r = rate(p[k]);
      if (_r < 1)
        tasks.push(k + ':' + percent(_r));
      r = Math.min(_r, r);
      c++;
    }
    if (r != prog) {
      prog = r;
      const msg = tasks.join(', ');
      process.stdout.write('\r' + bar(prog) + ' (' + msg + ')\x1b[K\r');
    }
  }, 333);
  int.unref && int.unref();
}

if (argv[0] === 'start') {
  const tribes = require('ssb-tribes');
  const conn = require('ssb-conn');
  const legacy_conn = require('ssb-legacy-conn');
  const db2 = require('ssb-db2');
  const replication_scheduler = require('ssb-replication-scheduler');
  const friends = require('ssb-friends');
  const ebt = require('ssb-ebt');
  const box = require('ssb-box');
  const threads = require('ssb-threads');
  const invite = require('ssb-invite');
  const conn_db = require('ssb-conn-db');
  const search2 = require('ssb-search2');
  const friend_pub = require('ssb-friend-pub');
  const invite_client = require('ssb-invite-client');
  const tunnel = require('ssb-tunnel');
  const conn_query = require('ssb-conn-query');
  const conn_hub = require('ssb-conn-hub');
  const conn_staging = require('ssb-conn-staging');
  const device_address = require('ssb-device-address');
  const gossip = require('ssb-gossip');
  const master = require('ssb-master');
  const logging = require('ssb-logging');
  const partial_replication = require('ssb-partial-replication');
  const about = require('ssb-about');
  const onion = require('ssb-onion');
  const unix = require('ssb-unix-socket');
  const auth = require('ssb-no-auth');
  const backlinks = require('ssb-backlinks');
  const links = require('ssb-links');

  function createSsbServer() {
    return SecretStack({ caps }).use(SSB, gossip, tribes, conn, db2, master, ebt, box, threads, invite, conn_db, search2, friend_pub, invite_client, tunnel, config, conn_query, conn_hub, conn_staging, device_address, friends, logging, replication_scheduler, partial_replication, about, onion, unix, auth, backlinks, links);
  }

  const Server = createSsbServer()
    .use(require('ssb-master'))
    .use(require('ssb-gossip'))
    .use(require('ssb-ebt'))
    .use(require('ssb-friends'))
    .use(require('ssb-blobs'))
    .use(require('ssb-lan'))
    .use(require('ssb-meme'))
    .use(require('ssb-ooo'))
    .use(require('ssb-plugins'))
    .use(require('ssb-conn'))
    .use(require('ssb-box'))
    .use(require('ssb-search'))
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
    .use(require("ssb-tangle"))
    .use(require('ssb-links'))
    .use(require('ssb-query'));

  require('ssb-plugins').loadUserPlugins(Server, config);

  const server = Server(config);

  fs.writeFileSync(manifestFile, JSON.stringify(server.getManifest(), null, 2));

  if (process.stdout.isTTY && (config.logging.level !== 'info')) {
    showProgress(server.progress);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile));
  } catch (err) {
    throw explain(err, 'no manifest file - should be generated first time server is run');
  }

  const opts = {
    manifest: manifest,
    port: config.port,
    host: 'localhost',
    caps: config.caps,
    key: config.key || config.keys.id
  };

const levelup = require('../server/node_modules/levelup');
const originalLevelUp = levelup.LevelUp;
require('../server/node_modules/levelup').LevelUp = function (...args) {
  const levelupInstance = new originalLevelUp(...args);
  levelupInstance.on('error', function (err) {
    if (err && err.message && err.message.includes('LOCK')) {
      return;
    }
    this.emit('error', err);
  });
  return levelupInstance;
};
process.on('uncaughtException', function (err) {
  if (err && err.message && err.message.includes('LOCK')) {
    return;
  }
  throw err;
});

Client(config.keys, opts, function (err, rpc) {
  if (err) {
    process.exit(1);
  }
  for (let k in cmdAliases) {
    rpc[k] = rpc[cmdAliases[k]];
    manifest[k] = manifest[cmdAliases[k]];
  }

    manifest.config = 'sync';
    rpc.config = function (cb) {
      console.log(JSON.stringify(config, null, 2));
      cb();
    };   
    function validateParams(argv, manifest, rpc, verbose) {
        if (!Array.isArray(argv)) {
        return false;
    }   
    if (typeof manifest !== 'object' || manifest === null) {
        return false;
    }
    if (typeof rpc !== 'object' || rpc === null) {
        return false;
    }
    if (typeof verbose !== 'boolean') {
        if (verbose === 'true') {
            verbose = true;
        } else if (verbose === 'false') {
            verbose = false;
        }
    }
    return true;
    }
})
}

