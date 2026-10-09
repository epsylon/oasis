const fs = require('fs');
const path = require('path');
const Config = require('ssb-config/inject');
const minimist = require('minimist');

const configData = require('../configs/config-manager').readServerConfig();

const argv = process.argv.slice(2);
const i = argv.indexOf('--');
const conf = argv.slice(i + 1);
const cliArgs = ~i ? argv.slice(0, i) : argv;

let config = Config('ssb', minimist(conf));
config = { ...config, ...configData };

const debug = process.argv.includes('--debug') || process.env.OASIS_DEBUG === '1' || process.env.OASIS_DEBUG === 'true';
if (debug) {
  config.logging = { ...(config.logging || {}), level: 'debug' };
}

const megabyte = Math.pow(2, 20);
config.blobs = config.blobs || {};
config.blobs.max = 75 * megabyte;

config.db2 = { automigrate: false, dangerouslyKillFlumeWhenMigrated: false, ...(config.db2 || {}) };

const lanOn = (() => { try { return require('../configs/config-manager').getConfig().lanBroadcasting !== false; } catch (_) { return true; } })();
const bindHost = config.pub || lanOn ? '0.0.0.0' : '127.0.0.1';
for (const entry of (config.connections && config.connections.incoming && config.connections.incoming.net) || []) {
  if (entry && typeof entry === 'object' && !entry.host) entry.host = bindHost;
}

config.statePath = (name) => {
  if (process.env.OASIS_STATE_DIR) return path.join(process.env.OASIS_STATE_DIR, name);
  return config.path ? path.join(config.path, name) : null;
};

module.exports = config;
