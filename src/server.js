var Server = require('ssb-server')
var config = require('ssb-config')
var fs = require('fs')
var path = require('path')

// add required plugins
Server
  .use(require('ssb-master'))
  .use(require('ssb-db'))
  .use(require('ssb-replicate'))
  .use(require('ssb-backlinks'))
  .use(require('ssb-conn'))
  .use(require('ssb-gossip'))
  .use(require('ssb-search'))
  .use(require('ssb-tangle'))
  .use(require('ssb-query'))
  .use(require('ssb-friends'))
  .use(require('ssb-blobs'))
  .use(require('ssb-about'))
  .use(require('ssb-ebt'))
  .use(require('ssb-invite'))
  .use(require('ssb-lan'))
  .use(require('ssb-logging'))
  .use(require('ssb-meme'))
  .use(require('ssb-no-auth'))
  .use(require('ssb-onion'))
  .use(require('ssb-ooo'))
  .use(require('ssb-plugins'))
  .use(require('ssb-private1'))
  .use(require('ssb-unix-socket'))
  .use(require('ssb-ws'))
  .use(require('ssb-tunnel'))

// load config into ssb
var server = Server(config)

// generate manifest
var manifest = server.getManifest()
fs.writeFileSync(
  path.join(config.path, 'manifest.json'), // ~/.ssb/manifest.json
  JSON.stringify(manifest)
)
