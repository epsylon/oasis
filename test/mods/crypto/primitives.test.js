const fs = require('fs');
const os = require('os');
const path = require('path');
const { eq, ok, notOk, deepEq } = require('../../helpers/assert');

const tmpRoot = path.join(os.tmpdir(), 'oasis-crypto-tests');
const fresh = () => {
  const dir = path.join(tmpRoot, 'd-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const tribeCryptoFactory = require('../../../src/models/crypto');

describe('crypto: keyring', (t) => {
  t('generateTribeKey returns 64 hex chars (32 bytes)', () => {
    const tc = tribeCryptoFactory(fresh());
    const k = tc.generateTribeKey();
    eq(k.length, 64);
    ok(/^[0-9a-f]+$/.test(k));
  });

  t('setKey persists and getKey reads back', () => {
    const dir = fresh();
    const tc = tribeCryptoFactory(dir);
    tc.setKey('%test.sha256', 'a'.repeat(64), 1);
    eq(tc.getKey('%test.sha256'), 'a'.repeat(64));
    eq(tc.getGen('%test.sha256'), 1);
  });

  t('addNewKey for multi-gen', () => {
    const tc = tribeCryptoFactory(fresh());
    tc.setKey('%x.sha256', 'k1', 1);
    eq(tc.addNewKey('%x.sha256', 'k2'), 2);
    deepEq(tc.getKeys('%x.sha256'), ['k2', 'k1']);
  });

  t('mergeKeys deduplicates', () => {
    const tc = tribeCryptoFactory(fresh());
    tc.setKey('%x.sha256', 'a', 1);
    tc.mergeKeys('%x.sha256', ['a', 'b', 'c'], 3);
    deepEq(tc.getKeys('%x.sha256'), ['a', 'b', 'c']);
  });

  t('keyring file is mode 0600', () => {
    const dir = fresh();
    const tc = tribeCryptoFactory(dir);
    tc.setKey('%x.sha256', 'k', 1);
    const stat = fs.statSync(path.join(dir, 'keys', 'tribes-keys.json'));
    eq(stat.mode & 0o777, 0o600);
  });

  t('namespaces produce separate keyring files', () => {
    const dir = fresh();
    const tribes = tribeCryptoFactory(dir, 'tribes');
    const chats = tribeCryptoFactory(dir, 'chats');
    tribes.setKey('%t1.sha256', 'a'.repeat(64), 1);
    chats.setKey('%c1.sha256', 'b'.repeat(64), 1);
    ok(fs.existsSync(path.join(dir, 'keys', 'tribes-keys.json')));
    ok(fs.existsSync(path.join(dir, 'keys', 'chats-keys.json')));
    eq(tribes.getKey('%t1.sha256'), 'a'.repeat(64));
    eq(chats.getKey('%c1.sha256'), 'b'.repeat(64));
    eq(tribes.getKey('%c1.sha256'), null, 'tribes keyring does not see chats keys');
    eq(chats.getKey('%t1.sha256'), null, 'chats keyring does not see tribes keys');
  });

  t('legacy ~/.ssb/tribe-keys.json auto-migrates to keys/tribes-keys.json', () => {
    const dir = fresh();
    const legacyPath = path.join(dir, 'tribe-keys.json');
    fs.writeFileSync(legacyPath, JSON.stringify({ '%legacy.sha256': { keys: ['ff'.repeat(32)], gen: 1 } }), { mode: 0o600 });
    const tc = tribeCryptoFactory(dir, 'tribes');
    notOk(fs.existsSync(legacyPath), 'legacy file removed');
    ok(fs.existsSync(path.join(dir, 'keys', 'tribes-keys.json')), 'new file present');
    eq(tc.getKey('%legacy.sha256'), 'ff'.repeat(32), 'data preserved');
  });

  t('per-module keyrings: tribes, chats, pads, maps, calendars produce 5 files', () => {
    const dir = fresh();
    for (const ns of ['tribes', 'chats', 'pads', 'maps', 'calendars']) {
      const inst = tribeCryptoFactory(dir, ns);
      inst.setKey(`%${ns}.sha256`, ns.charAt(0).repeat(64), 1);
    }
    for (const ns of ['tribes', 'chats', 'pads', 'maps', 'calendars']) {
      ok(fs.existsSync(path.join(dir, 'keys', `${ns}-keys.json`)), `${ns}-keys.json exists`);
    }
  });
});

describe('crypto: fingerprint', (t) => {
  t('deterministic, 32 hex', () => {
    const tc = tribeCryptoFactory(fresh());
    const k = '1234567890abcdef'.repeat(4);
    const fp = tc.fingerprint(k);
    eq(fp.length, 32);
    eq(tc.fingerprint(k), fp);
  });

  t('different keys produce different fingerprints', () => {
    const tc = tribeCryptoFactory(fresh());
    notOk(tc.fingerprint(tc.generateTribeKey()) === tc.fingerprint(tc.generateTribeKey()));
  });

  t('buildFingerprintIndex maps fp to all keys (multi-gen)', () => {
    const tc = tribeCryptoFactory(fresh());
    tc.setKey('%a.sha256', 'a'.repeat(64), 1);
    tc.addNewKey('%a.sha256', 'b'.repeat(64));
    const idx = tc.buildFingerprintIndex();
    eq(idx.size, 2);
    const fpA = tc.fingerprint('a'.repeat(64));
    const fpB = tc.fingerprint('b'.repeat(64));
    eq(idx.get(fpA).rootId, '%a.sha256');
    eq(idx.get(fpB).isCurrent, true);
    eq(idx.get(fpA).isCurrent, false);
  });
});

describe('crypto: wrap/unwrap', (t) => {
  t('roundtrip preserves body', () => {
    const tc = tribeCryptoFactory(fresh());
    const k = tc.generateTribeKey();
    tc.setKey('%root.sha256', k, 1);
    const body = { k: 'tribe', op: 'create', title: 'x' };
    const env = tc.wrapMsg(body, k);
    eq(env.type, 'tribe-msg');
    eq(env.v, 1);
    eq(env.fp, tc.fingerprint(k));
    const r = tc.unwrapMsg(env, tc.buildFingerprintIndex());
    deepEq(r.body, body);
    eq(r.rootId, '%root.sha256');
  });

  t('unwrap with empty fpIdx returns null', () => {
    const tc = tribeCryptoFactory(fresh());
    const env = tc.wrapMsg({ k: 'tribe' }, tc.generateTribeKey());
    eq(tc.unwrapMsg(env, new Map()), null);
  });

  t('tampering envelope.fp invalidates ciphertext (AAD)', () => {
    const tc = tribeCryptoFactory(fresh());
    const k = tc.generateTribeKey();
    tc.setKey('%root.sha256', k, 1);
    const env = tc.wrapMsg({ k: 'tribe' }, k);
    env.fp = 'f'.repeat(32);
    eq(tc.unwrapMsg(env, tc.buildFingerprintIndex()), null);
  });
});

describe('crypto: invites', (t) => {
  t('encrypt/decrypt invite chain roundtrip', () => {
    const tc = tribeCryptoFactory(fresh());
    const k = tc.generateTribeKey();
    tc.setKey('%root.sha256', k, 1);
    const code = 'mycode';
    const salt = tc.generateInviteSalt();
    const ek = tc.encryptChainForInvite(['%root.sha256'], code, salt);
    const chain = tc.decryptChainFromInvite(ek, code, salt);
    eq(chain[0].rootId, '%root.sha256');
    eq(chain[0].key, k);
  });

  t('decrypt with wrong code returns null', () => {
    const tc = tribeCryptoFactory(fresh());
    const k = tc.generateTribeKey();
    tc.setKey('%root.sha256', k, 1);
    const salt = tc.generateInviteSalt();
    const ek = tc.encryptChainForInvite(['%root.sha256'], 'right', salt);
    eq(tc.decryptChainFromInvite(ek, 'wrong', salt), null);
  });

  t('inviteMatchesCode via codeHash', () => {
    const tc = tribeCryptoFactory(fresh());
    const code = 'abc123';
    const salt = tc.generateInviteSalt();
    const inv = { codeHash: tc.hashInviteCode(code, salt), salt };
    ok(tc.inviteMatchesCode(inv, code));
    notOk(tc.inviteMatchesCode(inv, 'other'));
  });
});

describe('crypto: AES-GCM primitives', (t) => {
  t('roundtrip with AAD', () => {
    const tc = tribeCryptoFactory(fresh());
    const k = tc.generateTribeKey();
    const aad = Buffer.from('test-aad');
    eq(tc.decryptWithKey(tc.encryptWithKey('hello', k, aad), k, aad), 'hello');
  });

  t('decrypt with wrong AAD throws', () => {
    const tc = tribeCryptoFactory(fresh());
    const k = tc.generateTribeKey();
    const enc = tc.encryptWithKey('x', k, Buffer.from('a'));
    let threw = false;
    try { tc.decryptWithKey(enc, k, Buffer.from('b')); } catch (_) { threw = true; }
    ok(threw);
  });
});

describe('crypto: legacy encryptContent (audit fix)', (t) => {
  t('no no-AAD fallback - tampered envelope rejected', () => {
    const tc = tribeCryptoFactory(fresh());
    const k = tc.generateTribeKey();
    const content = { type: 'chat', tribeId: '%t.sha256', title: 'x', author: '@a', createdAt: 'now' };
    const enc = tc.encryptContent(content, [k], true);
    const tampered = { ...enc, tribeId: '%other.sha256' };
    ok(tc.decryptContent(tampered, [[k]])._undecryptable);
  });
});
