const fs = require('fs');
const os = require('os');
const path = require('path');
const pkg = require('./package.json');
const config = require('./ssb_config');
const updater = require('../backend/updater.js');

let printed = false;
let checkedForUpdate = false;
let pendingClearnetModules = null;
let clearnetReady = false;
let pendingWarmup = null;
let warmupReady = false;

function setClearnetModules(modules) {
  pendingClearnetModules = Array.isArray(modules) ? modules : [];
  clearnetReady = true;
}

function setWarmupTime(str) {
  pendingWarmup = str;
  warmupReady = true;
}

function waitForWarmup(timeoutMs = 120000) {
  return new Promise((resolve) => {
    if (warmupReady) return resolve(pendingWarmup);
    const started = Date.now();
    const tick = () => {
      if (warmupReady) return resolve(pendingWarmup);
      if (Date.now() - started >= timeoutMs) return resolve(null);
      setTimeout(tick, 250);
    };
    tick();
  });
}

function getModules() {
  const nodeModulesPath = path.resolve(__dirname, 'node_modules');
  try {
    return fs.readdirSync(nodeModulesPath)
      .filter(m => fs.existsSync(path.join(nodeModulesPath, m, 'package.json')));
  } catch {
    return [];
  }
}

const colors = {
  blue: '\x1b[38;5;33m',
  yellow: '\x1b[38;5;226m',
  orange: '\x1b[38;5;214m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

async function checkForUpdate() {
  if (checkedForUpdate) return; 
  checkedForUpdate = true; 

  const updateFlagPath = path.join(__dirname, '../server/.update_required');
  if (fs.existsSync(updateFlagPath)) {
    fs.unlinkSync(updateFlagPath);
  }
  await updater.getRemoteVersion();
}

function waitForClearnet(timeoutMs = 25000) {
  return new Promise((resolve) => {
    if (clearnetReady) return resolve(pendingClearnetModules || []);
    const started = Date.now();
    const tick = () => {
      if (clearnetReady) return resolve(pendingClearnetModules || []);
      if (Date.now() - started >= timeoutMs) return resolve(null);
      setTimeout(tick, 250);
    };
    tick();
  });
}

async function printMetadata(mode, modeColor = colors.cyan, httpPort = 3000, httpHost = 'localhost', offline = false, isPublic = false) {
  if (printed) return;
  printed = true;

  const modules = getModules();
  const version = pkg.version;
  const name = pkg.name;
  const logLevel = config.logging?.level || 'info';
  const publicKey = config.keys?.public || '';
  const hasHttp = httpPort !== null && httpPort !== false;
  const httpUrl = hasHttp ? `http://${httpHost}:${httpPort}` : '';
  const oscLink = hasHttp ? `\x1b]8;;${httpUrl}\x07${httpUrl}\x1b]8;;\x07` : '';
  const ssbPort = config.connections?.incoming?.net?.[0]?.port || config.port || 8008;
  const localDiscovery = config.local === true;
  const hops = config.conn?.hops ?? config.friends?.hops ?? 2;

  console.log("=========================");
  console.log(`Running mode: ${modeColor}${mode}${colors.reset}`);
  console.log("=========================");
  console.log(`- Package: ${colors.blue}${name} ${colors.yellow}[Version: ${version}]${colors.reset}`);
  if (hasHttp) console.log(`- URL: ${colors.cyan}${oscLink}${colors.reset}`);
  console.log(`- Oasis ID: [ ${colors.orange}@${publicKey}${colors.reset} ]`);
  console.log("- Logging Level:", logLevel);
  const ifaces = os.networkInterfaces();
  const isOnline = Object.values(ifaces).some(list =>
    list && list.some(i => !i.internal && i.family === 'IPv4')
  );
  console.log(`- Protocol (port): ${ssbPort}`);
  console.log(`- Mode: ${isOnline ? 'online' : 'offline'}`);
  console.log(`- Replication (hops): ${hops}`);
  console.log(`- LAN Broadcasting (UDP): ${localDiscovery ? 'enabled' : 'disabled'}`);
  const clearnetModules = await waitForClearnet();
  const clearnetStatus = (clearnetModules && clearnetModules.length > 0) ? clearnetModules.join(', ') : 'disabled';
  let fediverseConnected = false;
  try {
    const acc = JSON.parse(fs.readFileSync(path.join(__dirname, '../configs/fediverse-accounts.json'), 'utf8'));
    fediverseConnected = !!(acc && acc.mastodon);
  } catch (_) {}
  console.log(`- Internet Broadcasting:`);
  console.log(`  - Clearnet: ${clearnetStatus}`);
  console.log(`  - Fediverse: ${fediverseConnected ? 'enabled' : 'disabled'}`);
  console.log("");
  console.log("=========================");
  console.log("Modules loaded: [", modules.length, "]");
  console.log("=========================");

  // Check for updates
  await checkForUpdate();
  console.log("=========================");

  if (/gui/i.test(mode)) {
    const warmup = await waitForWarmup();
    if (warmup) console.log(`- Warmup-time: ${warmup}`);
  }
}

module.exports = {
  printMetadata,
  setClearnetModules,
  setWarmupTime,
  colors
};
