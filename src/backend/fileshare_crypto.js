const crypto = require('crypto');

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;

const generateFileKey = () => crypto.randomBytes(KEY_LEN);

const keyToHex = (key) => Buffer.isBuffer(key) ? key.toString('hex') : String(key);

const keyFromHex = (hex) => {
  const buf = Buffer.from(String(hex), 'hex');
  if (buf.length !== KEY_LEN) throw new Error('Invalid file key');
  return buf;
};

const encryptChunk = (plaintext, key) => {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
};

const decryptChunk = (payload, key) => {
  if (!Buffer.isBuffer(payload) || payload.length < IV_LEN + TAG_LEN) throw new Error('Corrupt chunk');
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
};

const sha256Hex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const splitBuffer = (buffer, chunkSize = DEFAULT_CHUNK_SIZE) => {
  const size = Math.max(1, Number(chunkSize) || DEFAULT_CHUNK_SIZE);
  const out = [];
  for (let off = 0; off < buffer.length; off += size) {
    out.push(buffer.subarray(off, Math.min(off + size, buffer.length)));
  }
  if (!out.length) out.push(Buffer.alloc(0));
  return out;
};

const buildManifest = ({ filename, mime, size, chunkSize, chunkHashes, plainSha256 }) => ({
  v: 1,
  alg: ALG,
  filename: String(filename || 'file'),
  mime: String(mime || 'application/octet-stream'),
  size: Number(size) || 0,
  chunkSize: Number(chunkSize) || DEFAULT_CHUNK_SIZE,
  chunks: Array.isArray(chunkHashes) ? chunkHashes.slice() : [],
  plainSha256: plainSha256 || null
});

const encryptManifest = (manifest, key) => encryptChunk(Buffer.from(JSON.stringify(manifest), 'utf8'), key);

const decryptManifest = (payload, key) => {
  const json = decryptChunk(payload, key).toString('utf8');
  const m = JSON.parse(json);
  if (!m || m.v !== 1 || !Array.isArray(m.chunks)) throw new Error('Invalid manifest');
  return m;
};

module.exports = {
  ALG, IV_LEN, TAG_LEN, KEY_LEN, DEFAULT_CHUNK_SIZE,
  generateFileKey, keyToHex, keyFromHex,
  encryptChunk, decryptChunk, sha256Hex, splitBuffer,
  buildManifest, encryptManifest, decryptManifest
};
