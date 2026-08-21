const fs = require("fs");
const path = require("path");

const TEMPLATE = path.join(__dirname, "../configs/content_favorites.json");

const storePath = () => {
  try {
    return require("../server/ssb_config").statePath("content_favorites.json") || TEMPLATE;
  } catch (_) { return TEMPLATE; }
};

const DEFAULT = {
  audios: [],
  blogs: [],
  bookmarks: [],
  calendars: [],
  chats: [],
  documents: [],
  events: [],
  forum: [],
  housing: [],
  images: [],
  jobs: [],
  logs: [],
  maps: [],
  pads: [],
  polls: [],
  projects: [],
  reports: [],
  school: [],
  shops: [],
  market: [],
  shopProducts: [],
  tasks: [],
  torrents: [],
  transfers: [],
  videos: [],
  votes: []
};

const safeArr = (v) => (Array.isArray(v) ? v : []);

let queue = Promise.resolve();

const withLock = (fn) => {
  queue = queue.then(fn, fn);
  return queue;
};

const normalize = (raw) => {
  const out = {};
  for (const k of Object.keys(DEFAULT)) {
    const list = safeArr(raw?.[k]).map((x) => String(x || "").trim()).filter(Boolean);
    out[k] = Array.from(new Set(list));
  }
  return out;
};

const ensureFile = async () => {
  try {
    await fs.promises.access(storePath());
  } catch (e) {
    const dir = path.dirname(storePath());
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(storePath(), JSON.stringify(DEFAULT, null, 2), "utf8");
  }
};

const readAll = async () => {
  await ensureFile();
  try {
    const txt = await fs.promises.readFile(storePath(), "utf8");
    return normalize(JSON.parse(txt || "{}"));
  } catch (e) {
    const fixed = normalize(DEFAULT);
    await fs.promises.writeFile(storePath(), JSON.stringify(fixed, null, 2), "utf8");
    return fixed;
  }
};

const writeAll = async (data) => {
  const dir = path.dirname(storePath());
  const tmp = path.join(dir, `.content_favorites.${process.pid}.${Date.now()}.tmp`);
  const txt = JSON.stringify(normalize(data), null, 2);
  await fs.promises.writeFile(tmp, txt, "utf8");
  await fs.promises.rename(tmp, storePath());
};

const assertKind = (kind) => {
  const k = String(kind || "").trim();
  if (!Object.prototype.hasOwnProperty.call(DEFAULT, k)) throw new Error("Invalid favorites kind");
  return k;
};

const lastArg = (args, n) => args[args.length - n];

const kindFromArgs = (args) => {
  const k = String(lastArg(args, 1) || "").trim();
  return assertKind(k);
};

const idFromArgs = (args) => String(lastArg(args, 1) || "").trim();

exports.getFavoriteSet = async (kind) => {
  const k = assertKind(kind);
  const data = await readAll();
  return new Set(safeArr(data[k]).map(String));
};

exports.getFavoriteIndex = async () => {
  const data = await readAll();
  const index = new Map();
  for (const kind of Object.keys(DEFAULT)) {
    for (const id of safeArr(data[kind])) index.set(String(id), kind);
  }
  return index;
};

exports.addFavorite = async (kind, id) =>
  withLock(async () => {
    const k = assertKind(kind);
    const favId = String(id || "").trim();
    if (!favId) return;
    const data = await readAll();
    const set = new Set(safeArr(data[k]).map(String));
    set.add(favId);
    data[k] = Array.from(set);
    await writeAll(data);
  });

exports.removeFavorite = async (kind, id) =>
  withLock(async () => {
    const k = assertKind(kind);
    const favId = String(id || "").trim();
    if (!favId) return;
    const data = await readAll();
    const set = new Set(safeArr(data[k]).map(String));
    set.delete(favId);
    data[k] = Array.from(set);
    await writeAll(data);
  });

exports.getFavoritesSet = async (...args) => exports.getFavoriteSet(kindFromArgs(args));
exports.addToFavorites = async (...args) => {
  const kind = kindFromArgs(args.slice(0, -1));
  const id = idFromArgs(args);
  return exports.addFavorite(kind, id);
};
exports.removeFromFavorites = async (...args) => {
  const kind = kindFromArgs(args.slice(0, -1));
  const id = idFromArgs(args);
  return exports.removeFavorite(kind, id);
};
exports.storePath = storePath;
