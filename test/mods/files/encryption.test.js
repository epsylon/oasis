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
const tmpRoot = path.join(os.tmpdir(), 'oasis-files-enc-tests');

const makeSbot = (port) => {
  fs.mkdirSync(tmpRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'node-'));
  const sbot = SecretStack({ caps })
    .use(mod('ssb-db2/core'))
    .use(mod('ssb-classic'))
    .use(mod('ssb-db2/compat/db'))
    .use(mod('ssb-blobs'))
    .call(null, { path: dir, keys: ssbKeys.generate(), port, host: '127.0.0.1', connections: { incoming: { net: [{ scope: 'device', transform: 'shs', port, host: '127.0.0.1' }] }, outgoing: { net: [{ transform: 'shs' }] } }, db2: {}, blobs: { max: 20 * 1024 * 1024 } });
  sbot.__dir = dir;
  return sbot;
};
const closeSbot = (sbot) => new Promise((resolve) => sbot.close(() => { try { fs.rmSync(sbot.__dir, { recursive: true, force: true }); } catch (_) {} resolve(); }));
const listBlobIds = (sbot) => new Promise((resolve) => pull(sbot.blobs.ls(), pull.filter(x => typeof x === 'string'), pull.collect((e, a) => resolve(e ? [] : a))));
const readBlob = (sbot, id) => new Promise((resolve) => pull(sbot.blobs.get(id), pull.collect((e, chunks) => resolve(e ? Buffer.alloc(0) : Buffer.concat(chunks)))));
const freePort = () => 30000 + Math.floor(Math.random() * 20000);
const waitFor = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };

describe('files: encrypted uploads for tribes', (t) => {
  t('only ciphertext is stored and a connected member decrypts it', async () => {
    const owner = makeSbot(freePort());
    const member = makeSbot(freePort());
    try {
      const marker = 'TRIBE-SECRET-' + crypto.randomBytes(8).toString('hex');
      const plain = Buffer.concat([Buffer.from(marker), crypto.randomBytes(300 * 1024)]);
      const src = path.join(owner.__dir, 'upload.bin');
      fs.writeFileSync(src, plain);
      const ownerShares = require('../../../src/models/fileshare_model')({ cooler: { open: async () => owner } });
      const pointer = await ownerShares.createShareFromFile({ filepath: src, filename: 'acta.bin', mime: 'application/octet-stream' });
      ok(pointer.manifestBlobId && pointer.key, 'a manifest and a key are produced');
      for (const id of await listBlobIds(owner)) {
        ok(!(await readBlob(owner, id)).includes(Buffer.from(marker)), 'no stored blob contains the plaintext');
      }
      const addr = `net:127.0.0.1:${owner.config.port}~shs:${owner.keys.public.replace('.ed25519', '')}`;
      await new Promise((resolve, reject) => member.connect(addr, (err) => err ? reject(err) : resolve()));
      ok(await waitFor(async () => Array.isArray(member.peers[owner.id]) && member.peers[owner.id].length > 0), 'the member is connected to the owner');
      const memberShares = require('../../../src/models/fileshare_model')({ cooler: { open: async () => member } });
      const got = await memberShares.reassembleToBuffer({ type: 'fileShare', v: 1, key: pointer.key, manifestBlobId: pointer.manifestBlobId, filename: 'acta.bin' });
      eq(got.length, plain.length, 'the member gets the whole file');
      ok(got.equals(plain), 'and it decrypts byte for byte');
    } finally { await closeSbot(member); await closeSbot(owner); }
  });
});
