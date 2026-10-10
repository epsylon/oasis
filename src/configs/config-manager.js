const fs = require('fs');
const path = require('path');

const os = require('os');
const legacyConfigPath = path.join(__dirname, 'oasis-config.json');
const stateDir = process.env.OASIS_STATE_DIR || process.env.ssb_path || path.join(os.homedir(), '.ssb');
const oasisDir = path.join(stateDir, 'oasis');
const configFilePath = path.join(oasisDir, 'oasis-config.json');
const defaultServerConfigPath = path.join(__dirname, 'server-config.json');
const serverConfigFilePath = path.join(oasisDir, 'oasis-server-config.json');
for (const [from, to] of [[path.join(stateDir, 'oasis-config.json'), configFilePath], [path.join(stateDir, 'oasis-server-config.json'), serverConfigFilePath]]) {
  try {
    if (!fs.existsSync(to) && fs.existsSync(from)) {
      fs.mkdirSync(oasisDir, { recursive: true, mode: 0o700 });
      fs.renameSync(from, to);
    }
  } catch (_) {}
}
const writeStateFile = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, data, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch (_) {}
};
let configCache = { at: 0, cfg: null };
const CONFIG_TTL_MS = 2000;
const writeConfigFile = (data) => { configCache = { at: 0, cfg: null }; return writeStateFile(configFilePath, data); };
const readJsonFile = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; } };
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const mergeDeep = (base, over) => {
  if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isPlainObject(v) && isPlainObject(base[k]) ? mergeDeep(base[k], v) : v;
  return out;
};
if (!fs.existsSync(serverConfigFilePath)) {
  const shipped = readJsonFile(defaultServerConfigPath);
  const hops = shipped && shipped.friends ? shipped.friends.hops : undefined;
  try {
    if (shipped && shipped.pub === true) writeStateFile(serverConfigFilePath, JSON.stringify(shipped, null, 2));
    else if (Number.isFinite(hops) && hops !== 2) writeStateFile(serverConfigFilePath, JSON.stringify({ friends: { hops } }, null, 2));
  } catch (_) {}
}
const readServerConfig = () => mergeDeep(readJsonFile(defaultServerConfigPath) || {}, readJsonFile(serverConfigFilePath) || {});
const saveServerConfig = (patch) => writeStateFile(serverConfigFilePath, JSON.stringify(mergeDeep(readJsonFile(serverConfigFilePath) || {}, patch), null, 2));
if (!fs.existsSync(configFilePath) && fs.existsSync(legacyConfigPath)) {
  try { writeConfigFile(fs.readFileSync(legacyConfigPath, 'utf8')); } catch (_) {}
}

if (!fs.existsSync(configFilePath)) {
  const defaultConfig = {
    "themes": {
      "current": "Dark-SNH"
    },
    "ux": {
      "current": "blocks"
    },
    "modules": {
      "blogsMod": "on",
      "pollsMod": "on",
      "fediverseMod": "on",
      "invitesMod": "on",
      "walletMod": "on",
      "backupMod": "on",
      "devMod": "on",
      "cipherMod": "on",
      "bookmarksMod": "on",
      "videosMod": "on",
      "docsMod": "on",
      "audiosMod": "on",
      "tagsMod": "on",
      "imagesMod": "on",
      "trendingMod": "on",
      "eventsMod": "on",
      "tasksMod": "on",
      "marketMod": "on",
      "votesMod": "on",
      "tribesMod": "on",
      "reportsMod": "on",
      "opinionsMod": "on",
      "padsMod": "on",
      "wikiMod": "on",
      "emergenciesMod": "on",
      "mailingMod": "on",
      "roomsMod": "on",
      "phoneMod": "on",
      "logisticsMod": "on",
      "podcastsMod": "on",
      "campaignsMod": "on",
      "calendarsMod": "on",
      "transfersMod": "on",
      "feedMod": "on",
      "pixeliaMod": "on",
      "melodyMod": "on",
      "agendaMod": "on",
      "aiMod": "on",
      "aiNavMod": "on",
      "forumMod": "on",
      "gamesMod": "on",
      "housingMod": "on",
      "jobsMod": "on",
      "shopsMod": "on",
      "projectsMod": "on",
      "industryMod": "on",
      "bankingMod": "on",
      "schoolMod": "on",
      "parliamentMod": "on",
      "courtsMod": "on",
      "favoritesMod": "on",
      "logsMod": "on",
      "mapsMod": "on",
      "chatsMod": "on",
      "torrentsMod": "on",
      "filesMod": "on",
      "graphosMod": "on",
      "larpMod": "on"
    },
    "wallet": {
      "url": "http://localhost:7474",
      "user": "",
      "pass": "",
      "fee": "5"
    },
    "ai": {
      "prompt": "Provide an informative and precise response."
    },
    "ssbLogStream": {
      "limit": 2000
    },
    "homePage": "activity",
    "language": "en",
    "wish": "whole",
    "pmVisibility": "whole",
    "phone": { "visibility": "mutuals", "dnd": false, "relay": true },
    "lanBroadcasting": true
  };
  writeConfigFile(JSON.stringify(defaultConfig, null, 2));
}

const getConfig = () => {
  const now = Date.now();
  if (!configCache.cfg || now - configCache.at > CONFIG_TTL_MS) configCache = { at: now, cfg: readConfig() };
  return structuredClone(configCache.cfg);
};

const readConfig = () => {
  const configData = fs.readFileSync(configFilePath);
  const cfg = JSON.parse(configData);
  if (!['whole', 'mutuals', 'only-lan', 'local'].includes(cfg.wish)) cfg.wish = 'whole';
  if (cfg.pmVisibility !== 'whole' && cfg.pmVisibility !== 'mutuals') cfg.pmVisibility = 'whole';
  if (!cfg.phone || typeof cfg.phone !== 'object') cfg.phone = {};
  cfg.phone = { visibility: cfg.phone.visibility === 'whole' ? 'whole' : 'mutuals', dnd: cfg.phone.dnd === true, relay: cfg.phone.relay !== false };
  if (typeof cfg.ux === 'string') cfg.ux = { current: cfg.ux };
  if (!cfg.ux || typeof cfg.ux !== 'object') cfg.ux = { current: 'blocks' };
  if (cfg.ux.current === 'menus') cfg.ux.current = 'blocks';
  if (cfg.ux.current !== 'blocks' && cfg.ux.current !== 'ainav' && cfg.ux.current !== 'chats' && cfg.ux.current !== 'feed' && cfg.ux.current !== 'phone') cfg.ux.current = 'blocks';
  if (cfg.ux.current === 'ainav' && cfg.modules && cfg.modules.aiNavMod !== 'on') cfg.ux.current = 'blocks';
  if (cfg.ux.current === 'chats' && cfg.modules && cfg.modules.chatsMod !== 'on') cfg.ux.current = 'blocks';
  if (cfg.ux.current === 'phone' && cfg.modules && cfg.modules.phoneMod === 'off') cfg.ux.current = 'blocks';
  if (cfg.ux.current === 'feed' && cfg.modules && cfg.modules.feedMod === 'off') cfg.ux.current = 'blocks';
  if (!cfg.blobCache || typeof cfg.blobCache !== 'object' || !Number.isFinite(Number(cfg.blobCache.maxMB))) cfg.blobCache = { maxMB: 0 };
  if (!Number.isFinite(Number(cfg.blobCache.pubMaxMB))) cfg.blobCache.pubMaxMB = 0;
  if (cfg.modules && typeof cfg.modules === 'object') {
    if (cfg.modules.backupMod === undefined) cfg.modules.backupMod = cfg.modules.legacyMod === 'off' ? 'off' : 'on';
    for (const mod of ['wikiMod', 'emergenciesMod', 'mailingMod', 'logisticsMod', 'podcastsMod', 'campaignsMod', 'filesMod', 'phoneMod', 'roomsMod']) {
      if (cfg.modules[mod] === undefined) cfg.modules[mod] = 'on';
    }
  }
  return cfg;
};

const saveConfig = (newConfig) => {
  writeConfigFile(JSON.stringify(newConfig, null, 2));
};

module.exports = {
  configFilePath,
  serverConfigFilePath,
  getConfig,
  saveConfig,
  readServerConfig,
  saveServerConfig,
};
