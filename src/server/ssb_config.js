const fs = require('fs');
const path = require('path');
const Config = require('ssb-config/inject');
const minimist = require('minimist');

const configPath = path.resolve(__dirname, '../configs', 'server-config.json');
const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const argv = process.argv.slice(2);
const i = argv.indexOf('--');
const conf = argv.slice(i + 1);
const cliArgs = ~i ? argv.slice(0, i) : argv;

let config = Config('ssb', minimist(conf));
config = { ...config, ...configData };

// Set blob size limit to 50MB
const megabyte = Math.pow(2, 20);
config.blobs = config.blobs || {};
config.blobs.max = 50 * megabyte;

module.exports = config;
