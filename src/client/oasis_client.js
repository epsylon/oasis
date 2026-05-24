"use strict";

const path = require('path');
const yargs = require(path.join(__dirname, '../server/node_modules/yargs'));
const { hideBin } = require(path.join(__dirname, '../server/node_modules/yargs/helpers'));
const _ = require(path.join(__dirname, '../server/node_modules/lodash'));

const moduleAlias = require(path.join(__dirname, '../server/node_modules/module-alias'));
moduleAlias.addAlias('punycode', 'punycode/');

const HELP_TEXT = `Usage: sh oasis.sh [mode] [options]

Modes:
  gui                      Launch the Oasis web GUI (default if no mode given).
  server, pub              Launch only the Oasis Sbot (headless, PUB mode).
  help, -h, --help         Show this help message.

PUB admin commands (require the Oasis Sbot to be running):
  whoami                   Print this Oasis ID.
  invite [N]               Create an invite code. N = number of uses (default 1).
  name <text>              Set this Oasis display name.
  announce <host> [port]   Publish a pub address (default port 8008).
  follow <feedId>          Follow another Oasis ID / feed.
  status                   Show peer / replication status.
  gossip                   List known gossip peers.

GUI options (forwarded to the backend):
  --host=<ip>              Hostname / IP the web UI listens on (default: localhost).
                           Use 0.0.0.0 to expose on a VPS.
  --port=<n>               Port for the web UI (default: 3000).
  --allow-host=<host>      Extra hostname allowed when behind a reverse proxy.
  --public                 Public-hosting mode: disables POST and redacts content
                           from people who haven't opted in to public hosting.
  --offline                Don't connect to Oasis peers or pubs.
  --no-open                Don't auto-open a browser tab on launch (useful on VPS).
  --debug                  Verbose logging.

Examples:
  sh oasis.sh
  sh oasis.sh server
  sh oasis.sh invite 100
  sh oasis.sh name "My PUB"
  sh oasis.sh announce mypub.example.com
  sh oasis.sh --host=0.0.0.0 --port=8080 --no-open
`;

const cli = (presets /*, defaultConfigFile */) => {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help') || argv.includes('-help') || argv.includes('help')) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }
  return yargs(hideBin(process.argv))
    .scriptName("oasis")
    .env("OASIS")
    .help(false)
    .version(false)
    .options("open", { default: _.get(presets, "open", true), type: "boolean" })
    .options("offline", { default: _.get(presets, "offline", false), type: "boolean" })
    .options("host", { default: _.get(presets, "host", "localhost"), type: "string" })
    .options("allow-host", { default: _.get(presets, "allow-host", null), type: "string" })
    .options("port", { default: _.get(presets, "port", 3000), type: "number" })
    .options("public", { default: _.get(presets, "public", false), type: "boolean" })
    .options("debug", { default: _.get(presets, "debug", false), type: "boolean" })
    .parserConfiguration({ "strip-aliased": true })
    .argv;
};

module.exports = { cli };

