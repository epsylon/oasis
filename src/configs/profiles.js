const fs = require('fs');
const os = require('os');
const path = require('path');

const MAIN = 'main';
const PREFIX = '.ssb-oasis_';
const MOVING = '.moving-';
const RESTORING = '.restoring-';
const DIR_RE = /^\.ssb-oasis_[A-Za-z0-9_-]{8}$/;
const RELAUNCH_CODE = 75;
const MAX_ACCOUNTS = 3;
const COPIED = ['oasis-config.json', 'oasis-server-config.json'];
const NODE_FILES = new Set(['profiles', 'profiles.json']);
const PLACEHOLDER = '# The accounts of this node are in oasis/profiles/, each one a complete .ssb.\n# This file is not a key: it keeps older programs from creating a new identity here.\n';

const disabled = () => !!process.env.OASIS_TEST;
const active = () => !disabled() && !!process.env.OASIS_ROOT_SSB;
const configuredPath = () => {
  try { const p = require('../server/node_modules/rc')('ssb', {}).path; if (typeof p === 'string' && p) return p; } catch (_) {}
  return process.env.ssb_path || path.join(os.homedir(), '.ssb');
};
const rootDir = () => path.resolve(process.env.OASIS_ROOT_SSB || configuredPath());
const rootStateDir = () => path.resolve(process.env.OASIS_ROOT_STATE || process.env.OASIS_STATE_DIR || rootDir());
const profilesDir = () => path.join(rootDir(), 'oasis', 'profiles');
const stateFile = () => path.join(rootDir(), 'oasis', 'profiles.json');
const isKey = (key) => key === MAIN || DIR_RE.test(String(key || ''));
const dirOf = (key) => key === MAIN ? rootDir() : path.join(profilesDir(), String(key));
const stateDirOf = (key) => key === MAIN ? rootStateDir() : dirOf(key);

const exists = (p) => { try { fs.lstatSync(p); return true; } catch (_) { return false; } };
const deviceOf = (p) => { try { return fs.statSync(p).dev; } catch (_) { return null; } };

const readState = () => {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  } catch (_) { return {}; }
};

const writeState = (next) => {
  fs.mkdirSync(path.dirname(stateFile()), { recursive: true, mode: 0o700 });
  const tmp = `${stateFile()}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, stateFile());
};

const shortOf = (feedId) => String(feedId || '').replace(/^@/, '').replace(/\+/g, '-').replace(/\//g, '_').slice(0, 8);

const readId = (dir) => {
  try {
    const keys = JSON.parse(fs.readFileSync(path.join(dir, 'secret'), 'utf8').replace(/^\s*#.*$/gm, ''));
    return keys && typeof keys.id === 'string' ? keys.id : null;
  } catch (_) { return null; }
};

const secretTime = (dir) => {
  try {
    const s = fs.statSync(path.join(dir, 'secret'));
    const times = [s.birthtimeMs, s.mtimeMs].filter((t) => t > 0);
    return times.length ? Math.round(Math.min(...times)) : 0;
  } catch (_) { return 0; }
};

let cache = null;
const reset = () => { cache = null; };

const list = () => {
  if (cache) return cache;
  const cards = readState().cards || {};
  const cardOf = (key) => (cards[key] && typeof cards[key] === 'object' ? cards[key] : {});
  const listed = [];
  const mainId = readId(rootDir());
  if (mainId) listed.push({ key: MAIN, dir: rootDir(), id: mainId });
  let entries = [];
  try { entries = fs.readdirSync(profilesDir(), { withFileTypes: true }); } catch (_) {}
  const bornOf = (p) => {
    const times = [Number(cardOf(p.key).createdAt), secretTime(p.dir)].filter((t) => t > 0);
    return times.length ? Math.min(...times) : 0;
  };
  const created = entries
    .filter((e) => e.isDirectory() && DIR_RE.test(e.name))
    .map((e) => ({ key: e.name, dir: path.join(profilesDir(), e.name), id: readId(path.join(profilesDir(), e.name)) }))
    .filter((p) => p.id)
    .map((p) => ({ ...p, createdAt: bornOf(p) }))
    .sort((x, y) => x.createdAt - y.createdAt);
  cache = listed.concat(created).map((p) => ({
    ...p,
    short: shortOf(p.id),
    name: typeof cardOf(p.key).name === 'string' ? cardOf(p.key).name : '',
    image: typeof cardOf(p.key).image === 'string' ? cardOf(p.key).image : null,
    createdAt: p.createdAt || bornOf(p)
  }));
  return cache;
};
const accounts = () => (active() ? list() : []);

const currentKey = () => {
  const cur = path.resolve(process.env.OASIS_ROOT_SSB && process.env.ssb_path ? process.env.ssb_path : rootDir());
  if (cur === rootDir()) return MAIN;
  const key = path.basename(cur);
  return path.dirname(cur) === profilesDir() && DIR_RE.test(key) ? key : MAIN;
};

const find = (key) => accounts().find((p) => p.key === key) || null;
const current = () => find(currentKey());
const others = () => accounts().filter((p) => p.key !== currentKey());
const otherIds = () => new Set(others().map((p) => p.id));
const deletable = () => others().filter((p) => p.key !== MAIN);
const canCreate = () => accounts().length < MAX_ACCOUNTS;

const defaultKey = () => {
  const all = list();
  const wanted = readState().default;
  if (wanted && all.some((p) => p.key === wanted)) return wanted;
  const last = all.filter((p) => p.key !== MAIN).pop();
  return last ? last.key : MAIN;
};

const pointArgvPath = (dir) => {
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--') break;
    if (argv[i].startsWith('--path=')) argv[i] = `--path=${dir}`;
    else if (argv[i] === '--path' && i + 1 < argv.length) argv[i + 1] = dir;
  }
};

const point = (dir) => {
  process.env.ssb_path = dir;
  if (process.env.OASIS_STATE_DIR) process.env.OASIS_STATE_DIR = dir;
  pointArgvPath(dir);
  return dir;
};

const moveEntries = (from, to, skip) => {
  let names = [];
  try { names = fs.readdirSync(from); } catch (_) { return; }
  for (const name of names) {
    if (skip.has(name)) continue;
    const target = path.join(to, name);
    if (exists(target)) throw new Error(`${target} already exists`);
    fs.renameSync(path.join(from, name), target);
  }
};

const finishMove = (staging, id, created) => {
  const key = PREFIX + shortOf(id);
  fs.renameSync(staging, dirOf(key));
  try { fs.writeFileSync(path.join(rootDir(), 'secret'), PLACEHOLDER, { mode: 0o400, flag: 'wx' }); } catch (_) {}
  const state = readState();
  const cards = { ...(state.cards || {}) };
  const old = cards[MAIN] && typeof cards[MAIN] === 'object' ? cards[MAIN] : {};
  cards[key] = { ...old, id, createdAt: Number(old.createdAt) || created || Date.now() };
  delete cards[MAIN];
  const next = { ...state, cards };
  for (const k of ['default', 'next']) if (next[k] === MAIN) next[k] = key;
  writeState(next);
  return key;
};

const resumeMoves = () => {
  let names = [];
  try { names = fs.readdirSync(profilesDir()).filter((n) => n.startsWith(MOVING)); } catch (_) { return; }
  for (const name of names) {
    const staging = path.join(profilesDir(), name);
    const id = readId(staging);
    if (!id || readId(rootDir()) || exists(dirOf(PREFIX + shortOf(id)))) continue;
    finishMove(staging, id, secretTime(staging));
  }
};

const newIdentity = () => {
  const tmp = fs.mkdtempSync(path.join(profilesDir(), '.new-'));
  const keys = require('../server/node_modules/ssb-keys').createSync(path.join(tmp, 'secret'));
  const staging = path.join(profilesDir(), MOVING + shortOf(keys.id));
  fs.renameSync(tmp, staging);
  return { id: keys.id, staging };
};

const moveRootAccount = () => {
  reset();
  const root = rootDir();
  const fresh = !exists(path.join(root, 'secret')) && !list().length;
  const known = readId(root);
  if ((!known && !fresh) || (known && exists(dirOf(PREFIX + shortOf(known))))) return null;
  const stateRoot = path.join(rootStateDir(), 'oasis');
  fs.mkdirSync(profilesDir(), { recursive: true, mode: 0o700 });
  const dev = deviceOf(profilesDir());
  if (deviceOf(root) !== dev || (exists(stateRoot) && deviceOf(stateRoot) !== dev)) return null;
  const created = known ? secretTime(root) : Date.now();
  const { id, staging } = known ? { id: known, staging: path.join(profilesDir(), MOVING + shortOf(known)) } : newIdentity();
  const stagedState = path.join(staging, 'oasis');
  fs.mkdirSync(stagedState, { recursive: true, mode: 0o700 });
  try {
    moveEntries(root, staging, new Set(['oasis', 'secret']));
    moveEntries(stateRoot, stagedState, NODE_FILES);
    if (known) fs.renameSync(path.join(root, 'secret'), path.join(staging, 'secret'));
  } catch (_) {
    try {
      moveEntries(stagedState, stateRoot, new Set());
      moveEntries(staging, root, new Set(['oasis']));
      fs.rmdirSync(stagedState);
      fs.rmdirSync(staging);
    } catch (_) {}
    return null;
  }
  return finishMove(staging, id, created);
};

const applyRestore = () => {
  const state = readState();
  let names = [];
  try { names = fs.readdirSync(profilesDir()).filter((n) => n.startsWith(RESTORING)); } catch (_) {}
  if (state.restoreRemove === undefined) {
    for (const n of names) fs.rmSync(path.join(profilesDir(), n), { recursive: true, force: true });
    return;
  }
  const remove = state.restoreRemove;
  if (DIR_RE.test(String(remove || ''))) fs.rmSync(dirOf(remove), { recursive: true, force: true });
  const cards = { ...(state.cards || {}) };
  delete cards[remove];
  for (const n of names) {
    const dir = path.join(profilesDir(), n);
    const id = readId(dir);
    const key = id ? PREFIX + shortOf(id) : null;
    if (!key || exists(dirOf(key))) continue;
    fs.renameSync(dir, dirOf(key));
    cards[key] = { id, createdAt: Date.now() };
  }
  const { restoreRemove, ...rest } = state;
  writeState({ ...rest, cards });
};

const stageRestore = ({ remove, open }) => {
  if (!DIR_RE.test(String(open || ''))) return false;
  writeState({ ...readState(), restoreRemove: remove || null, default: open, next: open });
  return true;
};

const resolve = () => {
  if (disabled() || readId(rootDir())) return null;
  reset();
  if (!list().length) return null;
  const dir = point(dirOf(defaultKey()));
  reset();
  return dir;
};

const activate = () => {
  if (disabled()) return null;
  const root = rootDir();
  process.env.OASIS_ROOT_SSB = root;
  if (process.env.OASIS_STATE_DIR && !process.env.OASIS_ROOT_STATE) process.env.OASIS_ROOT_STATE = process.env.OASIS_STATE_DIR;
  try { resumeMoves(); moveRootAccount(); } catch (_) {}
  try { applyRestore(); } catch (_) {}
  reset();
  const state = readState();
  const wanted = isKey(state.next) && find(state.next) ? state.next : defaultKey();
  if (state.next !== undefined || state.default !== wanted) {
    const { next, ...rest } = state;
    try { writeState({ ...rest, default: wanted }); } catch (_) {}
  }
  reset();
  if (wanted === MAIN || !readId(dirOf(wanted))) return root;
  return point(dirOf(wanted));
};

const launchStateDir = () => {
  if (disabled()) return rootStateDir();
  const state = readState();
  const wanted = isKey(state.next) && list().some((p) => p.key === state.next) ? state.next : defaultKey();
  return stateDirOf(wanted);
};

const copyConfig = (fromDir, toDir) => {
  for (const name of COPIED) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(fromDir, name), 'utf8'));
      if (name === 'oasis-config.json' && data.wallet && typeof data.wallet === 'object') data.wallet = { ...data.wallet, user: '', pass: '' };
      fs.writeFileSync(path.join(toDir, name), JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch (_) {}
  }
};

const create = () => {
  if (disabled()) throw new Error('profiles disabled');
  if (!canCreate()) throw new Error('avatar limit reached');
  const ssbKeys = require('../server/node_modules/ssb-keys');
  fs.mkdirSync(profilesDir(), { recursive: true, mode: 0o700 });
  const tmp = fs.mkdtempSync(path.join(profilesDir(), '.new-'));
  try {
    const keys = ssbKeys.createSync(path.join(tmp, 'secret'));
    const key = PREFIX + shortOf(keys.id);
    const dir = dirOf(key);
    if (fs.existsSync(dir)) throw new Error('profile exists');
    fs.mkdirSync(path.join(tmp, 'oasis'), { recursive: true, mode: 0o700 });
    copyConfig(path.join(stateDirOf(currentKey()), 'oasis'), path.join(tmp, 'oasis'));
    fs.renameSync(tmp, dir);
    const state = readState();
    writeState({ ...state, cards: { ...(state.cards || {}), [key]: { id: keys.id, createdAt: Date.now() } } });
    reset();
    return find(key);
  } catch (e) {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    throw e;
  }
};

const remove = (key) => {
  if (!deletable().some((p) => p.key === key)) return false;
  fs.rmSync(dirOf(key), { recursive: true, force: true });
  const state = readState();
  const cards = { ...(state.cards || {}) };
  delete cards[key];
  const next = { ...state, cards };
  if (next.default === key) delete next.default;
  if (next.next === key) delete next.next;
  writeState(next);
  reset();
  return true;
};

const travel = (key) => {
  if (key === currentKey() || !find(key)) return false;
  writeState({ ...readState(), next: key });
  return true;
};

const touch = ({ name, image } = {}) => {
  const me = current();
  if (!me || disabled()) return;
  const card = { name: typeof name === 'string' ? name : me.name, image: typeof image === 'string' ? image : me.image };
  if (card.name === me.name && card.image === me.image) return;
  try {
    const state = readState();
    const cards = state.cards || {};
    writeState({ ...state, cards: { ...cards, [me.key]: { ...(cards[me.key] || {}), id: me.id, ...card } } });
  } catch (_) {}
  reset();
};

const ubiClaimant = (epochId) => {
  const u = readState().ubi;
  return u && typeof u === 'object' && u.epochId === epochId && typeof u.id === 'string' ? u.id : null;
};

const noteUbiClaim = (epochId, id) => {
  if (!active() || !epochId || !id || ubiClaimant(epochId)) return;
  try { writeState({ ...readState(), ubi: { epochId, id } }); } catch (_) {}
};

const blobFile = (dir, blobId) => {
  const m = /^&([A-Za-z0-9+/]{43}=)\.sha256$/.exec(String(blobId || ''));
  if (!m) return null;
  const hex = Buffer.from(m[1], 'base64').toString('hex');
  const base = path.join(dir, 'blobs', 'sha256', hex.slice(0, 2));
  return [path.join(base, hex.slice(2)), path.join(base, hex)].find((f) => fs.existsSync(f)) || null;
};

module.exports = {
  MAIN, RELAUNCH_CODE, MAX_ACCOUNTS, active, isKey, rootDir, profilesDir, dirOf, stateDirOf, shortOf, reset,
  accounts, currentKey, current, others, otherIds, deletable, canCreate, defaultKey,
  activate, resolve, launchStateDir, create, remove, travel, touch, blobFile, stageRestore, ubiClaimant, noteUbiClaim
};
