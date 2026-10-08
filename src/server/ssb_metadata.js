const fs = require('fs');
const os = require('os');
const path = require('path');
const pkg = require('./package.json');
const config = require('./ssb_config');
const updater = require('../backend/updater.js');

const formatMB = (bytes, decimals = 0) => `${(bytes / (1024 * 1024)).toFixed(decimals)} MB`;

const blobUsageOnDisk = (ssbPath) => {
  const out = { bytes: 0, files: 0 };
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) { try { out.bytes += fs.statSync(full).size; out.files += 1; } catch (_) {} }
    }
  };
  if (ssbPath) walk(path.join(ssbPath, 'blobs', 'sha256'));
  return out;
};

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
  const localDiscovery = (() => { try { return require('../configs/config-manager.js').getConfig().lanBroadcasting !== false; } catch (_) { return false; } })();
  const hops = config.conn?.hops ?? config.friends?.hops ?? 2;

  console.log("=========================");
  console.log(`Running mode: ${modeColor}${mode}${colors.reset}`);
  console.log("=========================");
  const walletId = (() => {
    try {
      const w = (require('../configs/config-manager.js').getConfig() || {}).wallet || {};
      if (!(String(w.url || '').trim() && String(w.user || '').trim() && String(w.pass || '').trim())) return '';
      const file = process.env.OASIS_BANKING_DIR ? path.join(process.env.OASIS_BANKING_DIR, 'wallet-addresses.json') : require('../configs/state-manager').statePath('wallet-addresses.json');
      const map = JSON.parse(fs.readFileSync(file, 'utf8'));
      const v = map[`@${publicKey}`];
      const addr = typeof v === 'string' ? v : (v && v.address) || '';
      return /^E[1-9A-HJ-NP-Za-km-z]{32,34}$/.test(addr) ? addr : '';
    } catch (_) { return ''; }
  })();
  console.log(`- OASIS ID: [ ${colors.orange}@${publicKey}${colors.reset} ]`);
  console.log(`- Package: ${colors.blue}${name} ${colors.yellow}[Version: ${version}]${colors.reset}`);
  if (hasHttp) console.log(`- GUI: ${colors.cyan}${oscLink}${colors.reset}`);
  const phoneEnabled = (() => {
    try { return ((require('../configs/config-manager.js').getConfig() || {}).modules || {}).phoneMod !== 'off'; } catch (_) { return false; }
  })();
  const phoneNumber = phoneEnabled ? (() => { try { return require('../models/phone_number').phoneNumberOf(`@${publicKey}`); } catch (_) { return null; } })() : null;
  console.log(`- VoIP ID: ${phoneEnabled ? (phoneNumber ? `[ ${colors.orange}${phoneNumber}${colors.reset} ]` : 'enabled') : 'disabled'}`);
  console.log(walletId ? `- ECOin ID: [ ${colors.orange}${walletId}${colors.reset} ]` : `- ECOin ID: disabled`);
  console.log("- Logging Level:", logLevel);
  console.log("- Engine: db2-legacy");
  const ifaces = os.networkInterfaces();
  const isOnline = Object.values(ifaces).some(list =>
    list && list.some(i => !i.internal && i.family === 'IPv4')
  );
  console.log(`- Protocol (port): ${ssbPort}`);
  const networkPaused = (() => { try { return require('../configs/config-manager.js').getConfig().networkPaused === true || process.env.OASIS_NETWORK_PAUSED === '1'; } catch (_) { return false; } })();
  console.log(`- Mode: ${networkPaused ? 'paused' : (isOnline ? 'online' : 'offline')}`);
  console.log(`- Replication (hops): ${hops}`);
  const oasisCfg = (() => { try { return require('../configs/config-manager.js').getConfig() || {}; } catch (_) { return {}; } })();
  console.log(`- Blockchain backlog: ${Number(oasisCfg.ssbLogStream && oasisCfg.ssbLogStream.limit) || 1000} blocks`);
  console.log(`- Blob size limit: ${formatMB(Number(config.blobs && config.blobs.max) || 0)}`);
  const cacheMb = Number(oasisCfg.blobCache && (isPublic ? oasisCfg.blobCache.pubMaxMB : oasisCfg.blobCache.maxMB)) || 0;
  const cacheUsage = blobUsageOnDisk(config.path);
  console.log(`- Media cache limit: ${cacheMb > 0 ? formatMB(cacheMb * 1024 * 1024) : 'Unlimited'}`);
  console.log(`- Current usage: ${formatMB(cacheUsage.bytes, 1)} · ${cacheUsage.files} files`);
  console.log(`- LAN Broadcasting (UDP): ${localDiscovery ? 'enabled' : 'disabled'}`);
  const clearnetModules = await waitForClearnet();
  const clearnetStatus = (clearnetModules && clearnetModules.length > 0) ? clearnetModules.join(', ') : 'disabled';
  const multiverse = (() => {
    if ((oasisCfg.modules || {}).fediverseMod === 'off') return [];
    try {
      const acc = JSON.parse(fs.readFileSync(require('../configs/state-manager').statePath('fediverse-accounts.json'), 'utf8')) || {};
      return [
        acc.mastodon && acc.mastodon.token ? 'Mastodon' : null,
        acc.peertube && acc.peertube.token ? 'PeerTube' : null,
        acc.telegram && acc.telegram.session ? 'Telegram' : null
      ].filter(Boolean);
    } catch (_) { return []; }
  })();
  console.log(`- Internet Broadcasting:`);
  console.log(`  - Clearnet: ${clearnetStatus}`);
  console.log(`  - Multiverse: ${multiverse.length ? multiverse.join(', ') : 'disabled'}`);
  if (hasHttp) {
    const en = (() => { try { return require('../client/assets/translations/i18n').en || {}; } catch (_) { return {}; } })();
    const uxNames = { blocks: en.uxModeMenus, ainav: en.uxModeAINav, chats: en.uxModeChats, feed: en.uxModeFeed, phone: en.phoneTitle };
    const wishNames = { whole: en.settingsWishWhole, mutuals: en.settingsWishMutuals, 'only-lan': en.settingsWishOnlyLan, local: en.settingsWishLocal };
    const workflow = (() => {
      try {
        const wf = require('../models/workflows_model');
        const key = wf.currentWorkflow(oasisCfg);
        if (key) return en[`workflow_${key}`] || key;
        const mods = oasisCfg.modules || {};
        return wf.ALL_MODULES.every(m => mods[`${m}Mod`] === 'on') ? (en.welcomeWorkflow_full || 'Default') : 'custom';
      } catch (_) { return 'custom'; }
    })();
    const ux = (oasisCfg.ux && oasisCfg.ux.current) || 'blocks';
    const wish = oasisCfg.wish || 'whole';
    console.log(`- Workflow: ${workflow}`);
    console.log(`- UX mode: ${uxNames[ux] || ux}`);
    console.log(`- Wish: ${wishNames[wish] || wish}`);
  }
  console.log("");
  console.log("=========================");
  console.log("Modules loaded: [", modules.length, "]");
  console.log("=========================");

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
