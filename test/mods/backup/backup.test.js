const fs = require('fs');
const os = require('os');
const path = require('path');
const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer, generateKeypair } = require('../../helpers/setup');
const crypto = require('crypto');
const pull = require('../../../src/server/node_modules/pull-stream');
const ssbKeys = require('../../../src/server/node_modules/ssb-keys');
const validate = require('../../../src/server/node_modules/ssb-validate');

const PASSWORD = 'p'.repeat(32);
const SECRET = '{"curve":"ed25519","public":"aaa.ed25519","private":"bbb.ed25519","id":"@aaa.ed25519"}';
const tmpRoot = path.join(os.tmpdir(), 'oasis-backup-tests');
const ssbConfig = require('../../../src/server/ssb_config');
const realSsbPath = ssbConfig.path;
const tmpFile = (name) => { fs.mkdirSync(tmpRoot, { recursive: true }); return path.join(tmpRoot, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`); };

async function withHome(fn) {
  const home = path.join(tmpRoot, 'h-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  fs.mkdirSync(path.join(home, '.ssb'), { recursive: true });
  fs.writeFileSync(path.join(home, '.ssb', 'secret'), SECRET, { mode: 0o600 });
  ssbConfig.path = path.join(home, '.ssb');
  try { return await fn(home); } finally { ssbConfig.path = realSsbPath; fs.rmSync(home, { recursive: true, force: true }); }
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
      const imported = await A.use('backup').importKeys({ filePath: enc, password: PASSWORD });
      eq(imported.id, '@aaa.ed25519', 'the imported identity is reported');
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

  t('an EVERYTHING copy carries blobs that no message references', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const orphan = await addBlob(A, 'nobody references me');
    A.node.publish({ type: 'post', text: 'no attachments here' }, () => {});
    const est = await A.use('backup').estimate({ scope: 'all' });
    eq(est.blobsReferenced, 1, 'the orphan blob is selected even with no message pointing at it');
    const outPath = tmpFile('orphan');
    const res = await A.use('backup').createBackup({ scope: 'all' }, PASSWORD, outPath);
    eq(res.blobs, 1);
    const net2 = makeNetwork(); const B = makePeer(net2); B.setActor();
    const restored = await B.use('backup').restoreBackup({ filePath: outPath, password: PASSWORD });
    eq(restored.blobs, 1);
    ok(net2.blobs.has(orphan), 'the orphan blob reaches the other device');
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

describe('backup: public snapshots', (t) => {
  t('a snapshot carries only public messages, most recently active feeds first, and restores on a fresh node', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    A.node.publish({ type: 'post', text: 'public one' }, () => {});
    A.node.publish({ type: 'wikiPage', title: 'W', body: 'b' }, () => {});
    A.node.publish('aGVsbG8=.box', () => {});
    const outPath = tmpFile('snap');
    const res = await A.use('backup').createSnapshot(outPath);
    eq(res.messages, 3, 'every message of the feed travels, the chain stays whole');
    eq(res.feeds, 1);
    const stale = await A.use('backup').createSnapshot(tmpFile('stale'), { sinceMs: 1000, now: Date.now() + 60 * 60 * 1000 });
    eq(stale.messages, 0, 'the recent tier leaves out feeds without activity in the window');
    const fresh = await A.use('backup').createSnapshot(tmpFile('fresh'), { sinceMs: 60 * 60 * 1000 });
    eq(fresh.messages, 3, 'and keeps whole feeds that were active');
    ok(fs.existsSync(outPath) && res.bytes > 0);
    ok(A.use('backup').isSnapshotFile(outPath), 'recognised as a snapshot');
    notOk(A.use('backup').isSnapshotFile(__filename), 'an arbitrary file is not');
    const net2 = makeNetwork(); const B = makePeer(net2); B.setActor();
    const copy = tmpFile('snapcopy');
    fs.copyFileSync(outPath, copy);
    const restored = await B.use('backup').restoreBackup({ filePath: copy, password: '' });
    eq(restored.messages, 3); eq(restored.failed, 0);
    eq(restored.meta && restored.meta.kind, 'snapshot'); eq(restored.meta.boxed, 1, 'the private one is counted as a box');
    eq(net2.log.length, 3, 'the fresh node now holds the whole log');
    ok(net2.log.some(m => typeof m.value.content === 'string'), 'and the private message arrived as ciphertext, not decrypted');
    fs.copyFileSync(outPath, copy);
    const again = await B.use('backup').restoreBackup({ filePath: copy, password: '' });
    eq(again.messages, 0); eq(again.skipped, 3, 'a second pass changes nothing');
  });

  t('the pub hands its snapshot only to feeds it follows, over the SSB connection', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    A.node.publish({ type: 'post', text: 'p' }, () => {});
    const home = tmpFile('pubhome');
    fs.mkdirSync(path.join(home, 'oasis', 'content'), { recursive: true });
    const snapPath = path.join(home, 'oasis', 'content', 'snapshot.oasissn');
    await A.use('backup').createSnapshot(snapPath);
    const plugin = require('../../../src/server/snapshot_plugin');
    const server = { id: '@pub.ed25519', friends: { isFollowing: ({ dest }, cb) => cb(null, dest === '@member.ed25519') } };
    const config = { path: home };
    const api = plugin.init(server, config);
    eq(plugin.permissions.anonymous.allow.sort().join(','), 'get,info', 'reachable by any authenticated peer, the method itself decides');
    const collect = (src) => new Promise((resolve) => pull(src, pull.collect((err, arr) => resolve({ err, data: Buffer.concat((arr || []).map(c => Buffer.isBuffer(c) ? c : Buffer.from(c))) }))));
    const member = await collect(api.get.call({ id: '@member.ed25519' }, { tier: 'full' }));
    ok(!member.err && member.data.equals(fs.readFileSync(snapPath)), 'a followed inhabitant gets the exact file');
    const info = await new Promise((resolve) => api.info.call({ id: '@member.ed25519' }, { tier: 'full' }, (err, i) => resolve(err ? null : i)));
    eq(info && info.bytes, fs.statSync(snapPath).size);
    const noRecent = await collect(api.get.call({ id: '@member.ed25519' }, { tier: 'recent' }));
    ok(noRecent.err && /not available/.test(noRecent.err.message), 'a tier that was not built is reported as unavailable');
    const stranger = await collect(api.get.call({ id: '@stranger.ed25519' }, { tier: 'full' }));
    ok(stranger.err && /not allowed/.test(stranger.err.message), 'a feed the pub does not follow is refused');
    const anon = await collect(api.get.call({}));
    ok(anon.err, 'no identity, nothing');
    const client = plugin.init(server, { path: tmpFile('nosnap') });
    const fromClient = await collect(client.get.call({ id: '@member.ed25519' }, { tier: 'full' }));
    ok(fromClient.err && /not available/.test(fromClient.err.message), 'a node that never built one has nothing to serve');
  });

  t('a newcomer downloads the snapshot through the pub connection and restores it in the background', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    A.node.publish({ type: 'post', text: 'one' }, () => {});
    A.node.publish({ type: 'post', text: 'two' }, () => {});
    const snapPath = tmpFile('pubsnap');
    await A.use('backup').createSnapshot(snapPath);
    const bytes = fs.readFileSync(snapPath);
    const chunks = [bytes.slice(0, 100), bytes.slice(100)];
    const asked = [];
    const rpcFor = (ok) => ({
      snapshot: {
        info: (opts, cb) => { asked.push(opts.tier); if (!ok) return cb(new Error('not allowed')); if (opts.tier === 'recent') return cb(new Error('not available')); cb(null, { bytes: bytes.length, createdAt: new Date().toISOString() }); },
        get: (opts) => ok && opts.tier === 'full' ? pull.values(chunks) : pull.error(new Error('not available'))
      }
    });
    const net2 = makeNetwork(); const B = makePeer(net2); B.setActor();
    const seen = [];
    const connect = (addr, cb) => { seen.push(addr); cb(null, rpcFor(true)); };
    const job = B.use('backup').startBootstrap({ address: 'net:pub.example:8008~shs:abc', connect });
    ok(job.running && job.source === 'snapshot', 'the job is visible while it runs');
    ok(B.use('backup').restoreStatus().running, 'and reported like any other restore');
    const res = await job.promise;
    eq(seen[0], 'net:pub.example:8008~shs:abc', 'it dialled the pub');
    eq(asked.join(','), 'recent,full', 'the recent tier is tried first, then the full one');
    eq(res.messages, 2); eq(res.failed, 0);
    eq(job.tiers.length, 1); eq(job.tiers[0].tier, 'full', 'a missing recent tier is skipped, not fatal');
    eq(net2.log.length, 2, 'the newcomer holds the pub\'s public log');
    notOk(job.running); eq(job.error, null);
    const refused = B.use('backup').startBootstrap({ address: 'net:pub.example:8008~shs:abc', connect: (addr, cb) => cb(null, rpcFor(false)) });
    await refused.promise;
    ok(refused.error, 'when the pub refuses, the job ends with an error and nothing else changes');
    eq(net2.log.length, 2);
  });

  t('a message that replication stored meanwhile counts as already present, not as a failure', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    A.node.publish({ type: 'post', text: 'x' }, () => {});
    const snapPath = tmpFile('race');
    await A.use('backup').createSnapshot(snapPath);
    const net2 = makeNetwork(); const B = makePeer(net2); B.setActor();
    const copy = tmpFile('racecopy');
    fs.copyFileSync(snapPath, copy);
    const origAdd = B.node.add.bind(B.node);
    B.node.add = (value, cb) => origAdd(value, (err) => { if (err) return cb(err); origAdd(value, () => cb(new Error('already added'))); });
    const restored = await B.use('backup').restoreBackup({ filePath: copy, password: '' });
    eq(restored.failed, 0); eq(restored.skipped, 1); eq(net2.log.length, 1);
  });
});

describe('backup: restore robustness', (t) => {
  t('a large blob survives the streamed restore intact', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const big = crypto.randomBytes(3 * 1024 * 1024 + 123);
    const ref = await new Promise((resolve, reject) => pull(pull.values([big]), A.node.blobs.add((err, r) => err ? reject(err) : resolve(r))));
    A.node.publish({ type: 'post', text: `big ![image:x](${ref})` }, () => {});
    const outPath = tmpFile('big');
    await A.use('backup').createBackup({ scope: 'mine' }, PASSWORD, outPath);
    const net2 = makeNetwork(); const B = makePeer(net2); B.setActor();
    const restored = await B.use('backup').restoreBackup({ filePath: outPath, password: PASSWORD });
    eq(restored.messages, 1); eq(restored.blobs, 1); eq(restored.failed, 0);
    ok(net2.blobs.get(ref) && net2.blobs.get(ref).equals(big), 'blob bytes are identical after restore');
  });

  t('messages stored out of order are restored in sequence order; unreachable ones are reported with a reason', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const { msgs } = craftFeed(net, 3);
    net.log.splice(net.log.indexOf(msgs[0]), 1); net.log.splice(net.log.indexOf(msgs[1]), 1);
    net.log.push(msgs[1], msgs[0]);
    const outPath = tmpFile('ooo');
    await A.use('backup').createBackup({ scope: 'all' }, PASSWORD, outPath);
    const net2 = makeNetwork(); const B = makePeer(net2); B.setActor();
    const restored = await B.use('backup').restoreBackup({ filePath: outPath, password: PASSWORD });
    eq(restored.messages, 3); eq(restored.failed, 0);
    eq(net2.log.map(m => m.value.sequence).join(','), '1,2,3');
    const net3 = makeNetwork(); const C = makePeer(net3); C.setActor();
    craftFeed(net3, 0);
    const gap = craftFeed(net3, 4);
    net3.log.splice(net3.log.indexOf(gap.msgs[1]), 1);
    const gapPath = tmpFile('gap');
    await C.use('backup').createBackup({ scope: 'all' }, PASSWORD, gapPath);
    const net4 = makeNetwork(); const D = makePeer(net4); D.setActor();
    const partial = await D.use('backup').restoreBackup({ filePath: gapPath, password: PASSWORD });
    eq(partial.messages, 1); eq(partial.failed, 2);
    ok(partial.errors.length >= 1 && partial.errors[0].count === 2, 'the failure reason is reported with its count');
  });

  t('a feed that diverged on the target device is reported as a fork, not as already present', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const kp = generateKeypair();
    const B = makePeer(net, kp); B.setActor();
    B.node.publish({ type: 'post', text: 'from the backup' }, () => {});
    A.setActor();
    const outPath = tmpFile('fork');
    await A.use('backup').createBackup({ scope: 'all' }, PASSWORD, outPath);
    const net2 = makeNetwork(); const B2 = makePeer(net2, kp); B2.setActor();
    B2.node.publish({ type: 'post', text: 'published on the new device' }, () => {});
    const restored = await B2.use('backup').restoreBackup({ filePath: outPath, password: PASSWORD });
    eq(restored.messages, 0); eq(restored.skipped, 0); eq(restored.forked, 1);
    eq(restored.forks.length, 1); eq(restored.forks[0].author, kp.id); eq(restored.forks[0].mine, true);
  });

  t('a restore runs in the background and exposes its progress until it finishes', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    A.node.publish({ type: 'post', text: 'a' }, () => {});
    A.node.publish({ type: 'post', text: 'b' }, () => {});
    const outPath = tmpFile('job');
    await A.use('backup').createBackup({ scope: 'all' }, PASSWORD, outPath);
    const net2 = makeNetwork(); const B = makePeer(net2); B.setActor();
    const model = B.use('backup');
    eq(model.restoreStatus(), null);
    const job = model.startRestore({ filePath: outPath, password: PASSWORD });
    ok(job.running); ok(model.restoreStatus().running);
    eq(model.startRestore({ filePath: outPath, password: PASSWORD }), job, 'only one restore runs at a time');
    await job.promise;
    const status = model.restoreStatus();
    notOk(status.running); ok(status.finishedAt); eq(status.error, null);
    eq(status.result.messages, 2); eq(status.progress.messages, 2);
    notOk(fs.existsSync(outPath), 'the uploaded file is removed afterwards');
    fs.writeFileSync(outPath, 'garbage');
    const bad = model.startRestore({ filePath: outPath, password: PASSWORD });
    await bad.promise;
    ok(model.restoreStatus().error, 'a corrupt file ends the job with an error instead of hanging');
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
