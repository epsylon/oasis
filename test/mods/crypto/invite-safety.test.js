const { eq, ok, notOk } = require('../../helpers/assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

const fresh = () => {
  const dir = path.join(os.tmpdir(), 'oasis-invite-safety-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const makeCrypto = () => require('../../../src/models/crypto')(fresh(), 'tribes');

describe('invites: they are verified before being handed out', (t) => {
  t('a generated invite always opens with its own code', () => {
    const c = makeCrypto();
    const root = '%tribe.sha256';
    c.setKeys(root, [c.generateTribeKey()], 1);
    const code = crypto.randomBytes(16).toString('hex');
    const salt = c.generateInviteSalt();

    const payload = c.encryptChainForInvite([root], code, salt);
    ok(payload, 'a payload is produced');
    const chain = c.decryptChainFromInvite(payload, code, salt);
    ok(Array.isArray(chain) && chain.length, 'and it round-trips');
    eq(chain[0].rootId, root, 'with the right tribe');
  });

  t('a wrong code still opens nothing', () => {
    const c = makeCrypto();
    const root = '%tribe.sha256';
    c.setKeys(root, [c.generateTribeKey()], 1);
    const salt = c.generateInviteSalt();
    const payload = c.encryptChainForInvite([root], 'the-real-code', salt);
    notOk(c.decryptChainFromInvite(payload, 'another-code', salt), 'a different code fails');
    notOk(c.decryptChainFromInvite(payload, 'the-real-code', c.generateInviteSalt()), 'a different salt fails');
  });

  t('asking for several attempts does not turn a wrong code into a right one', () => {
    const c = makeCrypto();
    const root = '%tribe.sha256';
    c.setKeys(root, [c.generateTribeKey()], 1);
    const salt = c.generateInviteSalt();
    const payload = c.encryptChainForInvite([root], 'the-real-code', salt);
    notOk(c.decryptChainFromInvite(payload, 'another-code', salt, 3), 'three attempts, still refused');
  });

  t('an invite for a tribe with no keys is refused instead of published empty', () => {
    const c = makeCrypto();
    eq(c.encryptChainForInvite(['%unknown.sha256'], 'code', c.generateInviteSalt()), null, 'nothing to encrypt, nothing returned');
  });

});
