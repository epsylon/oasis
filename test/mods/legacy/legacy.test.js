const fs = require('fs');
const os = require('os');
const path = require('path');
const { eq, ok, notOk, throwsAsync } = require('../../helpers/assert');

const legacyModel = require('../../../src/models/legacy_model');

const SECRET = '{"curve":"ed25519","public":"aaa.ed25519","private":"bbb.ed25519","id":"@aaa.ed25519"}';
const PASSWORD = 'x'.repeat(32);
const tmpRoot = path.join(os.tmpdir(), 'oasis-legacy-tests');

const realHomedir = os.homedir;

async function withHome(fn, { secret = SECRET, ssb = true } = {}) {
  const home = path.join(tmpRoot, 'h-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  fs.mkdirSync(home, { recursive: true });
  if (ssb) {
    fs.mkdirSync(path.join(home, '.ssb'), { recursive: true });
    if (secret !== null) fs.writeFileSync(path.join(home, '.ssb', 'secret'), secret, { mode: 0o600 });
  }
  os.homedir = () => home;
  try {
    return await fn(home);
  } finally {
    os.homedir = realHomedir;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

const secretPath = (home) => path.join(home, '.ssb', 'secret');
const readSecret = (home) => fs.readFileSync(secretPath(home), 'utf8');
const dropFile = (home, name, data) => {
  const p = path.join(home, name);
  fs.writeFileSync(p, data);
  return p;
};

describe('legacy: export identity', (t) => {
  t('returns the encrypted secret as a downloadable buffer', async () => {
    await withHome(async () => {
      const out = await legacyModel.exportData({ password: PASSWORD });
      eq(out.filename, 'oasis.enc');
      ok(Buffer.isBuffer(out.data), 'data is a Buffer');
      ok(out.data.length > 0, 'data is not empty');
    });
  });

  t('writes nothing to disk', async () => {
    await withHome(async (home) => {
      const before = fs.readdirSync(home).sort().join(',');
      await legacyModel.exportData({ password: PASSWORD });
      eq(fs.readdirSync(home).sort().join(','), before, 'home is unchanged');
      notOk(fs.existsSync(path.join(home, 'oasis.enc')), 'no oasis.enc left behind');
    });
  });

  t('output is opaque: magic header, no plaintext key material', async () => {
    await withHome(async () => {
      const { data } = await legacyModel.exportData({ password: PASSWORD });
      eq(data.slice(0, 6).toString(), 'OASIS1');
      notOk(data.includes(Buffer.from('ed25519')), 'no plaintext leaked');
      notOk(data.includes(Buffer.from('bbb')), 'private key not in the clear');
    });
  });

  t('accepts the password as a string or as an object', async () => {
    await withHome(async (home) => {
      const a = await legacyModel.exportData(PASSWORD);
      const b = await legacyModel.exportData({ password: PASSWORD });
      const fileA = dropFile(home, 'a.enc', a.data);
      const fileB = dropFile(home, 'b.enc', b.data);
      await legacyModel.importData({ filePath: fileA, password: { password: PASSWORD } });
      eq(readSecret(home), SECRET);
      await legacyModel.importData({ filePath: fileB, password: PASSWORD });
      eq(readSecret(home), SECRET);
    });
  });

  t('two exports of the same secret differ but both decrypt', async () => {
    await withHome(async (home) => {
      const a = await legacyModel.exportData({ password: PASSWORD });
      const b = await legacyModel.exportData({ password: PASSWORD });
      notOk(a.data.equals(b.data), 'salt and iv are random per export');
      await legacyModel.importData({ filePath: dropFile(home, 'a.enc', a.data), password: PASSWORD });
      eq(readSecret(home), SECRET);
      await legacyModel.importData({ filePath: dropFile(home, 'b.enc', b.data), password: PASSWORD });
      eq(readSecret(home), SECRET);
    });
  });

  t('fails when there is no identity to export', async () => {
    await withHome(async () => {
      await throwsAsync(() => legacyModel.exportData({ password: PASSWORD }), /secret file doesn't exist/);
    }, { secret: null });
  });
});

describe('legacy: import identity', (t) => {
  t('restores the exact same secret', async () => {
    await withHome(async (home) => {
      const { data } = await legacyModel.exportData({ password: PASSWORD });
      fs.writeFileSync(secretPath(home), 'overwritten');
      await legacyModel.importData({ filePath: dropFile(home, 'up.enc', data), password: PASSWORD });
      eq(readSecret(home), SECRET);
    });
  });

  t('lands on a device with no .ssb yet', async () => {
    let exported;
    await withHome(async () => {
      exported = (await legacyModel.exportData({ password: PASSWORD })).data;
    });
    await withHome(async (home) => {
      notOk(fs.existsSync(path.join(home, '.ssb')), 'fresh device');
      await legacyModel.importData({ filePath: dropFile(home, 'up.enc', exported), password: PASSWORD });
      eq(readSecret(home), SECRET);
    }, { ssb: false });
  });

  t('keeps a backup of the replaced secret', async () => {
    await withHome(async (home) => {
      const { data } = await legacyModel.exportData({ password: PASSWORD });
      fs.writeFileSync(secretPath(home), 'previous identity');
      await legacyModel.importData({ filePath: dropFile(home, 'up.enc', data), password: PASSWORD });
      const backups = fs.readdirSync(path.join(home, '.ssb')).filter((f) => f.startsWith('secret.bak-'));
      eq(backups.length, 1, 'one backup written');
      eq(fs.readFileSync(path.join(home, '.ssb', backups[0]), 'utf8'), 'previous identity');
    });
  });

  t('secret is written with owner-only permissions', async () => {
    await withHome(async (home) => {
      const { data } = await legacyModel.exportData({ password: PASSWORD });
      await legacyModel.importData({ filePath: dropFile(home, 'up.enc', data), password: PASSWORD });
      eq(fs.statSync(secretPath(home)).mode & 0o777, 0o600);
      notOk(fs.existsSync(path.join(home, '.ssb', 'secret.tmp-' + process.pid)), 'no temp file left');
    });
  });

  t('consumes the uploaded file', async () => {
    await withHome(async (home) => {
      const { data } = await legacyModel.exportData({ password: PASSWORD });
      const upload = dropFile(home, 'up.enc', data);
      await legacyModel.importData({ filePath: upload, password: PASSWORD });
      notOk(fs.existsSync(upload), 'upload removed after import');
    });
  });

  t('rejects a wrong password and leaves the secret untouched', async () => {
    await withHome(async (home) => {
      const { data } = await legacyModel.exportData({ password: PASSWORD });
      const upload = dropFile(home, 'up.enc', data);
      await throwsAsync(() => legacyModel.importData({ filePath: upload, password: 'y'.repeat(32) }), /Wrong password or corrupt backup file/);
      eq(readSecret(home), SECRET, 'identity intact');
    });
  });

  t('rejects a tampered backup', async () => {
    await withHome(async (home) => {
      const { data } = await legacyModel.exportData({ password: PASSWORD });
      data[data.length - 1] ^= 0xff;
      await throwsAsync(() => legacyModel.importData({ filePath: dropFile(home, 'up.enc', data), password: PASSWORD }), /Wrong password or corrupt backup file/);
      eq(readSecret(home), SECRET, 'identity intact');
    });
  });

  t('rejects a file that is not an Oasis backup', async () => {
    await withHome(async (home) => {
      const upload = dropFile(home, 'up.enc', Buffer.from('not an oasis backup at all, just some bytes'));
      await throwsAsync(() => legacyModel.importData({ filePath: upload, password: PASSWORD }), /Wrong password or corrupt backup file/);
      eq(readSecret(home), SECRET, 'identity intact');
    });
  });

  t('reports a missing file', async () => {
    await withHome(async (home) => {
      await throwsAsync(() => legacyModel.importData({ filePath: path.join(home, 'nope.enc'), password: PASSWORD }), /Encrypted file not found/);
    });
  });
});

describe('legacy: device migration', (t) => {
  t('identity travels from one device to another', async () => {
    let exported;
    await withHome(async (home) => {
      exported = (await legacyModel.exportData({ password: PASSWORD })).data;
      eq(readSecret(home), SECRET, 'source device keeps its identity');
    });
    await withHome(async (home) => {
      eq(readSecret(home), 'other identity', 'target starts with its own');
      await legacyModel.importData({ filePath: dropFile(home, 'oasis.enc', exported), password: PASSWORD });
      eq(readSecret(home), SECRET, 'target now holds the migrated identity');
    }, { secret: 'other identity' });
  });
});
