const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SENSITIVE_FIELDS = [
  'title', 'description', 'location', 'price', 'salary', 'options', 'votes',
  'category', 'tags', 'image', 'url', 'attendees', 'assignees', 'deadline',
  'goal', 'funded', 'refeeds', 'refeeds_inhabitants', 'opinions',
  'opinions_inhabitants', 'status', 'priority', 'date', 'mediaType'
];

const ENVELOPE_PRESERVE = new Set([
  'type', 'tribeId', 'contentType', 'replaces', 'target', 'author',
  'createdAt', 'updatedAt', 'encryptedPayload',
  'mapId', 'calendarId', 'dateId', 'padId', 'roomId', 'parentId',
  'members', 'invites', 'participants',
  '_decrypted', '_undecryptable'
]);

const INVITE_SALT_LEGACY = 'SolarNET.HuB';
const INVITE_SCRYPT = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

module.exports = (configPath) => {
  const keyringPath = path.join(configPath, 'tribe-keys.json');
  let keyring = {};

  const loadKeyring = () => {
    try {
      keyring = JSON.parse(fs.readFileSync(keyringPath, 'utf8'));
      try { fs.chmodSync(keyringPath, 0o600); } catch (_) {}
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      keyring = {};
    }
    return keyring;
  };

  const saveKeyring = () => {
    const tmp = keyringPath + '.tmp.' + process.pid + '.' + Date.now();
    fs.writeFileSync(tmp, JSON.stringify(keyring, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, keyringPath);
    try { fs.chmodSync(keyringPath, 0o600); } catch (_) {}
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

  const setKeys = (tribeRootId, keysHex, topGen) => {
    if (!Array.isArray(keysHex) || !keysHex.length) return;
    const seen = new Set();
    const dedup = [];
    for (const k of keysHex) { if (k && !seen.has(k)) { seen.add(k); dedup.push(k); } }
    keyring[tribeRootId] = { keys: dedup, gen: topGen || dedup.length };
    saveKeyring();
  };

  const mergeKeys = (tribeRootId, incomingKeys, topGen) => {
    const entry = keyring[tribeRootId] || { keys: [], gen: 0 };
    const seen = new Set(entry.keys);
    const merged = [...entry.keys];
    for (const k of incomingKeys) {
      if (k && !seen.has(k)) { seen.add(k); merged.push(k); }
    }
    keyring[tribeRootId] = { keys: merged, gen: Math.max(entry.gen || 0, topGen || merged.length) };
    saveKeyring();
    return keyring[tribeRootId].gen;
  };

  const addNewKey = (tribeRootId, newKeyHex) => {
    const entry = keyring[tribeRootId] || { keys: [], gen: 0 };
    if (entry.keys.includes(newKeyHex)) return entry.gen;
    entry.keys.unshift(newKeyHex);
    entry.gen = (entry.gen || 0) + 1;
    keyring[tribeRootId] = entry;
    saveKeyring();
    return entry.gen;
  };

  const canonicalAad = (envelope) => {
    if (!envelope) return null;
    const fields = ['type', 'tribeId', 'contentType', 'replaces', 'author', 'createdAt'];
    const obj = {};
    for (const f of fields) if (envelope[f] !== undefined && envelope[f] !== null) obj[f] = envelope[f];
    return Buffer.from(JSON.stringify(obj), 'utf8');
  };

  const encryptWithKey = (plaintext, keyHex, aad) => {
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    if (aad) cipher.setAAD(aad);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + authTag.toString('hex') + enc.toString('hex');
  };

  const decryptWithKey = (encrypted, keyHex, aad) => {
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(encrypted.slice(0, 24), 'hex');
    const authTag = Buffer.from(encrypted.slice(24, 56), 'hex');
    const ciphertext = Buffer.from(encrypted.slice(56), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  };

  const generateInviteSalt = () => crypto.randomBytes(16).toString('hex');

  const deriveInviteKey = (inviteCode, salt) => {
    if (salt === undefined || salt === null || salt === '') {
      return crypto.scryptSync(inviteCode, INVITE_SALT_LEGACY, 32);
    }
    return crypto.scryptSync(inviteCode, salt, 32, INVITE_SCRYPT);
  };

  const hashInviteCode = (inviteCode, salt) => {
    const s = salt === undefined || salt === null || salt === '' ? INVITE_SALT_LEGACY : salt;
    return crypto.createHmac('sha256', s).update(String(inviteCode), 'utf8').digest('hex');
  };

  const encryptForInvite = (tribeKeyHex, inviteCode, salt) => {
    const derived = deriveInviteKey(inviteCode, salt);
    return encryptWithKey(tribeKeyHex, derived.toString('hex'));
  };

  const decryptFromInvite = (encryptedKey, inviteCode, salt) => {
    const derived = deriveInviteKey(inviteCode, salt);
    return decryptWithKey(encryptedKey, derived.toString('hex'));
  };

  const encryptChainForInvite = (ancestryRootIds, inviteCode, salt) => {
    const chain = ancestryRootIds.map(rootId => ({
      rootId,
      key: getKey(rootId),
      keys: getKeys(rootId),
      gen: getGen(rootId)
    }));
    if (chain.some(e => !e.key || !Array.isArray(e.keys) || !e.keys.length)) return null;
    const derived = deriveInviteKey(inviteCode, salt);
    return encryptWithKey(JSON.stringify(chain), derived.toString('hex'));
  };

  const decryptChainFromInvite = (encryptedPayload, inviteCode, salt) => {
    const derived = deriveInviteKey(inviteCode, salt);
    try {
      const json = decryptWithKey(encryptedPayload, derived.toString('hex'));
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed) && parsed.every(e => e && e.rootId && (e.key || (Array.isArray(e.keys) && e.keys.length)))) {
        return parsed.map(e => ({
          rootId: e.rootId,
          key: e.key || (Array.isArray(e.keys) ? e.keys[0] : null),
          keys: Array.isArray(e.keys) && e.keys.length ? e.keys : (e.key ? [e.key] : []),
          gen: e.gen || 1
        }));
      }
    } catch (_) {}
    return null;
  };

  const inviteMatchesCode = (inv, code) => {
    if (typeof inv === 'string') return inv === code;
    if (!inv || typeof inv !== 'object') return false;
    if (inv.codeHash) return inv.codeHash === hashInviteCode(code, inv.salt);
    if (inv.code) return inv.code === code;
    return false;
  };

  const encryptChain = (plaintext, keyChain, aad) => {
    let data = plaintext;
    const last = keyChain.length - 1;
    for (let i = 0; i < keyChain.length; i++) {
      data = encryptWithKey(data, keyChain[i], i === last ? aad : undefined);
    }
    return data;
  };

  const decryptChain = (encrypted, keyChain, aad) => {
    const reversed = [...keyChain].reverse();
    let data = encrypted;
    for (let i = 0; i < reversed.length; i++) {
      data = decryptWithKey(data, reversed[i], i === 0 ? aad : undefined);
    }
    return data;
  };

  const encryptContent = (content, keyChain, customFields) => {
    const payload = {};
    if (customFields) {
      for (const [k, v] of Object.entries(content)) {
        if (ENVELOPE_PRESERVE.has(k)) continue;
        payload[k] = v;
      }
    } else {
      for (const field of SENSITIVE_FIELDS) {
        if (content[field] !== undefined) payload[field] = content[field];
      }
    }
    const plaintext = JSON.stringify(payload);
    const result = {};
    for (const [k, v] of Object.entries(content)) {
      if (customFields ? ENVELOPE_PRESERVE.has(k) : !SENSITIVE_FIELDS.includes(k)) {
        result[k] = v;
      }
    }
    const aad = canonicalAad(result);
    const encryptedPayload = encryptChain(plaintext, keyChain, aad);
    result.encryptedPayload = encryptedPayload;
    return result;
  };

  const decryptContent = (content, keyChainSets) => {
    if (!content.encryptedPayload) return content;
    const envelope = { ...content };
    delete envelope.encryptedPayload;
    const aad = canonicalAad(envelope);
    for (const keyChain of keyChainSets) {
      try {
        const plaintext = decryptChain(content.encryptedPayload, keyChain, aad);
        const payload = JSON.parse(plaintext);
        const result = { ...content };
        delete result.encryptedPayload;
        Object.assign(result, payload);
        return result;
      } catch (e) {}
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
    return { ...content, _undecryptable: true };
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

  const resolveKeyChain = async (tribeId, tribesModel) => {
    if (!tribeId || !tribesModel) return null;
    let ancestryIds;
    try { ancestryIds = await tribesModel.getAncestryChain(tribeId); } catch (_) { return null; }
    if (!Array.isArray(ancestryIds) || !ancestryIds.length) return null;
    const chain = [];
    for (const rootId of ancestryIds) {
      const key = getKey(rootId);
      if (!key) return null;
      chain.push(key);
    }
    return chain.length ? chain : null;
  };

  const resolveKeyChainSets = async (tribeId, tribesModel) => {
    if (!tribeId || !tribesModel) return null;
    let ancestryIds;
    try { ancestryIds = await tribesModel.getAncestryChain(tribeId); } catch (_) { return null; }
    if (!Array.isArray(ancestryIds) || !ancestryIds.length) return null;
    return buildKeyChainSets(ancestryIds);
  };

  const encryptForTribe = async (content, tribeId, tribesModel) => {
    const chain = await resolveKeyChain(tribeId, tribesModel);
    if (!chain) throw new Error('Missing tribe key chain — cannot encrypt content for this tribe');
    return encryptContent(content, chain, true);
  };

  const decryptFromTribe = async (content, tribesModel) => {
    if (!content || !content.encryptedPayload) return content;
    const tid = content.tribeId;
    if (tid) {
      let sets = null;
      try { sets = await resolveKeyChainSets(tid, tribesModel); } catch (_) {}
      if (sets && sets.length) {
        const r = decryptContent(content, sets);
        if (r && !r._undecryptable) return r;
      }
      const directKeys = getKeys(tid);
      if (directKeys && directKeys.length) {
        const r = decryptContent(content, directKeys.map(k => [k]));
        if (r && !r._undecryptable) return r;
      }
    }
    const candidateRoots = [
      content.calendarId, content.chatId, content.padId,
      content.mapId, content.roomId, content.parentId, content.dateId
    ].filter(Boolean);
    for (const rid of candidateRoots) {
      const keys = getKeys(rid);
      if (keys && keys.length) {
        const r = decryptContent(content, keys.map(k => [k]));
        if (r && !r._undecryptable) return r;
      }
    }
    return { ...content, _undecryptable: true };
  };

  const createHelpers = (tribesModel) => ({
    async encryptIfTribe(content) {
      if (!content.tribeId || !tribesModel) return content;
      return await encryptForTribe(content, content.tribeId, tribesModel);
    },
    async decryptIfTribe(content) {
      if (!content || !content.encryptedPayload || !tribesModel) return content;
      return await decryptFromTribe(content, tribesModel);
    },
    assertReadable(decrypted, what) {
      if (decrypted && decrypted._undecryptable) throw new Error(`${what} is tribe-encrypted and cannot be decrypted with available keys`);
    },
    async decryptIndexNodes(idx) {
      if (!tribesModel) return;
      for (const [k, n] of idx.nodes.entries()) {
        if (!n.c || !n.c.encryptedPayload) continue;
        const dec = await decryptFromTribe(n.c, tribesModel);
        if (dec && !dec._undecryptable) {
          idx.nodes.set(k, { ...n, c: { ...dec, _decrypted: true } });
        } else {
          idx.nodes.set(k, { ...n, c: { ...n.c, _decrypted: false } });
        }
      }
    }
  });

  loadKeyring();

  return {
    SENSITIVE_FIELDS,
    ENVELOPE_PRESERVE,
    loadKeyring, saveKeyring,
    generateTribeKey, getKey, getKeys, getGen, setKey, setKeys, mergeKeys, addNewKey,
    encryptWithKey, decryptWithKey,
    encryptForInvite, decryptFromInvite,
    encryptChainForInvite, decryptChainFromInvite,
    generateInviteSalt, hashInviteCode, inviteMatchesCode,
    encryptChain, decryptChain,
    encryptContent, decryptContent,
    boxKeyForMember, unboxKeyFromMember,
    buildKeyChainSets,
    resolveKeyChain, resolveKeyChainSets,
    encryptForTribe, decryptFromTribe,
    createHelpers,
  };
};
