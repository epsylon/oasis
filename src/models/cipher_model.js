const crypto = require('crypto');

function generateKeyFromPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32);
}

function encryptText(text, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = generateKeyFromPassword(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encryptedText = cipher.update(text, 'utf-8', 'hex');
  encryptedText += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  const ivHex = iv.toString('hex');
  const saltHex = salt.toString('hex');
  return { encryptedText, iv: ivHex, salt: saltHex, authTag };
}

function decryptText(encryptedText, password, ivHex, saltHex, authTagHex) {
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = generateKeyFromPassword(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decryptedText = decipher.update(encryptedText, 'hex', 'utf-8');
  decryptedText += decipher.final('utf-8');
  return decryptedText;
}

function extractComponents(encryptedText) {
  const iv = encryptedText.slice(0, 24);
  const salt = encryptedText.slice(24, 56);
  const authTag = encryptedText.slice(56, 88);
  const encrypted = encryptedText.slice(88);
  return { iv, salt, authTag, encrypted };
}

module.exports = {
  encryptData: (text, password) => {
      const { encryptedText, iv, salt, authTag } = encryptText(text, password);
      return { encryptedText: iv + salt + authTag + encryptedText, iv, salt, authTag };
  },
  decryptData: (encryptedText, password) => {
      const { iv, salt, authTag, encrypted } = extractComponents(encryptedText);
      const decryptedText = decryptText(encrypted, password, iv, salt, authTag);
      return decryptedText;
  },
  extractComponents
};
