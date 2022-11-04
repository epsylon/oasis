#! /usr/bin/env node

var fs = require('fs')
var path = require('path')
var SecretStack = require('secret-stack')
var caps = require('ssb-caps')
var SSB = require('ssb-db')
var Client       = require('ssb-client')
var cmdAliases   = require('./ssb/cli-cmd-aliases')
var ProgressBar  = require('./ssb/progress')
var packageJson  = require('../package.json')
var Config       = require('ssb-config/inject')
var minimist     = require('minimist')
var muxrpcli     = require('muxrpcli')

var argv = process.argv.slice(2)
var i = argv.indexOf('--')
var conf = argv.slice(i+1)
argv = ~i ? argv.slice(0, i) : argv

var config = Config("ssb", minimist(conf))
var config = Config("ssb", {"replicate": { "legacy": true}, "pub": true, "local": true, "friends": { "dunbar": 300, "hops":3}, "gossip":{ "connections": 5, "local": true, "friends": true, "seed": false, "global": true}, "connections": {"incoming": {"net": [{"scope": "public","transform": "shs","port": 8008},{"scope": "device","transform": "shs","port": 8008}],"tunnel": [{"scope": "public", "portal": "@1wOEiCjJJ0nEs1OABUIV20valZ1LHUsfHJY/ivBoM8Y=.ed25519", "transform": "shs"}],"onion": [{"scope": "public","transform": "shs"}],"ws": [{"scope": "public","transform": "shs"}]},"outgoing": {"net": [{"transform": "shs"}],"ws": [{"transform": "shs"}],"tunnel": [{"transform": "shs"}]}}})

var manifestFile = path.join(config.path, 'manifest.json')

// generate initial info
if (argv[0] == 'start') {
  console.log(packageJson.name, "[version: "+ packageJson.version+ "]", "[dataPath: "+ config.path+ "]", "["+'logging.level:'+config.logging.level+"]")
  console.log('my key ID:', config.keys.public)

// add ssb server required plugins
var tribes = require('ssb-tribes')
var conn = require('ssb-conn')
var legacy_conn = require('ssb-legacy-conn')
var db2 = require('ssb-db2')
var friends = require('ssb-friends')
var ebt = require('ssb-ebt')
var box = require('ssb-box')
var threads = require('ssb-threads')
var invite = require('ssb-invite')
var conn_db = require('ssb-conn-db')
var search2 = require('ssb-search2')
var friend_pub = require('ssb-friend-pub')
var invite_client = require('ssb-invite-client')
var tunnel = require('ssb-tunnel')
var config = require('ssb-config')
var conn_query = require('ssb-conn-query')
var conn_hub = require('ssb-conn-hub')
var conn_staging = require('ssb-conn-staging')
var peer_invites = require('ssb-peer-invites')
var device_address = require('ssb-device-address')
var poll = require('scuttle-poll')
var gossip = require('ssb-gossip')
var master = require('ssb-master')
var logging = require('ssb-logging')
var replicate = require('ssb-replicate')
var replication_scheduler = ('ssb-replication-scheduler')
var partial_replication = require('ssb-partial-replication')
var about = require('ssb-about')
var onion = require('ssb-onion')
var unix = require('ssb-unix-socket')
var auth = require('ssb-no-auth')
var backlinks = require('ssb-backlinks')
var links = require('ssb-links')

// create ssb server
function createSsbServer () {
  return SecretStack({ caps }).use(SSB, gossip, tribes, conn, db2, master, replicate, ebt, box, threads, invite, conn_db, search2, friend_pub, invite_client, tunnel, config, conn_query, conn_hub, conn_staging, peer_invites, device_address, poll, friends, logging, replication_scheduler, partial_replication, about, onion, unix, auth, backlinks, links)
}

// add other required plugins (+flotilla) by SNH-Oasis (client) (plugin order is required!)
var Server = createSsbServer()
  .use(require('ssb-master'))
  .use(require('ssb-gossip'))
  .use(require('ssb-replicate'))
  .use(require('ssb-ebt'))
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
  .use(require('ssb-partial-replication'))
  .use(require("ssb-room/tunnel/client"))
  .use(require('ssb-about'))
  .use(require('ssb-onion'))
  .use(require('ssb-unix-socket'))
  .use(require('ssb-no-auth'))
  .use(require('ssb-backlinks'))
  .use(require("ssb-tangle"))
  .use(require('ssb-links'))
  .use(require('ssb-query'))
  .use(require('ssb-friends'))
  .use(require('ssb-peer-invites'))

// add third-party plugins (loaded from ~/.ssb/config)
require('ssb-plugins').loadUserPlugins(Server, config)

// load config into ssb & start it
var server = Server(config)

// generate manifest
fs.writeFileSync(manifestFile, JSON.stringify(server.getManifest(), null, 2))

// show server progress
if(process.stdout.isTTY && (config.logging.level != 'info'))
    ProgressBar(server.progress)

} else {
  var manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile))
  } catch (err) {
    throw explain(err,
      'no manifest file'
      + '- should be generated first time server is run'
    )
  }
  var opts = {
    manifest: manifest,
    port: config.port,
    host: 'localhost',
    caps: config.caps,
    key: config.key || config.keys.id
  }
  Client(config.keys, opts, function (err, rpc) {
    if(err) {
      if (/could not connect/.test(err.message)) {
        console.error('Error: Could not connect to ssb-server ' + opts.host + ':' + opts.port)
        console.error('Use the "start" command to start it.')
        console.error('Use --verbose option to see full error')
        if(config.verbose) throw err
        process.exit(1)
      }
      throw err
    }
    for (var k in cmdAliases) {
      rpc[k] = rpc[cmdAliases[k]]
      manifest[k] = manifest[cmdAliases[k]]
    }
    manifest.config = 'sync'
    rpc.config = function (cb) {
      console.log(JSON.stringify(config, null, 2))
      cb()
    }
    if (process.argv[2] === 'blobs.add') {
      var filename = process.argv[3]
      var source =
        filename ? File(process.argv[3])
      : !process.stdin.isTTY ? toPull.source(process.stdin)
      : (function () {
        console.error('USAGE:')
        console.error('  blobs.add <filename> # add a file')
        console.error('  source | blobs.add   # read from stdin')
        process.exit(1)
      })()
      pull(
        source,
        rpc.blobs.add(null, function (err, hash) {
          if (err)
            throw err
          console.log(hash)
          process.exit()
        })
      )
      return
    }
    muxrpcli(argv, manifest, rpc, config.verbose)
  })
}

