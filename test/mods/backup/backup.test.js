const fs = require('fs');
const os = require('os');
const path = require('path');
const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');
const pull = require('../../../src/server/node_modules/pull-stream');
const ssbKeys = require('../../../src/server/node_modules/ssb-keys');
const validate = require('../../../src/server/node_modules/ssb-validate');

const PASSWORD = 'p'.repeat(32);
const SECRET = '{"curve":"ed25519","public":"aaa.ed25519","private":"bbb.ed25519","id":"@aaa.ed25519"}';
const tmpRoot = path.join(os.tmpdir(), 'oasis-backup-tests');
const realHomedir = os.homedir;
const tmpFile = (name) => { fs.mkdirSync(tmpRoot, { recursive: true }); return path.join(tmpRoot, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`); };

async function withHome(fn) {
  const home = path.join(tmpRoot, 'h-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  fs.mkdirSync(path.join(home, '.ssb'), { recursive: true });
  fs.writeFileSync(path.join(home, '.ssb', 'secret'), SECRET, { mode: 0o600 });
  os.homedir = () => home;
  try { return await fn(home); } finally { os.homedir = realHomedir; fs.rmSync(home, { recursive: true, force: true }); }
}

const addBlob = (peer, text) => new Promise((resolve, reject) => {
  pull(pull.values([Buffer.from(text)]), peer.node.blobs.add((err, ref) => err ? reject(err) : resolve(ref)));
});

const craftFeed = (net, n) => {
  const keys = ssbKeys.generate();
  let state = validate.initial();
  const msgs = [];
  for (let i = 0; i < n; i++) {
    state = validate.appendNew(state, null, keys, { type: 'post', text: `crafted ${i}` }, Date.now() + i);
    const kvt = state.queue[state.queue.length - 1];
    const msg = { key: kvt.key, value: kvt.value, timestamp: kvt.timestamp };
    net.log.push(msg);
    msgs.push(msg);
  }
  return { keys, msgs, state };
};

describe('backup: keys', (t) => {
  t('export encrypts the secret and import restores it, keeping a .bak of the previous one', async () => {
    await withHome(async (home) => {
      const net = makeNetwork(); const A = makePeer(net); A.setActor();
      const out = await A.use('backup').exportKeys({ password: PASSWORD });
      eq(out.filename, 'oasis.enc');
      ok(out.data.slice(0, 6).equals(Buffer.from('OASIS1')));
      ok(!out.data.includes(Buffer.from('bbb.ed25519')), 'the private key is not visible in the file');
      fs.writeFileSync(path.join(home, '.ssb', 'secret'), '{"id":"@other.ed25519"}');
      const enc = path.join(home, 'oasis.enc');
      fs.writeFileSync(enc, out.data);
      await A.use('backup').importKeys({ filePath: enc, password: PASSWORD });
      eq(fs.readFileSync(path.join(home, '.ssb', 'secret'), 'utf8'), SECRET);
      ok(fs.readdirSync(path.join(home, '.ssb')).some(f => f.startsWith('secret.bak-')), 'previous secret kept as .bak');
      let bad = false;
      try { await A.use('backup').importKeys({ filePath: enc, password: 'x'.repeat(32) }); } catch (_) { bad = true; }
      ok(bad, 'wrong password is refused');
      const kit = A.use('backup').recoveryKit();
      eq(kit.id, '@aaa.ed25519'); ok(kit.secret.includes('bbb.ed25519'));
    });
  });
});

describe('backup: full and selective copies', (t) => {
  t('a full backup restores messages and blobs on another device; existing content is skipped', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ref = await addBlob(A, 'hello blob');
    A.node.publish({ type: 'post', text: `with blob ![image:x](${ref})` }, () => {});
    A.node.publish({ type: 'wikiPage', title: 'W', body: 'b' }, () => {});
    A.node.publish({ type: 'chat', title: 'C' }, () => {});
    const est = await A.use('backup').estimate({ scope: 'all' });
    eq(est.messages, 3); eq(est.blobs, 1); ok(est.bytes > 0);
    const only = await A.use('backup').estimate({ modules: ['wiki'] });
    eq(only.messages, 1, 'module filter keeps only wiki messages');
    const noBlobs = await A.use('backup').estimate({ blobs: '0' });
    eq(noBlobs.blobs, 0);
    const outPath = tmpFile('full');
    const res = await A.use('backup').createBackup({ scope: 'all' }, PASSWORD, outPath);
    eq(res.messages, 3); eq(res.blobs, 1); ok(fs.existsSync(outPath));
    ok(!fs.readFileSync(outPath).includes(Buffer.from('hello blob')), 'blob bytes are encrypted');
    ok(A.use('backup').reminderState().lastAt, 'the last backup date is recorded');
    const net2 = makeNetwork(); const B = makePeer(net2); B.setActor();
    const copy = tmpFile('copy');
    fs.copyFileSync(outPath, copy);
    const restored = await B.use('backup').restoreBackup({ filePath: copy, password: PASSWORD });
    eq(restored.messages, 3); eq(restored.blobs, 1); eq(restored.failed, 0);
    eq(net2.log.length, 3, 'the other device now holds the messages');
    ok(Array.from(net2.blobs.values()).some(b => b.toString() === 'hello blob'), 'and the blob');
    fs.copyFileSync(outPath, copy);
    const again = await B.use('backup').restoreBackup({ filePath: copy, password: PASSWORD });
    eq(again.messages, 0); eq(again.skipped, 3); eq(again.blobsSkipped, 1);
    let wrong = false;
    fs.copyFileSync(outPath, copy);
    try { await B.use('backup').restoreBackup({ filePath: copy, password: 'w'.repeat(32) }); } catch (_) { wrong = true; }
    ok(wrong, 'wrong password is refused');
  });

  t('the "only mine" scope and the "since" date narrow the copy', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); A.node.publish({ type: 'post', text: 'old' }, () => {});
    B.setActor(); B.node.publish({ type: 'post', text: 'other' }, () => {});
    A.setActor();
    eq((await A.use('backup').estimate({ scope: 'mine' })).messages, 1);
    eq((await A.use('backup').estimate({ scope: 'all' })).messages, 2);
    eq((await A.use('backup').estimate({ since: new Date(Date.now() + 60000).toISOString() })).messages, 0);
  });
});

describe('backup: verification', (t) => {
  t('a healthy crafted feed passes; a fork and a gap are detected; orphan and missing blobs are counted', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const { keys, msgs, state } = craftFeed(net, 4);
    let report = await A.use('backup').verify({ author: keys.id });
    eq(report.feed.messages, 4); eq(report.feed.ok, true); eq(report.forkCount, 0);
    eq(report.feed.badSignatures.length, 0); eq(report.feed.badHashes.length, 0);
    const forkState = validate.appendNew(validate.initial(), null, keys, { type: 'post', text: 'fork' }, Date.now());
    const forkKvt = forkState.queue[0];
    net.log.push({ key: forkKvt.key, value: { ...forkKvt.value, sequence: 4, previous: msgs[2].key }, timestamp: Date.now() });
    report = await A.use('backup').verify({ author: keys.id });
    eq(report.forkCount, 1); eq(report.forks[0].author, keys.id); eq(report.forks[0].points[0].sequence, 4);
    ok(report.feed.duplicates.includes(4));
    net.log.splice(net.log.indexOf(msgs[1]), 1);
    report = await A.use('backup').verify({ author: keys.id });
    ok(report.feed.gaps.length >= 1, 'a missing sequence is a gap');
    ok(state);
    const orphan = await addBlob(A, 'nobody references me');
    const referenced = await addBlob(A, 'referenced');
    A.node.publish({ type: 'post', text: `see ${referenced} and &${'m'.repeat(43)}=.sha256` }, () => {});
    report = await A.use('backup').verify();
    eq(report.blobs.orphan, 1); ok(report.blobs.orphanIds.includes(orphan));
    eq(report.blobs.missing, 1);
    eq(report.blobs.present, 2);
  });
});
