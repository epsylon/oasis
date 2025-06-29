const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

function encryptFile(filePath, password) {
  if (typeof password === 'object' && password.password) {
    password = password.password;
  }
  const key = Buffer.from(password, 'utf-8');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const homeDir = os.homedir();
  const encryptedFilePath = path.join(homeDir, 'oasis.enc');
  const output = fs.createWriteStream(encryptedFilePath);
  const input = fs.createReadStream(filePath);
  input.pipe(cipher).pipe(output);
  return new Promise((resolve, reject) => {
    output.on('finish', () => {
      resolve(encryptedFilePath);
    });
    output.on('error', (err) => {
      reject(err);
    });
  });
}

function decryptFile(filePath, password) {
  if (typeof password === 'object' && password.password) {
    password = password.password;
  } 
  const key = Buffer.from(password, 'utf-8');
  const iv = crypto.randomBytes(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv); 
  const homeDir = os.homedir();
  const decryptedFilePath = path.join(homeDir, 'secret');
  const output = fs.createWriteStream(decryptedFilePath);
  const input = fs.createReadStream(filePath);
  input.pipe(decipher).pipe(output);
  return new Promise((resolve, reject) => {
    output.on('finish', () => {
      resolve(decryptedFilePath);
    });
    output.on('error', (err) => {
      console.error('Error deciphering data:', err);
      reject(err);
    });
  });
}

module.exports = {
  exportData: async (password) => {
    try {
      const homeDir = os.homedir();
      const secretFilePath = path.join(homeDir, '.ssb', 'secret');
      
      if (!fs.existsSync(secretFilePath)) {
        throw new Error(".ssb/secret file doesn't exist");
      }
      const encryptedFilePath = await encryptFile(secretFilePath, password);   
      fs.unlinkSync(secretFilePath);
      return encryptedFilePath;
    } catch (error) {
      throw new Error("Error exporting data: " + error.message);
    }
  },
  importData: async ({ filePath, password }) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('Encrypted file not found.');
      }
      const decryptedFilePath = await decryptFile(filePath, password);

      if (!fs.existsSync(decryptedFilePath)) {
        throw new Error("Decryption failed.");
      }

      fs.unlinkSync(filePath);
      return decryptedFilePath;

    } catch (error) {
      throw new Error("Error importing data: " + error.message);
    }
  }
};
