const crypto = require('crypto');

const FEED_ID = /^@[A-Za-z0-9+/]{43}=\.ed25519$/;
const MSG_ID = /^%[A-Za-z0-9+/]{43}=?\.sha256$/;

const digitsOf = (id) => {
  const n = crypto.createHash('sha256').update(String(id)).digest().readUInt32BE(0) % 1000000;
  const s = String(n).padStart(6, '0');
  return `${s.slice(0, 3)}-${s.slice(3)}`;
};
const phoneNumberOf = (id) => (FEED_ID.test(String(id || '')) ? digitsOf(id) : null);
const roomNumberOf = (id) => (MSG_ID.test(String(id || '')) ? digitsOf(id) : null);

const normalizeNumber = (value) => {
  const digits = String(value || '').replace(/[\s.\-]/g, '');
  return /^\d{6}$/.test(digits) ? `${digits.slice(0, 3)}-${digits.slice(3)}` : null;
};

const resolveNumber = (value, known) => {
  const number = normalizeNumber(value);
  if (!number) return [];
  return [...(known || new Map())]
    .filter(([id]) => phoneNumberOf(id) === number)
    .map(([id, hop]) => ({ id, hop: Number(hop) }))
    .sort((a, b) => a.hop - b.hop);
};

module.exports = { phoneNumberOf, roomNumberOf, normalizeNumber, resolveNumber };
