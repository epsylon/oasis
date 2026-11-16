const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { pipeline } = require('stream');
const pull = require('../server/node_modules/pull-stream');
const toPull = require('../server/node_modules/stream-to-pull-stream');

const KEY_MAGIC = Buffer.from('OASIS1');
const BACKUP_MAGIC = Buffer.from('OASISBK1');
const SNAPSHOT_MAGIC = Buffer.from('OASISSN1');
const SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const REC_META = 1;
const REC_MSG = 2;
const REC_BLOB = 3;
const REC_FILE = 4;
const REC_MAX_LEN = 256 * 1024 * 1024;

const stateRoot = () => {
  try { return path.join(require('../configs/state-manager').ssbDir(), 'oasis'); } catch (_) { return null; }
};

const NOT_BACKED_UP = new Set(['oasis-config.json', 'oasis-server-config.json', 'rooms', 'profiles', 'profiles.json']);
const PROFILES_REL = 'profiles';
const RESTORING = '.restoring-';
const PENDING_FEED = 'pending-feed.jsonl';
const PENDING_BLOBS = 'pending-blobs';
const TRANSIENT = new Set(['own-feed.json', PENDING_FEED, PENDING_BLOBS]);
const listStateFiles = (dir, base = dir) => {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const entry of entries) {
    if ((dir === base && NOT_BACKED_UP.has(entry.name)) || TRANSIENT.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listStateFiles(full, base));
    else if (entry.isFile() && !entry.name.endsWith('.migrated') && !/^snapshot(-recent)?\.oasissn/.test(entry.name)) out.push({ rel: path.relative(base, full), full });
  }
  return out;
};
const LOG_BLOCK = 64 * 1024;
const OWN_FEED_FILE = 'own-feed.json';
const readOwnFeed = (dir, feedId) => {
  const out = [];
  let fd;
  try { fd = fs.openSync(path.join(dir, 'db2', 'log.bipf'), 'r'); } catch (_) { return out; }
  const bipf = require('../server/node_modules/bipf');
  const block = Buffer.alloc(LOG_BLOCK);
  try {
    for (let pos = 0; ; pos += LOG_BLOCK) {
      const read = fs.readSync(fd, block, 0, LOG_BLOCK, pos);
      if (read <= 0) break;
      for (let o = 0; o + 2 <= read; ) {
        const len = block.readUInt16LE(o);
        if (len === 0 || o + 2 + len > read) break;
        const data = block.subarray(o + 2, o + 2 + len);
        o += 2 + len;
        if (!data.some((b) => b !== 0)) continue;
        let rec = null;
        try { rec = bipf.decode(data, 0); } catch (_) { continue; }
        if (rec && rec.value && rec.value.author === feedId && typeof rec.key === 'string') out.push({ key: rec.key, value: rec.value, timestamp: rec.timestamp });
      }
      if (read < LOG_BLOCK) break;
    }
  } finally { try { fs.closeSync(fd); } catch (_) {} }
  return out.sort((a, b) => (a.value.sequence || 0) - (b.value.sequence || 0));
};
const activeProfiles = () => {
  try { const profiles = require('../configs/profiles'); return profiles.active() ? profiles : null; } catch (_) { return null; }
};
const accountKeyOf = (wanted) => {
  const profiles = activeProfiles();
  const key = String(wanted || 'all');
  return profiles && profiles.accounts().some(acc => acc.key === key) ? key : 'all';
};
const profileFiles = (account = 'all', withBlobs = false) => {
  const profiles = activeProfiles();
  if (!profiles) return [];
  const out = [];
  for (const acc of profiles.others()) {
    if (account !== 'all' && acc.key !== account) continue;
    const secret = path.join(acc.dir, 'secret');
    if (fs.existsSync(secret)) out.push({ rel: `${PROFILES_REL}/${acc.key}/secret`, full: secret });
    const feed = readOwnFeed(acc.dir, acc.id);
    if (feed.length) out.push({ rel: `${PROFILES_REL}/${acc.key}/oasis/backup/${OWN_FEED_FILE}`, data: Buffer.from(JSON.stringify(feed), 'utf8') });
    for (const f of listStateFiles(path.join(profiles.stateDirOf(acc.key), 'oasis'))) out.push({ rel: `${PROFILES_REL}/${acc.key}/oasis/${f.rel.split(path.sep).join('/')}`, full: f.full });
    if (!withBlobs) continue;
    const seen = new Set();
    for (const m of feed) {
      for (const ref of blobRefsOf(m.value && m.value.content)) {
        const file = seen.has(ref) ? null : profiles.blobFile(acc.dir, ref);
        seen.add(ref);
        if (file) out.push({ rel: `${PROFILES_REL}/${acc.key}/${path.relative(acc.dir, file).split(path.sep).join('/')}`, full: file });
      }
    }
  }
  return out;
};
const profileTarget = (parts) => {
  const profiles = activeProfiles();
  if (!profiles) return null;
  const [key, ...rest] = parts;
  if (!profiles.isKey(key) || !rest.length) return null;
  const isCurrent = key === profiles.currentKey();
  const known = profiles.accounts().some(acc => acc.key === key);
  if (!known && (key === profiles.MAIN || !profiles.canCreate())) return null;
  const isSecret = rest.length === 1 && rest[0] === 'secret';
  const isBlob = rest.length === 4 && rest[0] === 'blobs' && rest[1] === 'sha256' && /^[0-9a-f]{2}$/.test(rest[2]) && /^[0-9a-f]{2,64}$/.test(rest[3]);
  if (!isSecret && !isBlob && (rest[0] !== 'oasis' || rest.length < 2 || NOT_BACKED_UP.has(rest[1]))) return null;
  if (isCurrent && isSecret) return null;
  const base = path.resolve(isSecret || isBlob ? profiles.dirOf(key) : profiles.stateDirOf(key));
  const target = path.resolve(base, ...rest);
  return target.startsWith(base + path.sep) ? { target, isSecret, isBlob, isCurrent } : null;
};
const BLOB_RE = /&[A-Za-z0-9+/=]{44}\.sha256/g;
const DEFAULT_REMINDER_DAYS = 30;
const REMINDER_OPTIONS = [7, 30, 90, 0];

const MODULE_GROUPS = [
  { key: 'feed', test: (t) => /^(post|feed|about|contact|pub|vote|subscription)$/.test(t) },
  { key: 'media', test: (t) => /^(audio|video|image|document|bookmark|torrent|file)/i.test(t) },
  { key: 'blogs', test: (t) => /^blog/i.test(t) },
  { key: 'forum', test: (t) => /^forum/i.test(t) },
  { key: 'chats', test: (t) => /^chat/i.test(t) },
  { key: 'pads', test: (t) => /^pad/i.test(t) },
  { key: 'rooms', test: (t) => /^room/i.test(t) },
  { key: 'wiki', test: (t) => /^wiki/i.test(t) },
  { key: 'maps', test: (t) => /^map/i.test(t) },
  { key: 'tribes', test: (t) => /^tribe/i.test(t) },
  { key: 'school', test: (t) => /^school/i.test(t) },
  { key: 'parliament', test: (t) => /^parliament/i.test(t) },
  { key: 'courts', test: (t) => /^courts/i.test(t) },
  { key: 'emergencies', test: (t) => /^emergency/i.test(t) },
  { key: 'votes', test: (t) => /^(votes?|poll)/i.test(t) },
  { key: 'events', test: (t) => /^event/i.test(t) },
  { key: 'calendars', test: (t) => /^calendar/i.test(t) },
  { key: 'tasks', test: (t) => /^task/i.test(t) },
  { key: 'reports', test: (t) => /^report/i.test(t) },
  { key: 'mailing', test: (t) => /^mailing/i.test(t) },
  { key: 'campaigns', test: (t) => /^campaign/i.test(t) },
  { key: 'market', test: (t) => /^market/i.test(t) },
  { key: 'shops', test: (t) => /^shop/i.test(t) },
  { key: 'jobs', test: (t) => /^(job|curriculum)/i.test(t) },
  { key: 'housing', test: (t) => /^housing/i.test(t) },
  { key: 'projects', test: (t) => /^project/i.test(t) },
  { key: 'industry', test: (t) => /^industry/i.test(t) },
  { key: 'banking', test: (t) => /^(bank|ubi|wallet)/i.test(t) },
  { key: 'transfers', test: (t) => /^transfer/i.test(t) },
  { key: 'logistics', test: (t) => /^logistics/i.test(t) },
  { key: 'podcasts', test: (t) => /^podcast/i.test(t) },
  { key: 'games', test: (t) => /^(game|larp|pixelia|melody)/i.test(t) },
  { key: 'logs', test: (t) => /^log/i.test(t) }
];
const MODULE_KEYS = [...MODULE_GROUPS.map(g => g.key), 'inbox', 'other'];

const moduleOf = (content) => {
  if (typeof content === 'string') return 'inbox';
  const t = content && typeof content === 'object' ? String(content.type || '') : '';
  if (!t) return 'other';
  const g = MODULE_GROUPS.find(x => x.test(t));
  return g ? g.key : 'other';
};

const normalizePassword = (password) => {
  if (password && typeof password === 'object' && password.password) password = password.password;
  return String(password || '');
};
const deriveKey = (password, salt) => crypto.scryptSync(password, salt, 32);

const encryptBuffer = (plaintext, password) => {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(password, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([KEY_MAGIC, salt, iv, cipher.getAuthTag(), ciphertext]);
};

const decryptBuffer = (data, password) => {
  if (!Buffer.isBuffer(data) || data.length < KEY_MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN) throw new Error('Unrecognized or corrupt backup file.');
  if (!data.slice(0, KEY_MAGIC.length).equals(KEY_MAGIC)) throw new Error('Unrecognized or corrupt backup file.');
  let o = KEY_MAGIC.length;
  const salt = data.slice(o, o += SALT_LEN);
  const iv = data.slice(o, o += IV_LEN);
  const tag = data.slice(o, o += TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(password, salt), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data.slice(o)), decipher.final()]);
};

const ssbDirOf = () => require('../server/ssb_config').path;
const secretPathOf = () => path.join(ssbDirOf(), 'secret');

const stateFile = () => require('../configs/state-manager').statePath('oasis-backup.json');
const readState = () => {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')) || {}; } catch (_) { return {}; }
};
const writeState = (next) => {
  try {
    const p = stateFile();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(next, null, 2), { mode: 0o600 });
  } catch (_) {}
  return next;
};


const reminderState = () => {
  const b = readState();
  const days = b.reminderDays === undefined ? DEFAULT_REMINDER_DAYS : Number(b.reminderDays);
  const lastAt = b.lastAt || null;
  const lastTs = lastAt ? Date.parse(lastAt) || 0 : 0;
  const overdue = days > 0 && (!lastTs || Date.now() - lastTs > days * 86400000);
  return { lastAt, reminderDays: days, overdue, daysSince: lastTs ? Math.floor((Date.now() - lastTs) / 86400000) : null };
};
const setReminderDays = (days) => {
  const n = Number(days);
  return writeState({ ...readState(), reminderDays: REMINDER_OPTIONS.includes(n) ? n : DEFAULT_REMINDER_DAYS });
};
const markBackup = () => writeState({ ...readState(), lastAt: new Date().toISOString() });

const blobRefsOf = (value) => {
  let json;
  try { json = JSON.stringify(value); } catch (_) { return []; }
  return Array.from(new Set(json.match(BLOB_RE) || []));
};

const record = (type, payload) => {
  const head = Buffer.alloc(5);
  head.writeUInt8(type, 0);
  head.writeUInt32BE(payload.length, 1);
  return Buffer.concat([head, payload]);
};

const writeChunk = (stream, chunk) => new Promise((resolve, reject) => {
  const ok = stream.write(chunk, (err) => err ? reject(err) : null);
  if (ok) resolve();
  else stream.once('drain', resolve);
});

module.exports = ({ cooler }) => {
  let ssb;
  let restoreJob = null;
  let pendingApply = null;
  let importing = null;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const readLog = async (ssbClient) => new Promise((resolve, reject) => {
    pull(ssbClient.createLogStream({ reverse: false }), pull.collect((err, arr) => err ? reject(err) : resolve(arr || [])));
  });

  const listBlobs = async (ssbClient) => {
    if (!ssbClient.blobs || typeof ssbClient.blobs.ls !== 'function') return new Map();
    return new Promise((resolve) => {
      pull(ssbClient.blobs.ls({ long: true }), pull.collect((err, arr) => {
        if (err) return resolve(new Map());
        const out = new Map();
        for (const b of arr || []) {
          if (!b) continue;
          if (typeof b === 'string') out.set(b, 0);
          else if (b.id) out.set(b.id, Number(b.size) || 0);
        }
        resolve(out);
      }));
    });
  };

  const readBlob = (ssbClient, id) => new Promise((resolve) => {
    pull(ssbClient.blobs.get(id), pull.collect((e, chunks) => {
      if (e || !chunks || !chunks.length) return resolve(null);
      resolve(Buffer.concat(chunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c))));
    }));
  });

  const normalizeOptions = (opts = {}) => {
    const scope = String(opts.scope || 'all').toLowerCase() === 'mine' ? 'mine' : 'all';
    const withBlobs = opts.blobs === undefined ? true : !(opts.blobs === false || String(opts.blobs) === '0' || String(opts.blobs) === 'false' || String(opts.blobs) === 'off');
    const account = accountKeyOf(opts.account);
    const rawMods = Array.isArray(opts.modules) ? opts.modules : (opts.modules ? String(opts.modules).split(',') : []);
    const modules = rawMods.map(m => String(m || '').trim().toLowerCase()).filter(m => MODULE_KEYS.includes(m));
    const sinceTs = opts.since ? (Date.parse(opts.since) || 0) : 0;
    return { scope, withBlobs, modules, sinceTs, account };
  };

  const selectMessages = async (ssbClient, options) => {
    const me = ssbClient.id;
    const all = await readLog(ssbClient);
    const picked = [];
    const blobIds = new Set();
    for (const m of all) {
      if (!m || !m.value) continue;
      if (options.scope === 'mine' && m.value.author !== me) continue;
      if (options.sinceTs && Number(m.value.timestamp || m.timestamp || 0) < options.sinceTs) continue;
      if (options.modules.length && !options.modules.includes(moduleOf(m.value.content))) continue;
      picked.push(m);
      if (options.withBlobs) for (const ref of blobRefsOf(m.value.content)) blobIds.add(ref);
    }
    if (options.withBlobs && options.scope !== 'mine' && !options.sinceTs && !options.modules.length) {
      const sizes = await listBlobs(ssbClient);
      for (const id of sizes.keys()) blobIds.add(id);
    }
    return { picked, blobIds };
  };

  return {
    MODULE_KEYS,
    REMINDER_OPTIONS,
    moduleOf,
    encryptBuffer,
    decryptBuffer,

    async exportKeys(password) {
      const pw = normalizePassword(password);
      if (pw.length < 32) throw new Error('Password too short');
      const secretPath = secretPathOf();
      if (!fs.existsSync(secretPath)) throw new Error(".ssb/secret file doesn't exist");
      const original = fs.readFileSync(secretPath);
      const encrypted = encryptBuffer(original, pw);
      if (!decryptBuffer(encrypted, pw).equals(original)) throw new Error('Backup verification failed; nothing was exported.');
      return { filename: 'oasis.enc', data: encrypted };
    },

    async importKeys({ filePath, password }) {
      const pw = normalizePassword(password);
      if (!fs.existsSync(filePath)) throw new Error('Encrypted file not found.');
      let decrypted;
      try { decrypted = decryptBuffer(fs.readFileSync(filePath), pw); } catch (_) { throw new Error('Wrong password or corrupt backup file.'); }
      let keys = null;
      try { keys = JSON.parse(decrypted.toString('utf8').split('\n').filter(l => !l.trim().startsWith('#')).join('\n')); } catch (_) { keys = null; }
      const ssbKeys = require('../server/node_modules/ssb-keys');
      const probe = Buffer.from('oasis-keys-check');
      const valid = (() => {
        try {
          if (!keys || keys.curve !== 'ed25519' || typeof keys.public !== 'string' || typeof keys.private !== 'string' || keys.id !== '@' + keys.public) return false;
          return ssbKeys.verify(keys, ssbKeys.sign(keys, probe), probe) === true;
        } catch (_) { return false; }
      })();
      if (!valid) throw new Error('The file does not contain a valid Oasis identity.');
      const ssbDir = ssbDirOf();
      fs.mkdirSync(ssbDir, { recursive: true });
      const secretPath = path.join(ssbDir, 'secret');
      if (fs.existsSync(secretPath)) {
        const bakPath = path.join(ssbDir, 'secret.bak-' + new Date().toISOString().replace(/[:.]/g, '-'));
        fs.copyFileSync(secretPath, bakPath);
        try { fs.chmodSync(bakPath, 0o600); } catch (_) {}
      }
      const tmpPath = path.join(ssbDir, 'secret.tmp-' + process.pid);
      fs.writeFileSync(tmpPath, decrypted, { mode: 0o600 });
      fs.renameSync(tmpPath, secretPath);
      try { fs.unlinkSync(filePath); } catch (_) {}
      let id = '';
      try { id = JSON.parse(decrypted.toString('utf8').split('\n').filter(l => !l.trim().startsWith('#')).join('\n')).id || ''; } catch (_) {}
      return { path: secretPath, id };
    },

    recoveryKit() {
      const secretPath = secretPathOf();
      if (!fs.existsSync(secretPath)) throw new Error(".ssb/secret file doesn't exist");
      const raw = fs.readFileSync(secretPath, 'utf8');
      const clean = raw.split('\n').filter(l => !l.trim().startsWith('#')).join('\n').trim();
      let id = '';
      try { id = JSON.parse(clean).id || ''; } catch (_) {}
      return { secret: clean, id, createdAt: new Date().toISOString() };
    },

    async estimate(opts = {}) {
      const ssbClient = await openSsb();
      const options = normalizeOptions(opts);
      const { picked, blobIds } = await selectMessages(ssbClient, options);
      let bytes = 0;
      for (const m of picked) bytes += Buffer.byteLength(JSON.stringify({ key: m.key, value: m.value, timestamp: m.timestamp }), 'utf8') + 5;
      let blobBytes = 0;
      let blobsFound = 0;
      if (options.withBlobs && blobIds.size) {
        const sizes = await listBlobs(ssbClient);
        for (const id of blobIds) {
          if (!sizes.has(id)) continue;
          blobsFound += 1;
          blobBytes += sizes.get(id) || 0;
        }
      }
      return { options, messages: picked.length, blobs: blobsFound, blobsReferenced: blobIds.size, messageBytes: bytes, blobBytes, bytes: bytes + blobBytes };
    },

    async createBackup(opts = {}, password, outPath) {
      const pw = normalizePassword(password);
      if (pw.length < 32) throw new Error('Password too short');
      const ssbClient = await openSsb();
      const options = normalizeOptions(opts);
      const profiles = activeProfiles();
      const withOpen = options.account === 'all' || !profiles || options.account === profiles.currentKey();
      const { picked, blobIds } = withOpen ? await selectMessages(ssbClient, options) : { picked: [], blobIds: new Set() };
      const salt = crypto.randomBytes(SALT_LEN);
      const iv = crypto.randomBytes(IV_LEN);
      const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(pw, salt), iv);
      const gzip = zlib.createGzip();
      const out = fs.createWriteStream(outPath);
      const done = new Promise((resolve, reject) => pipeline(gzip, cipher, out, (err) => err ? reject(err) : resolve()));
      out.write(Buffer.concat([BACKUP_MAGIC, salt, iv]));
      const included = [];
      const cur = profiles ? profiles.current() : null;
      if (profiles) {
        if (withOpen && cur) included.push({ key: cur.key, id: cur.id });
        for (const acc of profiles.others()) if (options.account === 'all' || acc.key === options.account) included.push({ key: acc.key, id: acc.id });
      }
      const defaultKey = profiles ? profiles.defaultKey() : null;
      const defaultId = (included.find(acc => acc.key === defaultKey) || included[0] || {}).id || null;
      const meta = { version: 1, createdAt: new Date().toISOString(), author: ssbClient.id, options, messages: picked.length, ...(included.length ? { accounts: included, defaultId } : {}) };
      await writeChunk(gzip, record(REC_META, Buffer.from(JSON.stringify(meta), 'utf8')));
      for (const m of picked) {
        await writeChunk(gzip, record(REC_MSG, Buffer.from(JSON.stringify({ key: m.key, value: m.value, timestamp: m.timestamp }), 'utf8')));
      }
      let files = 0;
      const root = stateRoot();
      if (root) {
        const own = withOpen ? listStateFiles(root) : [];
        if (withOpen && cur && fs.existsSync(path.join(cur.dir, 'secret'))) own.push({ rel: `${PROFILES_REL}/${cur.key}/secret`, full: path.join(cur.dir, 'secret') });
        const extra = withOpen && options.account !== 'all' ? [] : profileFiles(options.account, options.withBlobs);
        for (const f of [...own, ...extra]) {
          let data = f.data || null;
          if (!data) { try { data = fs.readFileSync(f.full); } catch (_) { continue; } }
          const head = Buffer.from(JSON.stringify({ rel: f.rel.split(path.sep).join('/'), size: data.length }), 'utf8');
          const lenBuf = Buffer.alloc(4);
          lenBuf.writeUInt32BE(head.length, 0);
          await writeChunk(gzip, record(REC_FILE, Buffer.concat([lenBuf, head, data])));
          files += 1;
        }
      }
      let blobs = 0;
      if (options.withBlobs) {
        for (const id of blobIds) {
          const data = await readBlob(ssbClient, id);
          if (!data) continue;
          const head = Buffer.from(JSON.stringify({ id, size: data.length }), 'utf8');
          const lenBuf = Buffer.alloc(4);
          lenBuf.writeUInt32BE(head.length, 0);
          await writeChunk(gzip, record(REC_BLOB, Buffer.concat([lenBuf, head, data])));
          blobs += 1;
        }
      }
      gzip.end();
      await done;
      fs.appendFileSync(outPath, cipher.getAuthTag());
      markBackup();
      const tag = options.account !== 'all' && profiles ? ((profiles.accounts().find(acc => acc.key === options.account) || {}).short || '') : '';
      return { path: outPath, messages: picked.length, blobs, bytes: fs.statSync(outPath).size, filename: `oasis-backup-${tag ? `${tag}-` : ''}${new Date().toISOString().slice(0, 10)}.oasisbk` };
    },

    async createSnapshot(outPath, { sinceMs = 0, now = Date.now() } = {}) {
      const ssbClient = await openSsb();
      const all = await readLog(ssbClient);
      const byAuthor = new Map();
      for (const m of all) {
        if (!m || !m.value || !m.value.author || m.value.content === undefined || m.value.content === null) continue;
        const list = byAuthor.get(m.value.author) || [];
        list.push(m);
        byAuthor.set(m.value.author, list);
      }
      const latest = (list) => list.reduce((t, m) => Math.max(t, Number(m.timestamp) || 0, Number(m.value.timestamp) || 0), 0);
      const picked = [...byAuthor.values()]
        .filter(list => !(sinceMs > 0) || latest(list) >= now - sinceMs)
        .sort((a, b) => latest(b) - latest(a))
        .flatMap(list => list.sort((a, b) => (a.value.sequence || 0) - (b.value.sequence || 0)));
      const gzip = zlib.createGzip();
      const out = fs.createWriteStream(outPath);
      const done = new Promise((resolve, reject) => pipeline(gzip, out, (err) => err ? reject(err) : resolve()));
      out.write(SNAPSHOT_MAGIC);
      const meta = { version: 1, kind: 'snapshot', createdAt: new Date().toISOString(), author: ssbClient.id, messages: picked.length, feeds: new Set(picked.map(m => m.value.author)).size, boxed: picked.filter(m => typeof m.value.content === 'string').length, sinceMs: sinceMs > 0 ? sinceMs : null };
      await writeChunk(gzip, record(REC_META, Buffer.from(JSON.stringify(meta), 'utf8')));
      for (const m of picked) {
        await writeChunk(gzip, record(REC_MSG, Buffer.from(JSON.stringify({ key: m.key, value: m.value, timestamp: m.timestamp }), 'utf8')));
      }
      gzip.end();
      await done;
      return { path: outPath, messages: picked.length, feeds: meta.feeds, bytes: fs.statSync(outPath).size, createdAt: meta.createdAt };
    },

    isSnapshotFile(filePath) {
      try {
        const fd = fs.openSync(filePath, 'r');
        const head = Buffer.alloc(SNAPSHOT_MAGIC.length);
        fs.readSync(fd, head, 0, head.length, 0);
        fs.closeSync(fd);
        return head.equals(SNAPSHOT_MAGIC);
      } catch (_) { return false; }
    },

    async fetchSnapshot({ address, connect = null, tier = 'full' }, outPath) {
      const ssbClient = await openSsb();
      const doConnect = connect || ((addr, cb) => ssbClient.conn.connect(addr, cb));
      const discard = () => { try { fs.unlinkSync(outPath); } catch (_) {} return null; };
      try {
        const rpc = await new Promise((resolve, reject) => doConnect(address, (err, r) => err ? reject(err) : resolve(r)));
        if (!rpc || !rpc.snapshot || typeof rpc.snapshot.get !== 'function') return null;
        const info = await new Promise((resolve) => rpc.snapshot.info({ tier }, (err, i) => resolve(err ? null : i)));
        if (!info || !(info.bytes > 0) || info.bytes > SNAPSHOT_MAX_BYTES) return null;
        const out = fs.createWriteStream(outPath);
        let written = 0;
        await new Promise((resolve, reject) => {
          pull(
            rpc.snapshot.get({ tier }),
            pull.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c)),
            pull.through(c => { written += c.length; }),
            toPull.sink(out, (err) => err ? reject(err) : resolve())
          );
        });
        if (written > SNAPSHOT_MAX_BYTES || !this.isSnapshotFile(outPath)) return discard();
        return { address, tier, path: outPath, bytes: written, createdAt: info.createdAt };
      } catch (_) { return discard(); }
    },

    startBootstrap({ address, connect = null, tiers = ['recent', 'full'] }) {
      if (restoreJob && restoreJob.running) return restoreJob;
      const empty = () => ({ messages: 0, skipped: 0, failed: 0, forked: 0, blobs: 0, blobsSkipped: 0, percent: 0 });
      const job = { running: true, source: 'snapshot', phase: null, tier: null, tiers: [], address, startedAt: new Date().toISOString(), finishedAt: null, progress: empty(), result: null, error: null };
      restoreJob = job;
      const total = { ...empty(), files: 0, forks: [], errors: [], meta: null };
      const run = async () => {
        for (const tier of tiers) {
          const tmp = path.join(os.tmpdir(), `oasis-snapshot-${tier}-${Date.now()}-${Math.random().toString(36).slice(2)}.oasissn`);
          job.tier = tier;
          job.phase = 'download';
          try {
            const got = await this.fetchSnapshot({ address, connect, tier }, tmp);
            if (!got) continue;
            job.phase = 'restore';
            const res = await this.restoreBackup({ filePath: tmp, password: '', stateFiles: false, onProgress: (p) => { job.progress = { ...total, ...p, messages: total.messages + p.messages, skipped: total.skipped + p.skipped, failed: total.failed + p.failed, forked: total.forked + p.forked }; } });
            for (const k of ['messages', 'skipped', 'failed', 'forked', 'blobs', 'blobsSkipped', 'files']) total[k] += Number(res[k]) || 0;
            total.forks.push(...(res.forks || []));
            total.errors.push(...(res.errors || []));
            total.meta = res.meta || total.meta;
            job.tiers.push({ tier, messages: res.messages, skipped: res.skipped, bytes: got.bytes });
          } finally { try { fs.unlinkSync(tmp); } catch (_) {} }
        }
        if (!job.tiers.length) throw new Error('snapshot not available');
        total.percent = 100;
        return total;
      };
      job.promise = run()
        .then((res) => { job.result = res; job.progress = { ...job.progress, ...res }; return res; })
        .catch((err) => { job.error = err && err.message ? err.message : String(err); return null; })
        .finally(() => { job.running = false; job.phase = null; job.finishedAt = new Date().toISOString(); });
      return job;
    },

    async readBackup(filePath, password, onRecord) {
      const size = fs.statSync(filePath).size;
      const snapshot = this.isSnapshotFile(filePath);
      const pw = snapshot ? '' : normalizePassword(password);
      const headLen = snapshot ? SNAPSHOT_MAGIC.length : BACKUP_MAGIC.length + SALT_LEN + IV_LEN;
      const tailLen = snapshot ? 0 : TAG_LEN;
      if (size < headLen + tailLen) throw new Error('Unrecognized or corrupt backup file.');
      const fd = fs.openSync(filePath, 'r');
      const head = Buffer.alloc(headLen);
      fs.readSync(fd, head, 0, headLen, 0);
      const tag = Buffer.alloc(TAG_LEN);
      if (!snapshot) fs.readSync(fd, tag, 0, TAG_LEN, size - TAG_LEN);
      fs.closeSync(fd);
      if (!snapshot && !head.slice(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) throw new Error('Unrecognized or corrupt backup file.');
      let decipher = null;
      if (!snapshot) {
        const salt = head.slice(BACKUP_MAGIC.length, BACKUP_MAGIC.length + SALT_LEN);
        const iv = head.slice(BACKUP_MAGIC.length + SALT_LEN, headLen);
        decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(pw, salt), iv);
        decipher.setAuthTag(tag);
      }
      const gunzip = zlib.createGunzip();
      const total = size - headLen - tailLen;
      const source = fs.createReadStream(filePath, { start: headLen, end: size - tailLen - 1 });
      let streamError = null;
      if (decipher) pipeline(source, decipher, gunzip, (err) => { if (err) streamError = err; });
      else pipeline(source, gunzip, (err) => { if (err) streamError = err; });
      const chunks = [];
      let pendingLen = 0;
      let meta = null;
      const compact = () => {
        if (chunks.length < 2) return;
        const all = Buffer.concat(chunks, pendingLen);
        chunks.length = 0;
        chunks.push(all);
      };
      const nextRecord = () => {
        if (pendingLen < 5) return null;
        if (chunks[0].length < 5) compact();
        const type = chunks[0].readUInt8(0);
        const len = chunks[0].readUInt32BE(1);
        if (len > REC_MAX_LEN) throw new Error('Backup record too large.');
        if (pendingLen < 5 + len) return null;
        compact();
        const all = chunks[0];
        chunks.length = 0;
        pendingLen = all.length - 5 - len;
        if (pendingLen) chunks.push(all.slice(5 + len));
        return { type, payload: all.slice(5, 5 + len) };
      };
      const handle = async (type, payload) => {
        const read = Math.min(total, source.bytesRead || 0);
        if (type === REC_META) { meta = JSON.parse(payload.toString('utf8')); await onRecord({ type: 'meta', meta, read, total }); }
        else if (type === REC_MSG) await onRecord({ type: 'msg', msg: JSON.parse(payload.toString('utf8')), read, total });
        else if (type === REC_BLOB) {
          const hl = payload.readUInt32BE(0);
          const header = JSON.parse(payload.slice(4, 4 + hl).toString('utf8'));
          await onRecord({ type: 'blob', id: header.id, data: payload.slice(4 + hl), read, total });
        }
        else if (type === REC_FILE) {
          const hl = payload.readUInt32BE(0);
          const header = JSON.parse(payload.slice(4, 4 + hl).toString('utf8'));
          await onRecord({ type: 'file', rel: header.rel, data: payload.slice(4 + hl), read, total });
        }
      };
      try {
        for await (const chunk of gunzip) {
          chunks.push(chunk);
          pendingLen += chunk.length;
          let rec;
          while ((rec = nextRecord())) await handle(rec.type, rec.payload);
        }
      } catch (e) {
        source.destroy();
        if (streamError || /unsupported state|auth|bad decrypt|incorrect header|invalid/i.test(String(e && e.message))) throw new Error('Wrong password or corrupt backup file.');
        throw e;
      }
      if (streamError) throw new Error('Wrong password or corrupt backup file.');
      return meta;
    },

    async restoreBackup({ filePath, password, onProgress, stateFiles = true }) {
      const ssbClient = await openSsb();
      let validate = null;
      try { validate = require('../server/node_modules/ssb-validate'); } catch (_) {}
      const seqKey = (v) => `${v.author}::${v.sequence}`;
      const existing = new Map();
      for (const m of await readLog(ssbClient)) if (m && m.value) existing.set(seqKey(m.value), m.key);
      const stats = { messages: 0, skipped: 0, failed: 0, forked: 0, blobs: 0, blobsSkipped: 0, files: 0, percent: 0, forks: [], errors: [], meta: null };
      const forkAuthors = new Map();
      const errorCounts = new Map();
      const noteError = (err) => {
        const reason = String(err && err.message ? err.message : err || 'unknown error').replace(/, on feed:@[^\s]+/g, '').replace(/in state:\{.*?\}/g, '').trim();
        errorCounts.set(reason, (errorCounts.get(reason) || 0) + 1);
      };
      const addMsg = (value) => new Promise((resolve) => {
        if (typeof ssbClient.add !== 'function') return resolve(new Error('add is not available'));
        ssbClient.add(value, (err) => resolve(err || null));
      });
      const addBlob = (data) => new Promise((resolve) => {
        pull(pull.values([data]), ssbClient.blobs.add((err, ref) => resolve(err ? null : ref)));
      });
      const getByKey = (key) => new Promise((resolve) => {
        if (!key || typeof ssbClient.get !== 'function') return resolve(false);
        try { ssbClient.get(key, (err, value) => resolve(!err && !!value)); } catch (_) { resolve(false); }
      });
      const storedByKey = async (msg) => {
        if (await getByKey(msg.key)) return true;
        let computed = null;
        try { computed = validate ? validate.id(msg.value) : null; } catch (_) { computed = null; }
        return computed && computed !== msg.key ? getByKey(computed) : false;
      };
      const supportsLs = !!(ssbClient.blobs && typeof ssbClient.blobs.ls === 'function');
      const present = supportsLs ? await listBlobs(ssbClient) : new Map();
      const hasBlob = (id) => supportsLs ? Promise.resolve(present.has(id)) : new Promise((resolve) => ssbClient.blobs.has(id, (err, has) => resolve(!err && !!has)));
      const deferred = [];
      const report = () => { if (typeof onProgress === 'function') onProgress({ ...stats }); };
      const sameMessage = (storedKey, msg) => {
        if (storedKey === msg.key) return true;
        try { return storedKey === validate.id(msg.value); } catch (_) { return false; }
      };
      const tryAdd = async (msg) => {
        const k = seqKey(msg.value);
        if (existing.has(k)) {
          if (sameMessage(existing.get(k), msg)) { stats.skipped += 1; return true; }
          stats.forked += 1;
          forkAuthors.set(msg.value.author, (forkAuthors.get(msg.value.author) || 0) + 1);
          return true;
        }
        const err = await addMsg(msg.value);
        if (err) {
          if (!(await storedByKey(msg))) return err;
          stats.skipped += 1;
          existing.set(k, msg.key);
          return true;
        }
        stats.messages += 1;
        existing.set(k, msg.key);
        return true;
      };
      let fileRoot;
      const fileRootFor = () => {
        if (fileRoot !== undefined) return fileRoot;
        fileRoot = stateRoot();
        try {
          const profiles = require('../configs/profiles');
          const author = stats.meta && stats.meta.author;
          const owner = profiles.active() && author && author !== ssbClient.id ? profiles.accounts().find(acc => acc.id === author) : null;
          if (owner) fileRoot = path.join(profiles.stateDirOf(owner.key), 'oasis');
        } catch (_) {}
        return fileRoot;
      };
      const profiles = activeProfiles();
      let plan = null;
      const planFor = (m) => {
        if (!profiles || !m || !Array.isArray(m.accounts) || !m.accounts.length) return null;
        const origin = profiles.current();
        const node = profiles.accounts();
        const finalIds = new Set([...node.filter(acc => !origin || acc.key !== origin.key).map(acc => acc.id), ...m.accounts.map(acc => acc && acc.id)]);
        if (finalIds.size > profiles.MAX_ACCOUNTS) throw new Error(`accounts-limit:${finalIds.size - profiles.MAX_ACCOUNTS}`);
        try { for (const n of fs.readdirSync(profiles.profilesDir())) if (n.startsWith(RESTORING)) fs.rmSync(path.join(profiles.profilesDir(), n), { recursive: true, force: true }); } catch (_) {}
        const targets = new Map();
        for (const acc of m.accounts) {
          if (!acc || typeof acc.id !== 'string' || !profiles.isKey(acc.key)) continue;
          const existing = node.find(n => n.id === acc.id);
          const keep = !!existing && (!origin || existing.key !== origin.key);
          const dir = keep ? existing.dir : path.join(profiles.profilesDir(), RESTORING + profiles.shortOf(acc.id));
          targets.set(acc.key, { id: acc.id, short: profiles.shortOf(acc.id), dir, stateDir: keep ? profiles.stateDirOf(existing.key) : dir, fresh: !keep });
        }
        const list = [...targets.values()];
        return { origin, targets, author: list.find(t => t.id === m.author) || null, def: list.find(t => t.id === m.defaultId) || list[0] || null };
      };
      const safeParts = (parts) => parts.length > 0 && parts.every(p => p && p !== '.' && p !== '..' && !/[\0]/.test(p));
      const writeInto = (base, parts, data, opts = {}) => {
        const baseAbs = path.resolve(base);
        const target = path.resolve(baseAbs, ...parts);
        if (!target.startsWith(baseAbs + path.sep)) throw new Error('state file rejected');
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
        if (opts.once && fs.existsSync(target)) return false;
        if (opts.keep && fs.existsSync(target)) { try { fs.copyFileSync(target, `${target}.before-restore`); } catch (_) {} }
        fs.writeFileSync(target, data, opts.mode ? { mode: opts.mode, flag: 'wx' } : opts.once ? { flag: 'wx' } : {});
        return true;
      };
      const pendingDirOf = (t) => path.join(t.stateDir, 'oasis', 'backup');
      const intoAccounts = async (rec) => {
        if (rec.type === 'msg') {
          if (!plan.author || !rec.msg || !rec.msg.value || !rec.msg.value.author) { stats.skipped += 1; return; }
          fs.mkdirSync(pendingDirOf(plan.author), { recursive: true, mode: 0o700 });
          fs.appendFileSync(path.join(pendingDirOf(plan.author), PENDING_FEED), JSON.stringify({ key: rec.msg.key, value: rec.msg.value, timestamp: rec.msg.timestamp }) + '\n');
          stats.messages += 1;
          return;
        }
        if (rec.type === 'blob') {
          if (!plan.author || !/^&[A-Za-z0-9+/]{43}=\.sha256$/.test(String(rec.id || ''))) { stats.skipped += 1; return; }
          const hex = Buffer.from(String(rec.id).slice(1, 45), 'base64').toString('hex');
          if (writeInto(path.join(pendingDirOf(plan.author), PENDING_BLOBS), [hex], rec.data, { once: true })) stats.blobs += 1; else stats.blobsSkipped += 1;
          return;
        }
        if (rec.type !== 'file') return;
        const parts = (typeof rec.rel === 'string' ? rec.rel.replace(/\\/g, '/') : '').split('/').filter(Boolean);
        if (!safeParts(parts)) { stats.failed += 1; noteError('state file rejected'); return; }
        try {
          if (parts[0] === PROFILES_REL) {
            const t = plan.targets.get(parts[1]);
            const rest = parts.slice(2);
            const isSecret = rest.length === 1 && rest[0] === 'secret';
            const isBlob = rest.length === 4 && rest[0] === 'blobs' && rest[1] === 'sha256' && /^[0-9a-f]{2}$/.test(rest[2]) && /^[0-9a-f]{2,64}$/.test(rest[3]);
            const isState = rest[0] === 'oasis' && rest.length >= 2 && !NOT_BACKED_UP.has(rest[1]);
            if (!t || (isSecret && !t.fresh) || (!isSecret && !isBlob && !isState)) { stats.skipped += 1; return; }
            if (isSecret) writeInto(t.dir, rest, rec.data, { mode: 0o400 });
            else if (isBlob) { if (!writeInto(t.dir, rest, rec.data, { once: true })) { stats.blobsSkipped += 1; return; } }
            else writeInto(t.stateDir, rest, rec.data, { keep: true });
          } else {
            if (!plan.author || NOT_BACKED_UP.has(parts[0])) { stats.skipped += 1; return; }
            writeInto(path.join(plan.author.stateDir, 'oasis'), parts, rec.data, { keep: true });
          }
          stats.files += 1;
        } catch (_) { stats.failed += 1; noteError('state file could not be written'); }
      };
      const meta = await this.readBackup(filePath, password, async (rec) => {
        if (rec.total) stats.percent = Math.min(100, (rec.read / rec.total) * 100);
        if (rec.type === 'meta') { stats.meta = rec.meta; plan = planFor(rec.meta); return; }
        if (plan) { await intoAccounts(rec); report(); return; }
        if (rec.type === 'msg') {
          if (!rec.msg || !rec.msg.value || !rec.msg.value.author) { stats.failed += 1; noteError('malformed message'); report(); return; }
          const res = await tryAdd(rec.msg);
          if (res !== true) deferred.push({ msg: rec.msg, err: res });
          report();
          return;
        }
        if (rec.type === 'file') {
          if (!stateFiles) { stats.skipped += 1; report(); return; }
          const root = fileRootFor();
          const rel = typeof rec.rel === 'string' ? rec.rel.replace(/\\/g, '/') : '';
          const parts = rel.split('/').filter(Boolean);
          if (parts[0] === PROFILES_REL && parts.every(p => p !== '.' && p !== '..' && !/[\0]/.test(p))) {
            const dest = profileTarget(parts.slice(1));
            if (dest && dest.isBlob && dest.isCurrent) {
              const ref = await addBlob(rec.data);
              if (ref) { stats.blobs += 1; present.set(ref, rec.data.length); } else { stats.failed += 1; noteError('blob could not be stored'); }
              report();
              return;
            }
            try {
              if (!dest || ((dest.isSecret || dest.isBlob) && fs.existsSync(dest.target))) { stats.skipped += 1; report(); return; }
              fs.mkdirSync(path.dirname(dest.target), { recursive: true, mode: 0o700 });
              if (!dest.isSecret && fs.existsSync(dest.target)) { try { fs.copyFileSync(dest.target, `${dest.target}.before-restore`); } catch (_) {} }
              fs.writeFileSync(dest.target, rec.data, dest.isSecret ? { mode: 0o400, flag: 'wx' } : dest.isBlob ? { flag: 'wx' } : {});
              try { require('../configs/profiles').reset(); } catch (_) {}
              stats.files += 1;
            } catch (_) { stats.failed += 1; noteError('state file could not be written'); }
            report();
            return;
          }
          const safe = !!root && parts.length > 0 && !NOT_BACKED_UP.has(parts[0]) && !path.isAbsolute(rel) && parts.every(p => p !== '.' && p !== '..' && !/[\0]/.test(p));
          const rootAbs = root ? path.resolve(root) : '';
          const target = safe ? path.resolve(rootAbs, ...parts) : '';
          if (!safe || !target.startsWith(rootAbs + path.sep)) { stats.failed += 1; noteError('state file rejected'); report(); return; }
          try {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            if (fs.existsSync(target)) { try { fs.copyFileSync(target, `${target}.before-restore`); } catch (_) {} }
            fs.writeFileSync(target, rec.data);
            stats.files += 1;
          } catch (_) { stats.failed += 1; noteError('state file could not be written'); }
          report();
          return;
        }
        if (rec.type === 'blob') {
          if (await hasBlob(rec.id)) { stats.blobsSkipped += 1; report(); return; }
          const ref = await addBlob(rec.data);
          if (ref) { stats.blobs += 1; present.set(ref, rec.data.length); } else { stats.failed += 1; noteError('blob could not be stored'); }
          report();
        }
      });
      if (plan) {
        const { getConfig, newAccountConfig } = require('../configs/config-manager');
        const language = getConfig().language;
        for (const t of plan.targets.values()) {
          if (!t.fresh || !language) continue;
          try { writeInto(t.stateDir, ['oasis', 'oasis-config.json'], JSON.stringify({ ...newAccountConfig(), language }, null, 2), { once: true }); } catch (_) {}
        }
        stats.percent = 100;
        stats.errors = Array.from(errorCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count }));
        stats.accounts = [...plan.targets.values()].map(t => ({ id: t.id, short: t.short, isDefault: !!plan.def && t.id === plan.def.id, isNew: t.fresh }));
        stats.replaces = plan.origin ? { key: plan.origin.key, short: plan.origin.short } : null;
        pendingApply = plan.def ? { remove: plan.origin ? plan.origin.key : null, open: `.ssb-oasis_${plan.def.short}`, short: plan.def.short } : null;
        try { fs.unlinkSync(filePath); } catch (_) {}
        report();
        return { ...stats, meta: stats.meta || meta };
      }
      deferred.sort((a, b) => a.msg.value.author === b.msg.value.author ? (a.msg.value.sequence || 0) - (b.msg.value.sequence || 0) : String(a.msg.value.author).localeCompare(String(b.msg.value.author)));
      let pending = deferred;
      while (pending.length) {
        const next = [];
        for (const item of pending) {
          const res = await tryAdd(item.msg);
          if (res !== true) next.push({ msg: item.msg, err: res });
        }
        report();
        if (next.length === pending.length) { pending = next; break; }
        pending = next;
      }
      for (const item of pending) { stats.failed += 1; noteError(item.err); }
      stats.percent = 100;
      stats.forks = Array.from(forkAuthors.entries()).map(([author, count]) => ({ author, count, mine: author === ssbClient.id }));
      stats.errors = Array.from(errorCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count }));
      try { fs.unlinkSync(filePath); } catch (_) {}
      report();
      return { ...stats, meta: stats.meta || meta };
    },

    startRestore({ filePath, password, source = 'file' }) {
      if (restoreJob && restoreJob.running) return restoreJob;
      pendingApply = null;
      const job = { running: true, source, startedAt: new Date().toISOString(), finishedAt: null, progress: { messages: 0, skipped: 0, failed: 0, forked: 0, blobs: 0, blobsSkipped: 0, percent: 0 }, result: null, error: null };
      restoreJob = job;
      job.promise = this.restoreBackup({ filePath, password, onProgress: (p) => { job.progress = p; } })
        .then((res) => { job.result = res; return res; })
        .catch((err) => { job.error = err && err.message ? err.message : String(err); try { fs.unlinkSync(filePath); } catch (_) {} return null; })
        .finally(() => { job.running = false; job.finishedAt = new Date().toISOString(); });
      return job;
    },

    async importOwnFeed() {
      if (importing) return importing;
      importing = (async () => {
        const dir = path.dirname(require('../configs/state-manager').statePath(OWN_FEED_FILE));
        const ownFile = path.join(dir, OWN_FEED_FILE);
        const feedFile = path.join(dir, PENDING_FEED);
        const blobsDir = path.join(dir, PENDING_BLOBS);
        if (!fs.existsSync(ownFile) && !fs.existsSync(feedFile) && !fs.existsSync(blobsDir)) return null;
        const ssbClient = await openSsb();
        const guard = ssbClient.feedGuard && typeof ssbClient.feedGuard.status === 'function' ? (() => { try { return ssbClient.feedGuard.status(); } catch (_) { return null; } })() : null;
        if (guard && (guard.restoring || guard.restoreConflict)) return null;
        const add = (value) => new Promise((resolve) => ssbClient.add(value, (e) => resolve(e || null)));
        let added = 0;
        let total = 0;
        if (fs.existsSync(ownFile)) {
          let list = [];
          try { list = JSON.parse(fs.readFileSync(ownFile, 'utf8')); } catch (_) { list = []; }
          const mine = (Array.isArray(list) ? list : []).filter((m) => m && m.value && m.value.author === ssbClient.id).sort((a, b) => (a.value.sequence || 0) - (b.value.sequence || 0));
          total += mine.length;
          for (const m of mine) if (!(await add(m.value))) added += 1;
          try { fs.unlinkSync(ownFile); } catch (_) {}
        }
        if (fs.existsSync(feedFile)) {
          let failed = [];
          const lines = require('readline').createInterface({ input: fs.createReadStream(feedFile, 'utf8'), crlfDelay: Infinity });
          for await (const line of lines) {
            let msg = null;
            try { msg = JSON.parse(line); } catch (_) { continue; }
            if (!msg || !msg.value || !msg.value.author) continue;
            total += 1;
            if (await add(msg.value)) failed.push(msg); else added += 1;
          }
          failed.sort((a, b) => a.value.author === b.value.author ? (a.value.sequence || 0) - (b.value.sequence || 0) : String(a.value.author).localeCompare(String(b.value.author)));
          while (failed.length) {
            const next = [];
            for (const msg of failed) if (await add(msg.value)) next.push(msg); else added += 1;
            if (next.length === failed.length) break;
            failed = next;
          }
          try { fs.unlinkSync(feedFile); } catch (_) {}
        }
        if (fs.existsSync(blobsDir)) {
          for (const name of fs.readdirSync(blobsDir)) {
            const file = path.join(blobsDir, name);
            let data = null;
            try { data = fs.readFileSync(file); } catch (_) { continue; }
            await new Promise((resolve) => pull(pull.values([data]), ssbClient.blobs.add(() => resolve())));
            try { fs.unlinkSync(file); } catch (_) {}
          }
          try { fs.rmdirSync(blobsDir); } catch (_) {}
        }
        return { added, total };
      })().finally(() => { importing = null; });
      return importing;
    },

    restorePlan() { return pendingApply; },

    fileKind(filePath) {
      let head = Buffer.alloc(0);
      try {
        const fd = fs.openSync(filePath, 'r');
        try { const buf = Buffer.alloc(BACKUP_MAGIC.length); const n = fs.readSync(fd, buf, 0, buf.length, 0); head = buf.slice(0, n); } finally { fs.closeSync(fd); }
      } catch (_) { return null; }
      if (head.slice(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) return 'backup';
      if (head.slice(0, KEY_MAGIC.length).equals(KEY_MAGIC)) return 'keys';
      return null;
    },

    restoreStatus() {
      if (!restoreJob) return null;
      const { promise, ...rest } = restoreJob;
      return rest;
    },

    reminderState() { return reminderState(); },

    setReminderDays(days) { return setReminderDays(days); },

    markBackup() { return markBackup(); },

    async rebuildIndexes() {
      const started = Date.now();
      const ssbClient = await openSsb();
      const indexDir = path.join(require('../configs/state-manager').ssbDir(), 'db2', 'indexes');
      const measure = (dir) => {
        let files = 0, bytes = 0;
        const walk = (d) => {
          let entries = [];
          try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
          for (const entry of entries) {
            const full = path.join(d, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            try { bytes += fs.statSync(full).size; files += 1; } catch (_) {}
          }
        };
        walk(dir);
        return { files, bytes };
      };
      const before = measure(indexDir);
      let error = null;
      try {
        await new Promise((resolve, reject) => {
          try { ssbClient.rebuild((err) => err ? reject(err) : resolve()); } catch (e) { reject(e); }
        });
      } catch (e) { error = e && e.message ? e.message : String(e); }
      const after = measure(indexDir);
      let totalMessages = 0;
      try { totalMessages = (await readLog(ssbClient)).length; } catch (_) {}
      return {
        checkedAt: new Date().toISOString(),
        tookMs: Date.now() - started,
        ok: !error,
        error,
        totalMessages,
        indexes: { path: indexDir, files: after.files, bytes: after.bytes, deltaBytes: after.bytes - before.bytes }
      };
    },
    async verify({ author = null } = {}) {
      const started = Date.now();
      const ssbClient = await openSsb();
      const me = author || ssbClient.id;
      const all = await readLog(ssbClient);
      let validate = null;
      try { validate = require('../server/node_modules/ssb-validate'); } catch (_) {}
      const own = all.filter(m => m && m.value && m.value.author === me).sort((a, b) => (a.value.sequence || 0) - (b.value.sequence || 0));
      const feed = { messages: own.length, lastSequence: own.length ? own[own.length - 1].value.sequence : 0, gaps: [], brokenLinks: [], badHashes: [], badSignatures: [], duplicates: [] };
      let expected = 1;
      let prevKey = null;
      const seen = new Set();
      for (const m of own) {
        const seq = Number(m.value.sequence) || 0;
        if (seen.has(seq)) feed.duplicates.push(seq);
        seen.add(seq);
        if (seq !== expected) { feed.gaps.push({ expected, found: seq }); expected = seq; }
        if (prevKey && m.value.previous !== prevKey) feed.brokenLinks.push(seq);
        if (validate) {
          try { if (validate.id(m.value) !== m.key) feed.badHashes.push(seq); } catch (_) { feed.badHashes.push(seq); }
          try { if (validate.checkInvalidOOO(m.value, null)) feed.badSignatures.push(seq); } catch (_) { feed.badSignatures.push(seq); }
        }
        prevKey = m.key;
        expected = seq + 1;
      }
      feed.ok = !feed.gaps.length && !feed.brokenLinks.length && !feed.badHashes.length && !feed.badSignatures.length && !feed.duplicates.length;
      const bySeq = new Map();
      for (const m of all) {
        if (!m || !m.value || !m.value.author) continue;
        const k = `${m.value.author}::${m.value.sequence}`;
        if (!bySeq.has(k)) bySeq.set(k, new Set());
        bySeq.get(k).add(m.key);
      }
      const forkMap = new Map();
      for (const [k, keys] of bySeq) {
        if (keys.size < 2) continue;
        const [feedId, seq] = k.split('::');
        if (!forkMap.has(feedId)) forkMap.set(feedId, []);
        forkMap.get(feedId).push({ sequence: Number(seq), keys: Array.from(keys) });
      }
      const forks = Array.from(forkMap.entries()).map(([feedId, points]) => ({ author: feedId, mine: feedId === me, points: points.sort((a, b) => a.sequence - b.sequence) }));
      const referenced = new Set();
      const referencedOwn = new Set();
      for (const m of all) {
        if (!m || !m.value) continue;
        for (const ref of blobRefsOf(m.value.content)) {
          referenced.add(ref);
          if (m.value.author === me) referencedOwn.add(ref);
        }
      }
      const present = await listBlobs(ssbClient);
      const orphan = [];
      let orphanBytes = 0;
      for (const [id, size] of present) if (!referenced.has(id)) { orphan.push(id); orphanBytes += size || 0; }
      const missing = [];
      const missingOwn = [];
      for (const id of referenced) {
        if (!present.size || present.has(id)) continue;
        missing.push(id);
        if (referencedOwn.has(id)) missingOwn.push(id);
      }
      return {
        author: me, checkedAt: new Date().toISOString(), tookMs: Date.now() - started, totalMessages: all.length,
        feed, forks, forkCount: forks.length,
        blobs: { present: present.size, referenced: referenced.size, orphan: orphan.length, orphanBytes, missing: missing.length, missingOwn: missingOwn.length, orphanIds: orphan.slice(0, 50), missingIds: missing.slice(0, 50), missingOwnIds: missingOwn.slice(0, 50), listed: present.size > 0 || referenced.size === 0 }
      };
    }
  };
};

Object.assign(module.exports, { reminderState, setReminderDays, markBackup, readOwnFeed, REMINDER_OPTIONS, MODULE_KEYS });
