const fs = require('fs');
const os = require('os');
const path = require('path');
const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');
const pull = require('../../../src/server/node_modules/pull-stream');

const addBlob = (peer, bytes) => new Promise((resolve, reject) => {
  pull(pull.values([require('crypto').randomBytes(bytes)]), peer.node.blobs.add((err, ref) => err ? reject(err) : resolve(ref)));
});
const has = (peer, ref) => new Promise((resolve) => peer.node.blobs.has(ref, (e, h) => resolve(!e && !!h)));
const publish = (peer, content) => new Promise((res, rej) => peer.node.publish(content, (e, m) => e ? rej(e) : res(m)));

describe('blob cache: a quota on downloaded media', (t) => {
  t('the quota comes from the settings, with a separate value for pubs where 0 means unlimited', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const cache = A.use('blobcache');
    const cfg = { blobCache: { maxMB: 2048, pubMaxMB: 0 } };
    eq(cache.maxBytesFor(cfg), 2048 * 1024 * 1024);
    eq(cache.maxBytesFor(cfg, { isPublic: true }), 0, 'a pub is unlimited by default');
    eq(cache.maxBytesFor({ blobCache: { maxMB: 512, pubMaxMB: 20480 } }, { isPublic: true }), 20480 * 1024 * 1024);
    eq(cache.maxBytesFor({}), 0);
  });

  t('nothing is removed while the cache fits in the quota', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const cache = A.use('blobcache');
    const a = await addBlob(A, 1000); const b = await addBlob(A, 1000);
    const res = await cache.collect({ maxBytes: 5000, now: Date.now() + 2 * 86400000 });
    eq(res.deleted, 0);
    ok(await has(A, a) && await has(A, b));
    const u = await cache.usage();
    eq(u.count, 2); eq(u.bytes, 2000);
  });

  t('over the quota, the least recently used blobs go first and my own files never do', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const cache = A.use('blobcache');
    const mine = await addBlob(A, 1000);
    await publish(A, { type: 'image', url: mine, title: 'mine' });
    const old = await addBlob(A, 1000);
    const recent = await addBlob(A, 1000);
    const later = Date.now() + 2 * 86400000;
    cache.touch(recent);
    const res = await cache.collect({ maxBytes: 2500, now: later + 60 * 60 * 1000, protectMs: 0 });
    eq(res.deleted, 1, 'only what is needed to get under the quota is removed');
    notOk(await has(A, old), 'the blob nobody opened is gone');
    ok(await has(A, recent), 'the one opened recently stays');
    ok(await has(A, mine), 'my own published file stays');
    eq(res.after, 2000);
  });

  t('a file sent in a private message is kept like my own files', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const cache = A.use('blobcache');
    const attached = await addBlob(A, 1000);
    await publish(A, { type: 'post', text: `[photo](${attached})`, recps: [A.keypair.id, B.keypair.id] });
    const other = await addBlob(A, 1000);
    const res = await cache.collect({ maxBytes: 1500, now: Date.now() + 3 * 86400000, protectMs: 0 });
    ok(await has(A, attached), 'the private attachment stays');
    notOk(await has(A, other), 'an unrelated cached blob is the one removed');
    eq(res.deleted, 1);
  });

  t('blobs added in the last day are protected even when the cache is over the quota', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const cache = A.use('blobcache');
    const fresh = await addBlob(A, 3000);
    const res = await cache.collect({ maxBytes: 1000 });
    eq(res.deleted, 0);
    ok(await has(A, fresh));
  });

  t('a quota of zero means unlimited and never deletes', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const cache = A.use('blobcache');
    const a = await addBlob(A, 4000);
    eq(cache.maxBytesFor({ blobCache: { maxMB: 0 } }), 0);
    eq(cache.maxBytesFor({ blobCache: { maxMB: 2 } }), 2 * 1024 * 1024);
    const res = await cache.collect({ maxBytes: cache.maxBytesFor({ blobCache: { maxMB: 0 } }), now: Date.now() + 3 * 86400000 });
    eq(res.deleted, 0);
    ok(await has(A, a));
  });

  t('touching an id in any encoding records the same blob', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const cache = A.use('blobcache');
    const a = await addBlob(A, 10); const b = await addBlob(A, 10);
    cache.touch(encodeURIComponent(a));
    cache.touch(b.slice(1));
    cache.touch('not a blob');
    const res = await cache.collect({ maxBytes: 15, now: Date.now() + 3 * 86400000, protectMs: 0 });
    eq(res.deleted, 1, 'both were touched, so the quota only forces one out');
  });
});
