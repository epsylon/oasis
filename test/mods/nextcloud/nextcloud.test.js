const fs = require('fs');
const os = require('os');
const path = require('path');
const { eq, ok } = require('../../helpers/assert');
const { startFakeNextcloud } = require('../../helpers/fake_nextcloud');

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-nextcloud-'));
const load = () => {
  const prev = process.env.OASIS_STATE_DIR;
  process.env.OASIS_STATE_DIR = stateDir;
  for (const f of ['../../../src/configs/state-manager', '../../../src/models/nextcloud_model']) delete require.cache[require.resolve(f)];
  const mod = require('../../../src/models/nextcloud_model');
  if (prev === undefined) delete process.env.OASIS_STATE_DIR; else process.env.OASIS_STATE_DIR = prev;
  return mod;
};
const tmpFile = (bytes, seed) => {
  const file = path.join(stateDir, `up-${seed}-${bytes}.bin`);
  const buf = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) buf[i] = (i * 31 + seed) & 0xff;
  fs.writeFileSync(file, buf);
  return { file, buf };
};

describe('nextcloud: an inhabitant connects their own cloud', (t) => {
  t('wrong details are refused, right ones are kept without the password being shown', async () => {
    const cloud = await startFakeNextcloud();
    const model = load()({});
    try {
      let refused = '';
      try { await model.connect({ server: cloud.url, user: cloud.user, password: 'nope' }); } catch (e) { refused = e.message; }
      eq(refused, 'nextcloudErrConnect');
      eq(model.getAccount(), null, 'nothing is kept after a refusal');
      const acc = await model.connect({ server: cloud.url.replace('http://', 'http://'), user: cloud.user, password: cloud.password, folder: ' /Oasis/Shared/ ' });
      eq(acc.user, cloud.user);
      eq(acc.folder, 'Oasis/Shared', 'the folder is cleaned');
      eq(acc.displayName, 'Demo Inhabitant');
      ok(!('password' in acc), 'the app password never leaves the model');
      ok(cloud.log.includes('MKCOL /remote.php/dav/files/demo/Oasis') && cloud.log.includes('MKCOL /remote.php/dav/files/demo/Oasis/Shared'), 'the folder is created on the cloud');
      model.disconnect();
      eq(model.getAccount(), null);
    } finally { await cloud.close(); }
  });
});

describe('nextcloud: uploading a file and getting its public link', (t) => {
  t('a small file goes up in one piece, a big one in chunks, and both come back whole from the public link', async () => {
    const cloud = await startFakeNextcloud();
    const model = load()({});
    const { CHUNK_BYTES } = require('../../../src/models/nextcloud_model');
    try {
      await model.connect({ server: cloud.url, user: cloud.user, password: cloud.password });
      const small = tmpFile(5000, 1);
      const a = await model.upload({ filePath: small.file, size: 5000, name: 'notes: v1?.txt' });
      eq(a.name, 'notes  v1 .txt', 'the name is made safe');
      eq(a.size, 5000);
      ok(a.url.startsWith(`${cloud.url}/s/`), 'a public link comes back');
      ok(cloud.files.get('/remote.php/dav/files/demo/Oasis/notes  v1 .txt').equals(small.buf), 'the bytes arrived whole');
      ok(!cloud.log.some(l => l.includes('/remote.php/dav/uploads/')), 'a small file is not chunked');
      const big = tmpFile(CHUNK_BYTES * 2 + 12345, 2);
      const b = await model.upload({ filePath: big.file, size: big.buf.length, name: 'big.bin' });
      eq(cloud.log.filter(l => l.startsWith('PUT /remote.php/dav/uploads/')).length, 3, 'three chunks');
      ok(cloud.log.some(l => l.startsWith('MOVE /remote.php/dav/uploads/')), 'then assembled on the cloud');
      ok(cloud.files.get('/remote.php/dav/files/demo/Oasis/big.bin').equals(big.buf), 'the big file is whole');
      const fetched = await fetch(b.url);
      eq((await fetched.arrayBuffer()).byteLength, big.buf.length, 'the public link serves it');
      const again = await model.upload({ filePath: small.file, size: 5000, name: 'notes  v1 .txt' });
      ok(again.name !== a.name && again.name.endsWith('.txt'), 'a second file with the same name gets its own name instead of overwriting');
    } finally { await cloud.close(); }
  });
});
