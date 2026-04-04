const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SENSITIVE_FIELDS = [
  'title', 'description', 'location', 'price', 'salary', 'options', 'votes',
  'category', 'tags', 'image', 'url', 'attendees', 'assignees', 'deadline',
  'goal', 'funded', 'refeeds', 'refeeds_inhabitants', 'opinions',
  'opinions_inhabitants', 'parentId', 'status', 'priority', 'date', 'mediaType'
];

const INVITE_SALT = 'SolarNET.HuB';

module.exports = (configPath) => {
  const keyringPath = path.join(configPath, 'tribe-keys.json');
  let keyring = {};

  const loadKeyring = () => {
    try {
      keyring = JSON.parse(fs.readFileSync(keyringPath, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      keyring = {};
    }
    return keyring;
  };

  const saveKeyring = () => {
    fs.writeFileSync(keyringPath, JSON.stringify(keyring, null, 2), 'utf8');
  };

  const generateTribeKey = () => crypto.randomBytes(32).toString('hex');

  const getKey = (tribeRootId) => {
    const entry = keyring[tribeRootId];
    return entry && entry.keys && entry.keys[0] ? entry.keys[0] : null;
  };

  const getKeys = (tribeRootId) => {
    const entry = keyring[tribeRootId];
    return entry && entry.keys ? entry.keys : [];
  };

  const getGen = (tribeRootId) => {
    const entry = keyring[tribeRootId];
    return entry ? entry.gen || 1 : 0;
  };

  const setKey = (tribeRootId, keyHex, gen) => {
    keyring[tribeRootId] = { keys: [keyHex], gen: gen || 1 };
    saveKeyring();
  };

  const addNewKey = (tribeRootId, newKeyHex) => {
    const entry = keyring[tribeRootId] || { keys: [], gen: 0 };
    entry.keys.unshift(newKeyHex);
    entry.gen = (entry.gen || 0) + 1;
    keyring[tribeRootId] = entry;
    saveKeyring();
    return entry.gen;
  };

  const encryptWithKey = (plaintext, keyHex) => {
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + authTag.toString('hex') + enc.toString('hex');
  };

  const decryptWithKey = (encrypted, keyHex) => {
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(encrypted.slice(0, 24), 'hex');
    const authTag = Buffer.from(encrypted.slice(24, 56), 'hex');
    const ciphertext = Buffer.from(encrypted.slice(56), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  };

  const encryptForInvite = (tribeKeyHex, inviteCode) => {
    const derived = crypto.scryptSync(inviteCode, INVITE_SALT, 32);
    return encryptWithKey(tribeKeyHex, derived.toString('hex'));
  };

  const decryptFromInvite = (encryptedKey, inviteCode) => {
    const derived = crypto.scryptSync(inviteCode, INVITE_SALT, 32);
    return decryptWithKey(encryptedKey, derived.toString('hex'));
  };

  const encryptChain = (plaintext, keyChain) => {
    let data = plaintext;
    for (const keyHex of keyChain) {
      data = encryptWithKey(data, keyHex);
    }
    return data;
  };

  const decryptChain = (encrypted, keyChain) => {
    const reversed = [...keyChain].reverse();
    let data = encrypted;
    for (const keyHex of reversed) {
      data = decryptWithKey(data, keyHex);
    }
    return data;
  };

  const encryptContent = (content, keyChain) => {
    const payload = {};
    for (const field of SENSITIVE_FIELDS) {
      if (content[field] !== undefined) {
        payload[field] = content[field];
      }
    }
    const plaintext = JSON.stringify(payload);
    const encryptedPayload = encryptChain(plaintext, keyChain);
    const result = {};
    for (const [k, v] of Object.entries(content)) {
      if (!SENSITIVE_FIELDS.includes(k)) result[k] = v;
    }
    result.encryptedPayload = encryptedPayload;
    return result;
  };

  const decryptContent = (content, keyChainSets) => {
    if (!content.encryptedPayload) return content;
    for (const keyChain of keyChainSets) {
      try {
        const plaintext = decryptChain(content.encryptedPayload, keyChain);
        const payload = JSON.parse(plaintext);
        const result = { ...content };
        delete result.encryptedPayload;
        Object.assign(result, payload);
        return result;
      } catch (e) {
        continue;
      }
    }
    return { ...content, encrypted: true };
  };

  const boxKeyForMember = (tribeKeyHex, memberFeedId, ssbKeys) => {
    return ssbKeys.box(tribeKeyHex, [memberFeedId]);
  };

  const unboxKeyFromMember = (boxed, localKeypair, ssbKeys) => {
    return ssbKeys.unbox(boxed, localKeypair);
  };

  const buildKeyChainSets = (ancestryRootIds) => {
    if (ancestryRootIds.length === 0) return [];
    if (ancestryRootIds.length === 1) {
      const keys = getKeys(ancestryRootIds[0]);
      return keys.map(k => [k]);
    }
    const ownKeys = getKeys(ancestryRootIds[0]);
    const parentSets = buildKeyChainSets(ancestryRootIds.slice(1));
    const sets = [];
    for (const ownKey of ownKeys) {
      for (const parentChain of parentSets) {
        sets.push([ownKey, ...parentChain]);
      }
    }
    return sets;
  };

  loadKeyring();

  return {
    SENSITIVE_FIELDS,
    loadKeyring, saveKeyring,
    generateTribeKey, getKey, getKeys, getGen, setKey, addNewKey,
    encryptWithKey, decryptWithKey,
    encryptForInvite, decryptFromInvite,
    encryptChain, decryptChain,
    encryptContent, decryptContent,
    boxKeyForMember, unboxKeyFromMember,
    buildKeyChainSets,
  };
};
