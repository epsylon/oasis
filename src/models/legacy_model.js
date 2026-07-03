const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const MAGIC = Buffer.from('OASIS1');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

function normalizePassword(password) {
  if (password && typeof password === 'object' && password.password) password = password.password;
  return String(password || '');
}

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, 32);
}

function encryptBuffer(plaintext, password) {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, salt, iv, tag, ciphertext]);
}

function decryptBuffer(data, password) {
  if (!Buffer.isBuffer(data) || data.length < MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN) {
    throw new Error('Unrecognized or corrupt backup file.');
  }
  if (!data.slice(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Unrecognized or corrupt backup file.');
  }
  let o = MAGIC.length;
  const salt = data.slice(o, o += SALT_LEN);
  const iv = data.slice(o, o += IV_LEN);
  const tag = data.slice(o, o += TAG_LEN);
  const ciphertext = data.slice(o);
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = {
  exportData: async (password) => {
    try {
      const pw = normalizePassword(password);
      const homeDir = os.homedir();
      const secretFilePath = path.join(homeDir, '.ssb', 'secret');
      if (!fs.existsSync(secretFilePath)) {
        throw new Error(".ssb/secret file doesn't exist");
      }
      const original = fs.readFileSync(secretFilePath);
      const encrypted = encryptBuffer(original, pw);
      const roundtrip = decryptBuffer(encrypted, pw);
      if (!roundtrip.equals(original)) {
        throw new Error('Backup verification failed; nothing was written.');
      }
      const encryptedFilePath = path.join(homeDir, 'oasis.enc');
      fs.writeFileSync(encryptedFilePath, encrypted, { mode: 0o600 });
      return encryptedFilePath;
    } catch (error) {
      throw new Error("Error exporting data: " + error.message);
    }
  },
  importData: async ({ filePath, password }) => {
    try {
      const pw = normalizePassword(password);
      if (!fs.existsSync(filePath)) {
        throw new Error('Encrypted file not found.');
      }
      const data = fs.readFileSync(filePath);
      let decrypted;
      try {
        decrypted = decryptBuffer(data, pw);
      } catch (_) {
        throw new Error('Wrong password or corrupt backup file.');
      }
      const homeDir = os.homedir();
      const ssbDir = path.join(homeDir, '.ssb');
      fs.mkdirSync(ssbDir, { recursive: true });
      const secretPath = path.join(ssbDir, 'secret');
      if (fs.existsSync(secretPath)) {
        fs.copyFileSync(secretPath, path.join(ssbDir, 'secret.bak-' + new Date().toISOString().replace(/[:.]/g, '-')));
      }
      const tmpPath = path.join(ssbDir, 'secret.tmp-' + process.pid);
      fs.writeFileSync(tmpPath, decrypted, { mode: 0o600 });
      fs.renameSync(tmpPath, secretPath);
      try { fs.unlinkSync(filePath); } catch (_) {}
      return secretPath;
    } catch (error) {
      throw new Error("Error importing data: " + error.message);
    }
  }
};
