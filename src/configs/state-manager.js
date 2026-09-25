const fs = require('fs');
const os = require('os');
const path = require('path');

const LEGACY_CONFIG_DIR = __dirname;
const ROOT = 'oasis';

const FOLDERS = {
  'wallet-addresses.json': 'banking',
  'banking-address-book.json': 'banking',
  'banking-allocations.json': 'banking',
  'banking-eco-history.json': 'banking',
  'banking-epochs.json': 'banking',
  'banking-ubi-notice.json': 'banking',
  'banking-confirm-notice.json': 'banking',
  'banking-ubi-paid.json': 'banking',
  'banking-funds-history.json': 'banking',
  'content_favorites.json': 'content',
  'follow_state.json': 'content',
  'agenda-config.json': 'content',
  'AI-history.json': 'ai',
  'AI-vectors.json': 'ai',
  'AI-search-vectors.json': 'ai',
  'fediverse-accounts.json': 'multiverse',
  'oasis-backup.json': 'backup',
  'oasis-first-contact': 'flags',
  'oasis-mentions-seen': 'flags',
  'oasis-inbox-read': 'flags',
  'oasis-inbox-archived': 'flags',
  'oasis-political-seen': 'flags',
  'gossip_unfollowed.json': 'peers'
};

const ALIASES = {
  'oasis-backup.json': ['backup.json']
};

const ssbDir = () => {
  try {
    const resolved = require('../server/ssb_config').statePath('.');
    if (resolved) return path.resolve(resolved);
  } catch (_) {}
  if (process.env.OASIS_STATE_DIR) return process.env.OASIS_STATE_DIR;
  return path.join(os.homedir(), '.ssb');
};

const stateDir = (name) => path.join(ssbDir(), ROOT, FOLDERS[name] || '');

const statePath = (name) => {
  const dir = stateDir(name);
  const target = path.join(dir, name);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(target)) {
      const candidates = [name, ...(ALIASES[name] || [])]
        .flatMap(n => [path.join(ssbDir(), n), path.join(LEGACY_CONFIG_DIR, n)]);
      const legacy = candidates.find(p => fs.existsSync(p));
      if (legacy) {
        try { fs.renameSync(legacy, target); }
        catch (_) { fs.copyFileSync(legacy, target); try { fs.unlinkSync(legacy); } catch (_) {} }
      }
    }
  } catch (_) {}
  return target;
};

const keysDir = (base = null) => {
  const root = ssbDir();
  if (base && path.resolve(base) !== root) return path.join(base, 'keys');
  const target = path.join(root, ROOT, 'keys');
  try {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const legacy = path.join(root, 'keys');
      if (fs.existsSync(legacy)) fs.renameSync(legacy, target);
      else fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    }
  } catch (_) {}
  return target;
};

const migrateAll = () => {
  for (const name of Object.keys(FOLDERS)) {
    try {
      const legacy = [name, ...(ALIASES[name] || [])]
        .flatMap(n => [path.join(ssbDir(), n), path.join(LEGACY_CONFIG_DIR, n)])
        .find(p => fs.existsSync(p));
      if (legacy) statePath(name);
    } catch (_) {}
  }
};

module.exports = { statePath, stateDir, ssbDir, keysDir, migrateAll };
