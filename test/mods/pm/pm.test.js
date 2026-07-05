const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('pm: send + list private messages', (t) => {
  t('A sends private message to B', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const r = await A.use('pm').sendMessage([B.keypair.id], 'subject', 'hello B');
    ok(r);
  });

  t('A lists own sent private messages', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    await A.use('pm').sendMessage([B.keypair.id], 's', 'msg');
    const list = await A.use('pm').listAllPrivate();
    ok(Array.isArray(list));
  });

  t('B receives A private message in own list', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    await A.use('pm').sendMessage([B.keypair.id], 'hi', 'secret');
    B.setActor();
    const list = await B.use('pm').listAllPrivate();
    ok(Array.isArray(list));
  });
});

describe('pm: optional Crypter layer', (t) => {
  const cipherModel = require('../../../src/models/cipher_model');
  const find = (list, subject, uid) => list.find(m => m.value?.content?.subject === subject && Array.isArray(m.value?.content?.to) && m.value.content.to.includes(uid));

  t('plain PM (no crypter): B receives the plaintext, no crypter flag', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('pm').sendMessage([B.keypair.id], 'plain', 'hello world');
    B.setActor();
    const msg = find(await B.use('pm').listAllPrivate(), 'plain', B.keypair.id);
    ok(msg, 'B received the message');
    eq(msg.value.content.text, 'hello world', 'plaintext received as-is');
    ok(!msg.value.content.crypter, 'no crypter flag on a plain message');
  });

  t('crypter PM: encrypted in transit, B decrypts with the shared key', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const plaintext = 'top secret message';
    const key = cipherModel.generateKey();
    eq(key.length, 32, 'generated key is exactly 32 hex chars (Crypter minimum)');
    ok(/^[0-9a-f]{32}$/.test(key), 'key is lowercase hex');
    const { encryptedText } = cipherModel.encryptData(plaintext, key);
    eq(encryptedText.length, 88 + 2 * Buffer.byteLength(plaintext, 'utf8'), 'ciphertext length is header(88) + 2*plaintext bytes');
    ok(encryptedText.length <= 4600, 'a short message stays within the Crypter cipher cap');
    await A.use('pm').sendMessage([B.keypair.id], 'secret', encryptedText, true);
    B.setActor();
    const msg = find(await B.use('pm').listAllPrivate(), 'secret', B.keypair.id);
    ok(msg, 'B received the crypter message');
    eq(msg.value.content.crypter, true, 'crypter flag is set');
    ok(msg.value.content.text !== plaintext, 'stored text is the ciphertext, not the plaintext');
    eq(cipherModel.decryptData(msg.value.content.text, key), plaintext, 'B recovers the original plaintext with the shared key');
  });

  t('crypter PM: a wrong key cannot decrypt it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const key = cipherModel.generateKey();
    const { encryptedText } = cipherModel.encryptData('hidden', key);
    await A.use('pm').sendMessage([B.keypair.id], 'secret2', encryptedText, true);
    B.setActor();
    const msg = find(await B.use('pm').listAllPrivate(), 'secret2', B.keypair.id);
    ok(msg, 'B received the message');
    let threw = false;
    try { cipherModel.decryptData(msg.value.content.text, cipherModel.generateKey()); } catch (_) { threw = true; }
    ok(threw, 'a wrong shared key fails to decrypt');
  });
});
