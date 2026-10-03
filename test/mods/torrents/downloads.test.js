const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { eq, ok } = require('../../helpers/assert');
const pull = require('../../../src/server/node_modules/pull-stream');
const SecretStack = require('../../../src/server/node_modules/secret-stack');
const ssbKeys = require('../../../src/server/node_modules/ssb-keys');

const SERVER = path.join(__dirname, '..', '..', '..', 'src', 'server');
const mod = (name) => require(path.join(SERVER, 'node_modules', name));
const caps = { shs: crypto.randomBytes(32).toString('base64') };
const tmpRoot = path.join(os.tmpdir(), 'oasis-torrent-tests');

const makeSbot = (port) => {
  fs.mkdirSync(tmpRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'node-'));
  const keys = ssbKeys.generate();
  const sbot = SecretStack({ caps })
    .use(mod('ssb-db2/core'))
    .use(mod('ssb-classic'))
    .use(mod('ssb-db2/compat/db'))
    .use(mod('ssb-blobs'))
    .call(null, { path: dir, keys, port, host: '127.0.0.1', connections: { incoming: { net: [{ scope: 'device', transform: 'shs', port, host: '127.0.0.1' }] }, outgoing: { net: [{ transform: 'shs' }] } }, db2: {}, blobs: { max: 20 * 1024 * 1024 } });
  sbot.__dir = dir;
  return sbot;
};

const addBlob = (sbot, buffer) => new Promise((resolve, reject) => pull(pull.values([buffer]), sbot.blobs.add((err, id) => err ? reject(err) : resolve(id))));
const hasBlob = (sbot, id) => new Promise((resolve) => sbot.blobs.has(id, (err, has) => resolve(!err && !!has)));
const closeSbot = (sbot) => new Promise((resolve) => sbot.close(() => { try { fs.rmSync(sbot.__dir, { recursive: true, force: true }); } catch (_) {} resolve(); }));
const waitFor = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
const freePort = () => 30000 + Math.floor(Math.random() * 20000);

describe('torrents: downloads fetched from connected peers', (t) => {
  t('a job fetches the blob from a peer that has it and reports progress', async () => {
    const seed = makeSbot(freePort());
    const leech = makeSbot(freePort());
    try {
      const data = crypto.randomBytes(900 * 1024);
      const blobId = await addBlob(seed, data);
      const addr = `net:127.0.0.1:${seed.config.port}~shs:${seed.keys.public.replace('.ed25519', '')}`;
      await new Promise((resolve, reject) => leech.connect(addr, (err) => err ? reject(err) : resolve()));
      ok(await waitFor(async () => Array.isArray(leech.peers[seed.id]) && leech.peers[seed.id].length > 0), 'the leech sees the seed among its live peers');
      const downloads = require('../../../src/models/torrent_downloads_model')({ cooler: { open: async () => leech } });
      const first = downloads.start({ blobId, size: data.length, name: 'clip.bin', torrentKey: '%t.sha256' });
      ok(first.active, 'the job starts active');
      ok(await waitFor(async () => (downloads.get(blobId) || {}).state === 'done'), 'the job completes');
      const job = downloads.get(blobId);
      eq(job.received, data.length, 'every byte was counted');
      eq(job.seeds, 1, 'the seed was found');
      ok(await hasBlob(leech, blobId), 'the blob is stored locally and verified by hash');
      eq(downloads.list().length, 1);
      const again = downloads.start({ blobId, size: data.length, name: 'clip.bin' });
      eq(again.state, 'done', 'starting a finished download keeps it done');
    } finally { await closeSbot(leech); await closeSbot(seed); }
  });

  t('a blob nobody serves waits for seeds instead of failing', async () => {
    const alone = makeSbot(freePort());
    try {
      const downloads = require('../../../src/models/torrent_downloads_model')({ cooler: { open: async () => alone } });
      const missing = '&' + crypto.randomBytes(32).toString('base64') + '.sha256';
      downloads.start({ blobId: missing, size: 10, name: 'ghost' });
      ok(await waitFor(async () => (downloads.get(missing) || {}).state === 'nosource'), 'no seeds online: the job waits');
      ok(downloads.get(missing).active, 'a waiting job is still active');
      ok(downloads.cancel(missing), 'it can be cancelled');
      eq(downloads.get(missing).state, 'cancelled');
      ok(downloads.remove(missing));
      eq(downloads.get(missing), null);
    } finally { await closeSbot(alone); }
  });
});
