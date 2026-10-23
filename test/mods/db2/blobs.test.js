const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { eq, ok, notOk } = require('../../helpers/assert');
const pull = require('../../../src/server/node_modules/pull-stream');
const SecretStack = require('../../../src/server/node_modules/secret-stack');
const ssbKeys = require('../../../src/server/node_modules/ssb-keys');

const SERVER = path.join(__dirname, '..', '..', '..', 'src', 'server');
const mod = (name) => require(path.join(SERVER, 'node_modules', name));

describe('ssb-blobs: the clearnet only trusts what the real blob store holds', (t) => {
  t('a blob written by ssb-blobs itself is seen as local, a legacy full-name file too, anything else is not', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-blobs-'));
    const sbot = SecretStack({ caps: { shs: crypto.randomBytes(32).toString('base64') } })
      .use(mod('ssb-db2/core'))
      .use(mod('ssb-classic'))
      .use(mod('ssb-blobs'))
      .call(null, { path: dir, keys: ssbKeys.generate(), connections: { incoming: {}, outgoing: {} }, db2: {} });
    try {
      const { hasLocalBlob } = require('../../../src/views/clearnet_view');
      const id = await new Promise((resolve, reject) => pull(pull.values([Buffer.from('a real picture')]), sbot.blobs.add((err, blobId) => err ? reject(err) : resolve(blobId))));
      ok(/^&.+\.sha256$/.test(id));
      ok(hasLocalBlob(id, dir), 'the blob ssb-blobs just stored is found where ssb-blobs put it');
      const hex = Buffer.from(id.slice(1, -7), 'base64').toString('hex');
      ok(fs.existsSync(path.join(dir, 'blobs', 'sha256', hex.slice(0, 2), hex.slice(2))), 'and that place is <2 hex chars>/<the other 62>');
      const legacy = crypto.createHash('sha256').update('older upload').digest();
      const legacyId = `&${legacy.toString('base64')}.sha256`;
      const legacyHex = legacy.toString('hex');
      fs.mkdirSync(path.join(dir, 'blobs', 'sha256', legacyHex.slice(0, 2)), { recursive: true });
      fs.writeFileSync(path.join(dir, 'blobs', 'sha256', legacyHex.slice(0, 2), legacyHex), 'older upload');
      ok(hasLocalBlob(legacyId, dir), 'a file stored under its full hex name by older Oasis versions counts as well');
      notOk(hasLocalBlob(`&${crypto.randomBytes(32).toString('base64')}.sha256`, dir), 'a blob that is not there is not there');
      const empty = crypto.createHash('sha256').update('empty').digest().toString('hex');
      fs.mkdirSync(path.join(dir, 'blobs', 'sha256', empty.slice(0, 2)), { recursive: true });
      fs.writeFileSync(path.join(dir, 'blobs', 'sha256', empty.slice(0, 2), empty.slice(2)), '');
      notOk(hasLocalBlob(`&${Buffer.from(empty, 'hex').toString('base64')}.sha256`, dir), 'an empty file does not count');
    } finally {
      await new Promise((resolve) => sbot.close(() => resolve()));
      await new Promise((resolve) => setTimeout(resolve, 500));
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
  });
});
