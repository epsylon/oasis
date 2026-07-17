const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');
const fsc = require('../../../src/backend/fileshare_crypto');

describe('fileshare: crypto core', (t) => {
  t('chunk encrypt/decrypt round-trip', () => {
    const key = fsc.generateFileKey();
    const plain = Buffer.from('a secret payload of bytes ñé✓');
    const payload = fsc.encryptChunk(plain, key);
    ok(!payload.equals(plain), 'ciphertext differs from plaintext');
    ok(fsc.decryptChunk(payload, key).equals(plain), 'decrypts back to the original bytes');
  });

  t('wrong key fails to decrypt', () => {
    const key = fsc.generateFileKey();
    const payload = fsc.encryptChunk(Buffer.from('data'), key);
    let threw = false;
    try { fsc.decryptChunk(payload, fsc.generateFileKey()); } catch (_) { threw = true; }
    ok(threw, 'a different key throws (GCM auth)');
  });

  t('corrupted chunk fails to decrypt', () => {
    const key = fsc.generateFileKey();
    const payload = fsc.encryptChunk(Buffer.from('data to protect'), key);
    payload[payload.length - 1] ^= 0xff;
    let threw = false;
    try { fsc.decryptChunk(payload, key); } catch (_) { threw = true; }
    ok(threw, 'a flipped byte throws (GCM auth)');
  });

  t('manifest encrypt/decrypt round-trip', () => {
    const key = fsc.generateFileKey();
    const m = fsc.buildManifest({ filename: 'a.pdf', mime: 'application/pdf', size: 10, chunkSize: 5, chunkHashes: ['&h1', '&h2'], plainSha256: 'abc' });
    const dec = fsc.decryptManifest(fsc.encryptManifest(m, key), key);
    eq(dec.filename, 'a.pdf');
    eq(dec.chunks.length, 2);
    eq(dec.mime, 'application/pdf');
  });

  t('splitBuffer produces correct chunk boundaries', () => {
    const buf = Buffer.alloc(11, 7);
    const parts = fsc.splitBuffer(buf, 4);
    eq(parts.length, 3, '11 bytes / 4 = 3 chunks');
    eq(Buffer.concat(parts).length, 11, 'reassembled length matches');
  });
});

describe('fileshare: A shares an encrypted file, B reassembles', (t) => {
  const bytes = (n, seed = 3) => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + seed) & 0xff; return b; };

  t('single-chunk round-trip A -> B', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const original = Buffer.from('hello file over P2P ñ');
    const pointer = await A.use('fileshare').createShareFromBuffer({ buffer: original, filename: 'note.txt', mime: 'text/plain' });
    ok(pointer.manifestBlobId && pointer.key, 'pointer has manifest id and key');
    eq(pointer.size, original.length);

    B.setActor();
    const got = await B.use('fileshare').reassembleToBuffer(pointer);
    ok(got.equals(original), 'B reassembles the exact original bytes');
  });

  t('multi-chunk large-ish file round-trip', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const original = bytes(1024 * 1024 + 123);
    const pointer = await A.use('fileshare').createShareFromBuffer({ buffer: original, filename: 'blob.bin', mime: 'application/octet-stream', chunkSize: 64 * 1024 });
    ok(pointer.chunkCount > 1, 'file was split into multiple chunks');

    B.setActor();
    const manifest = await B.use('fileshare').openManifest(pointer);
    eq(manifest.chunks.length, pointer.chunkCount, 'manifest lists every chunk');
    const got = await B.use('fileshare').reassembleToBuffer(pointer);
    ok(got.equals(original), 'B reassembles the exact original bytes across chunks');
  });

  t('wrong key cannot decrypt the share', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const pointer = await A.use('fileshare').createShareFromBuffer({ buffer: Buffer.from('classified'), filename: 's.txt', mime: 'text/plain' });
    B.setActor();
    const tampered = { ...pointer, key: fsc.keyToHex(fsc.generateFileKey()) };
    let threw = false;
    try { await B.use('fileshare').reassembleToBuffer(tampered); } catch (_) { threw = true; }
    ok(threw, 'a wrong key throws instead of yielding plaintext');
  });

  t('availability check and local cleanup', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const pointer = await A.use('fileshare').createShareFromBuffer({ buffer: bytes(200000), filename: 'x.bin', mime: 'application/octet-stream', chunkSize: 50000 });
    B.setActor();
    eq(await B.use('fileshare').isAvailable(pointer), true, 'available before cleanup');
    const removed = await B.use('fileshare').removeLocalBlobs(pointer);
    ok(removed >= pointer.chunkCount, 'cleanup removes chunk blobs and manifest');
    eq(await B.use('fileshare').isAvailable(pointer), false, 'no longer available after cleanup');
  });
});

describe('fileshare: end-to-end over PM (A -> B inbox)', (t) => {
  t('A shares a file via PM, B finds it in inbox and reassembles', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const original = Buffer.from('the sold story: chapter 1 ...ñ');
    const pointer = await A.use('fileshare').createShareFromBuffer({ buffer: original, filename: 'relato.txt', mime: 'text/plain' });
    await A.use('pm').sendFileShare([B.keypair.id], 'Your purchase', pointer);

    B.setActor();
    const inbox = await B.use('pm').listAllPrivate();
    const msg = inbox.find(m => m.value && m.value.content && m.value.content.fileShare && m.value.content.fileShare.filename === 'relato.txt');
    ok(msg, 'B receives the file-share PM in the inbox');
    const got = await B.use('fileshare').reassembleToBuffer(msg.value.content.fileShare);
    ok(got.equals(original), 'B reassembles the exact file from the PM pointer');
  });

  t('crypter layer: the shared key is required to unwrap the file key', async () => {
    const cipher = require('../../../src/models/cipher_model');
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const original = Buffer.from('double-encrypted payload bytes');
    let pointer = await A.use('fileshare').createShareFromBuffer({ buffer: original, filename: 'secret.bin', mime: 'application/octet-stream' });
    const shared = cipher.generateKey();
    const { encryptedText } = cipher.encryptData(pointer.key, shared);
    pointer = { ...pointer, key: encryptedText, crypter: true };
    await A.use('pm').sendFileShare([B.keypair.id], 'Secret', pointer, true);

    B.setActor();
    const inbox = await B.use('pm').listAllPrivate();
    const fsp = (inbox.find(m => m.value && m.value.content && m.value.content.fileShare) || {}).value.content.fileShare;
    ok(fsp && fsp.crypter, 'received with the crypter flag set');
    let threw = false;
    try {
      const bad = cipher.decryptData(fsp.key, cipher.generateKey());
      await B.use('fileshare').reassembleToBuffer({ ...fsp, key: bad });
    } catch (_) { threw = true; }
    ok(threw, 'a wrong shared key cannot unwrap/reassemble');
    const realKey = cipher.decryptData(fsp.key, shared);
    const got = await B.use('fileshare').reassembleToBuffer({ ...fsp, key: realKey });
    ok(got.equals(original), 'the correct shared key reassembles the file');
  });
});

describe('fileshare: TTL cleanup on the host (sender)', (t) => {
  t('expired sent shares are pruned, fresh ones are kept', async () => {
    const net = makeNetwork(); const A = makePeer(net);
    A.setActor();
    const oldPtr = await A.use('fileshare').createShareFromBuffer({ buffer: Buffer.from('old file'), filename: 'old.txt', mime: 'text/plain' });
    const freshPtr = await A.use('fileshare').createShareFromBuffer({ buffer: Buffer.from('fresh file'), filename: 'fresh.txt', mime: 'text/plain' });
    const now = 1000000000000;
    const ttl = 30 * 24 * 60 * 60 * 1000;
    const sent = [
      { pointer: oldPtr, sentAt: new Date(now - ttl - 1000).toISOString() },
      { pointer: freshPtr, sentAt: new Date(now - 1000).toISOString() }
    ];
    const pruned = await A.use('fileshare').pruneExpired(sent, ttl, now);
    eq(pruned, 1, 'exactly one (the expired) share was pruned');
    eq(await A.use('fileshare').isAvailable(oldPtr), false, 'expired share removed');
    eq(await A.use('fileshare').isAvailable(freshPtr), true, 'fresh share still hosted');
  });
});

describe('fileshare: availability pre-check (privacy-safe download guard)', (t) => {
  t('ensureAvailable true when blobs are present, false when the manifest is missing', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const pointer = await A.use('fileshare').createShareFromBuffer({ buffer: Buffer.from('payload'), filename: 'x.txt', mime: 'text/plain' });
    B.setActor();
    eq(await B.use('fileshare').ensureAvailable(pointer), true, 'available when present');
    const bogus = { ...pointer, manifestBlobId: '&' + 'A'.repeat(43) + '=.sha256' };
    eq(await B.use('fileshare').ensureAvailable(bogus), false, 'not available when the manifest cannot be fetched');
  });

  t('ensureAvailable false after the blobs were pruned', async () => {
    const net = makeNetwork(); const A = makePeer(net);
    A.setActor();
    const pointer = await A.use('fileshare').createShareFromBuffer({ buffer: Buffer.from('gone soon'), filename: 'g.txt', mime: 'text/plain' });
    eq(await A.use('fileshare').ensureAvailable(pointer), true, 'available before prune');
    await A.use('fileshare').removeLocalBlobs(pointer);
    eq(await A.use('fileshare').ensureAvailable(pointer), false, 'unavailable after prune');
  });
});

describe('fileshare: mutual-support policy for sends', (t) => {
  const pmPolicy = require('../../../src/backend/pm_policy');

  t('open instance (pmVisibility not mutuals) allows any recipient', () => {
    ok(pmPolicy.isRecipientAllowed({ pmVisibility: 'whole', viewerId: '@a', recipientId: '@b', relationship: null }), 'stranger allowed when open');
    ok(pmPolicy.isRecipientAllowed({ pmVisibility: undefined, viewerId: '@a', recipientId: '@b', relationship: { following: false, followsMe: false } }), 'no policy set => open');
  });

  t('mutuals-only allows a mutual and self, blocks non-mutuals', () => {
    const cfg = 'mutuals';
    ok(pmPolicy.isRecipientAllowed({ pmVisibility: cfg, viewerId: '@a', recipientId: '@b', relationship: { following: true, followsMe: true } }), 'mutual allowed');
    ok(pmPolicy.isRecipientAllowed({ pmVisibility: cfg, viewerId: '@a', recipientId: '@a', relationship: null }), 'sending to self always allowed');
    eq(pmPolicy.isRecipientAllowed({ pmVisibility: cfg, viewerId: '@a', recipientId: '@b', relationship: { following: true, followsMe: false } }), false, 'following-only is not mutual');
    eq(pmPolicy.isRecipientAllowed({ pmVisibility: cfg, viewerId: '@a', recipientId: '@b', relationship: { following: false, followsMe: true } }), false, 'followed-only is not mutual');
    eq(pmPolicy.isRecipientAllowed({ pmVisibility: cfg, viewerId: '@a', recipientId: '@b', relationship: null }), false, 'no relationship is not mutual');
  });

  t('under mutuals-only, a mutual send goes through and arrives; a non-mutual is blocked at the gate', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const original = Buffer.from('gated relato');
    const pointer = await A.use('fileshare').createShareFromBuffer({ buffer: original, filename: 'g.txt', mime: 'text/plain' });
    const viewer = A.keypair.id, recipient = B.keypair.id;

    eq(pmPolicy.isRecipientAllowed({ pmVisibility: 'mutuals', viewerId: viewer, recipientId: recipient, relationship: { following: true, followsMe: false } }), false, 'gate blocks the non-mutual (route would redirect, no send)');

    ok(pmPolicy.isRecipientAllowed({ pmVisibility: 'mutuals', viewerId: viewer, recipientId: recipient, relationship: { following: true, followsMe: true } }), 'gate allows the mutual');
    await A.use('pm').sendFileShare([recipient], 'Gated', pointer);
    B.setActor();
    const inbox = await B.use('pm').listAllPrivate();
    const fsp = (inbox.find(m => m.value && m.value.content && m.value.content.fileShare) || {}).value.content.fileShare;
    ok(fsp, 'the mutual send arrives in B inbox');
    const got = await B.use('fileshare').reassembleToBuffer(fsp);
    ok(got.equals(original), 'B reassembles the gated file');
  });
});
