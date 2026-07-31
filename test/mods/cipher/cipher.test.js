const { eq, ok, notOk } = require('../../helpers/assert');

const cipher = require('../../../src/models/cipher_model');

const PASSWORD = 'a strong shared password';
const TEXT = 'Meet at the plaza at 19:00. Bring the maps.';

describe('cipher: encrypt and decrypt', (t) => {
  t('a text survives a full roundtrip', () => {
    const { encryptedText } = cipher.encryptData(TEXT, PASSWORD);
    eq(cipher.decryptData(encryptedText, PASSWORD), TEXT);
  });

  t('the ciphertext hides the original text', () => {
    const { encryptedText } = cipher.encryptData(TEXT, PASSWORD);
    notOk(encryptedText.includes('plaza'), 'no plaintext leaks');
    notOk(encryptedText.includes(TEXT));
    ok(encryptedText.length > TEXT.length, 'it carries iv, salt and tag');
  });

  t('the same text encrypted twice gives different ciphertexts', () => {
    const a = cipher.encryptData(TEXT, PASSWORD).encryptedText;
    const b = cipher.encryptData(TEXT, PASSWORD).encryptedText;
    notOk(a === b, 'salt and iv are random per message');
    eq(cipher.decryptData(a, PASSWORD), TEXT);
    eq(cipher.decryptData(b, PASSWORD), TEXT);
  });

  t('unicode and long texts survive too', () => {
    const long = 'ñ á ü 中文 عربى ' + 'x'.repeat(5000);
    const { encryptedText } = cipher.encryptData(long, PASSWORD);
    eq(cipher.decryptData(encryptedText, PASSWORD), long);
  });

  t('an empty text is still handled', () => {
    const { encryptedText } = cipher.encryptData('', PASSWORD);
    eq(cipher.decryptData(encryptedText, PASSWORD), '');
  });
});

describe('cipher: rejects wrong keys and tampering', (t) => {
  const failsToDecrypt = (payload, password) => {
    try {
      cipher.decryptData(payload, password);
    } catch (_) {
      return true;
    }
    return false;
  };

  t('a wrong password does not decrypt', () => {
    const { encryptedText } = cipher.encryptData(TEXT, PASSWORD);
    ok(failsToDecrypt(encryptedText, 'another password'), 'decryption fails');
  });

  t('tampering with the ciphertext is detected', () => {
    const { encryptedText } = cipher.encryptData(TEXT, PASSWORD);
    const flipped = encryptedText.slice(0, -1) + (encryptedText.slice(-1) === 'a' ? 'b' : 'a');
    ok(failsToDecrypt(flipped, PASSWORD), 'the authentication tag catches it');
  });

  t('tampering with the header is detected', () => {
    const { encryptedText } = cipher.encryptData(TEXT, PASSWORD);
    const broken = 'ff' + encryptedText.slice(2);
    ok(failsToDecrypt(broken, PASSWORD), 'a modified iv invalidates the message');
  });

  t('garbage is not accepted as a message', () => {
    ok(failsToDecrypt('not an encrypted message at all', PASSWORD));
  });
});

describe('cipher: generated keys', (t) => {
  t('generateKey returns the requested length in hex', () => {
    eq(cipher.generateKey().length, 32);
    eq(cipher.generateKey(64).length, 64);
    ok(/^[0-9a-f]+$/.test(cipher.generateKey(64)));
  });

  t('two generated keys are different', () => {
    notOk(cipher.generateKey() === cipher.generateKey());
  });

  t('a generated key works as a password', () => {
    const key = cipher.generateKey(64);
    const { encryptedText } = cipher.encryptData(TEXT, key);
    eq(cipher.decryptData(encryptedText, key), TEXT);
  });
});
