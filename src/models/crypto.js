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

const FP_INFO = Buffer.from('v1-fp', 'utf8');
const ENVELOPE_TYPE = 'tribe-msg';
const ENVELOPE_VERSION = 1;
const KEY_DISTRIB_TYPE = 'tribe-keys-distrib';
const KEY_DISTRIB_BATCH = 7;

module.exports = (configPath, namespace = 'tribes') => {
  const keysDir = path.join(configPath, 'keys');
  try { fs.mkdirSync(keysDir, { recursive: true, mode: 0o700 }); } catch (_) {}
  const keyringPath = path.join(keysDir, `${namespace}-keys.json`);

  if (namespace === 'tribes') {
    const legacyPath = path.join(configPath, 'tribe-keys.json');
    try {
      if (fs.existsSync(legacyPath) && !fs.existsSync(keyringPath)) {
        fs.renameSync(legacyPath, keyringPath);
        try { fs.chmodSync(keyringPath, 0o600); } catch (_) {}
      }
    } catch (_) {}
  }

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

  const getKey = (rid) => {
    const e = keyring[rid];
    return e && Array.isArray(e.keys) && e.keys[0] ? e.keys[0] : null;
  };

  const getKeys = (rid) => {
    const e = keyring[rid];
    return e && Array.isArray(e.keys) ? e.keys : [];
  };

  const getGen = (rid) => {
    const e = keyring[rid];
    return e ? e.gen || 1 : 0;
  };

  const getAllRootIds = () => Object.keys(keyring);

  const setKey = (rid, kHex, gen) => {
    keyring[rid] = { keys: [kHex], gen: gen || 1 };
    saveKeyring();
  };

  const setKeys = (rid, ks, topGen) => {
    if (!Array.isArray(ks) || !ks.length) return;
    const seen = new Set();
    const dedup = [];
    for (const k of ks) if (k && !seen.has(k)) { seen.add(k); dedup.push(k); }
    keyring[rid] = { keys: dedup, gen: topGen || dedup.length };
    saveKeyring();
  };

  const mergeKeys = (rid, incoming, topGen) => {
    const e = keyring[rid] || { keys: [], gen: 0 };
    const seen = new Set(e.keys);
    const merged = [...e.keys];
    for (const k of incoming) if (k && !seen.has(k)) { seen.add(k); merged.push(k); }
    keyring[rid] = { keys: merged, gen: Math.max(e.gen || 0, topGen || merged.length) };
    saveKeyring();
    return keyring[rid].gen;
  };

  const addNewKey = (rid, kHex) => {
    const e = keyring[rid] || { keys: [], gen: 0 };
    if (e.keys.includes(kHex)) return e.gen;
    e.keys.unshift(kHex);
    e.gen = (e.gen || 0) + 1;
    keyring[rid] = e;
    saveKeyring();
    return e.gen;
  };

  const dropKey = (rid) => {
    if (keyring[rid]) {
      delete keyring[rid];
      saveKeyring();
    }
  };

  const fingerprint = (kHex) =>
    crypto.createHmac('sha256', Buffer.from(kHex, 'hex')).update(FP_INFO).digest('hex').slice(0, 32);

  const buildFingerprintIndex = () => {
    const m = new Map();
    for (const [rid, e] of Object.entries(keyring)) {
      if (!e || !Array.isArray(e.keys)) continue;
      for (let i = 0; i < e.keys.length; i++) {
        const k = e.keys[i];
        if (!k) continue;
        m.set(fingerprint(k), { rootId: rid, keyHex: k, isCurrent: i === 0 });
      }
    }
    return m;
  };

  const buildAad = (fp) => Buffer.from(`${ENVELOPE_TYPE}|v${ENVELOPE_VERSION}|${fp}`, 'utf8');

  const encryptWithKey = (plaintext, kHex, aad) => {
    const key = Buffer.from(kHex, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    if (aad) cipher.setAAD(aad);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return iv.toString('hex') + tag.toString('hex') + enc.toString('hex');
  };

  const decryptWithKey = (encrypted, kHex, aad) => {
    const key = Buffer.from(kHex, 'hex');
    const iv = Buffer.from(encrypted.slice(0, 24), 'hex');
    const tag = Buffer.from(encrypted.slice(24, 56), 'hex');
    const ct = Buffer.from(encrypted.slice(56), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  };

  const isTribeMsg = (c) =>
    !!c && c.type === ENVELOPE_TYPE && c.v === ENVELOPE_VERSION && typeof c.fp === 'string' && typeof c.p === 'string';

  const wrapMsg = (body, kHex) => {
    if (!kHex) throw new Error('wrapMsg: missing key');
    const fp = fingerprint(kHex);
    const aad = buildAad(fp);
    const p = encryptWithKey(JSON.stringify(body), kHex, aad);
    return { type: ENVELOPE_TYPE, v: ENVELOPE_VERSION, fp, p };
  };

  const unwrapMsg = (envelope, fpIdx) => {
    if (!isTribeMsg(envelope)) return null;
    const aad = buildAad(envelope.fp);
    const tryKey = (rootId, keyHex) => {
      try {
        const pt = decryptWithKey(envelope.p, keyHex, aad);
        return { body: JSON.parse(pt), rootId, keyHex };
      } catch (_) { return null; }
    };
    const entry = fpIdx.get(envelope.fp);
    if (entry) {
      const r = tryKey(entry.rootId, entry.keyHex);
      if (r) return r;
      for (const [, e] of fpIdx) {
        if (e.rootId !== entry.rootId || e.keyHex === entry.keyHex) continue;
        const r2 = tryKey(e.rootId, e.keyHex);
        if (r2) return r2;
      }
      return null;
    }
    for (const [, e] of fpIdx) {
      const r = tryKey(e.rootId, e.keyHex);
      if (r) return r;
    }
    return null;
  };

  const generateInviteSalt = () => crypto.randomBytes(16).toString('hex');

  const deriveInviteKey = (code, salt) => {
    const s = (salt === undefined || salt === null || salt === '') ? INVITE_SALT_LEGACY : salt;
    return crypto.scryptSync(code, s, 32, INVITE_SCRYPT);
  };

  const hashInviteCode = (code, salt) => {
    const s = (salt === undefined || salt === null || salt === '') ? INVITE_SALT_LEGACY : salt;
    return crypto.createHmac('sha256', s).update(String(code), 'utf8').digest('hex');
  };

  const inviteAad = (code, salt) =>
    Buffer.from(`tribe-invite|v1|${hashInviteCode(code, salt)}`, 'utf8');

  const encryptForInvite = (tribeKeyHex, inviteCode, salt) => {
    const derived = deriveInviteKey(inviteCode, salt);
    return encryptWithKey(tribeKeyHex, derived.toString('hex'), inviteAad(inviteCode, salt));
  };

  const decryptFromInvite = (encryptedKey, inviteCode, salt) => {
    const derived = deriveInviteKey(inviteCode, salt);
    return decryptWithKey(encryptedKey, derived.toString('hex'), inviteAad(inviteCode, salt));
  };

  const encryptChainForInvite = (ancestryRootIds, code, salt) => {
    const chain = ancestryRootIds.map(rid => ({ rootId: rid, keys: getKeys(rid), gen: getGen(rid) }));
    if (chain.some(e => !Array.isArray(e.keys) || !e.keys.length)) return null;
    const k = deriveInviteKey(code, salt);
    return encryptWithKey(JSON.stringify(chain), k.toString('hex'), inviteAad(code, salt));
  };

  const decryptChainFromInvite = (encryptedPayload, code, salt) => {
    const k = deriveInviteKey(code, salt);
    try {
      const json = decryptWithKey(encryptedPayload, k.toString('hex'), inviteAad(code, salt));
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed) && parsed.every(e => e && e.rootId && Array.isArray(e.keys) && e.keys.length)) {
        return parsed.map(e => ({
          rootId: e.rootId,
          keys: e.keys.slice(),
          key: e.keys[0],
          gen: e.gen || e.keys.length
        }));
      }
    } catch (_) {}
    return null;
  };

  const inviteMatchesCode = (inv, code) => {
    if (!inv || typeof inv !== 'object' || !inv.codeHash) return false;
    return inv.codeHash === hashInviteCode(code, inv.salt);
  };

  const buildKeyDistribPayload = (rootId, keys, gen) => ({
    type: KEY_DISTRIB_TYPE,
    rootId,
    keys: Array.isArray(keys) ? keys.slice() : [],
    gen: gen || (Array.isArray(keys) ? keys.length : 1),
    distributedAt: new Date().toISOString()
  });

  const isKeyDistribContent = (decoded) =>
    !!decoded && decoded.type === KEY_DISTRIB_TYPE && typeof decoded.rootId === 'string' &&
    Array.isArray(decoded.keys) && decoded.keys.length > 0;

  const tryUnboxKeyDistrib = (rawContent, localKeypair, ssbKeys) => {
    if (typeof rawContent !== 'string' || !rawContent.endsWith('.box')) return null;
    let decoded;
    try { decoded = ssbKeys.unbox(rawContent, localKeypair); } catch (_) { return null; }
    if (!decoded) return null;
    if (typeof decoded === 'string') {
      try { decoded = JSON.parse(decoded); } catch (_) { return null; }
    }
    return isKeyDistribContent(decoded) ? decoded : null;
  };

  const boxKeyForMember = (tribeKeyHex, memberFeedId, ssbKeys) =>
    ssbKeys.box(tribeKeyHex, [memberFeedId]);

  const unboxKeyFromMember = (boxed, localKeypair, ssbKeys) =>
    ssbKeys.unbox(boxed, localKeypair);

  const canonicalAad = (envelope) => {
    if (!envelope) return null;
    const fields = ['type', 'tribeId', 'contentType', 'replaces', 'author', 'createdAt'];
    const obj = {};
    for (const f of fields) if (envelope[f] !== undefined && envelope[f] !== null) obj[f] = envelope[f];
    return Buffer.from(JSON.stringify(obj), 'utf8');
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
    if (!content || !content.encryptedPayload) return content;
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
      } catch (_) {}
    }
    return { ...content, _undecryptable: true };
  };

  const buildKeyChainSets = (ancestryRootIds) => {
    if (!Array.isArray(ancestryRootIds) || ancestryRootIds.length === 0) return [];
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
    for (const rid of ancestryIds) {
      const k = getKey(rid);
      if (!k) return null;
      chain.push(k);
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
    if (!content) return content;
    if (isTribeMsg(content)) {
      const fpIdx = buildFingerprintIndex();
      const r = unwrapMsg(content, fpIdx);
      if (!r) return { ...content, _undecryptable: true };
      return { ...r.body, _decrypted: true };
    }
    if (!content.encryptedPayload) return content;
    const tid = content.tribeId;
    if (tid && tribesModel) {
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
      if (!content || !content.tribeId || !tribesModel) return content;
      try {
        const rootId = await tribesModel.getRootId(content.tribeId);
        const key = getKey(rootId);
        if (!key) return content;
        const body = { k: content.type, ...content };
        return wrapMsg(body, key);
      } catch (_) {
        return content;
      }
    },
    async decryptIfTribe(content) {
      if (!content || !tribesModel) return content;
      if (isTribeMsg(content)) {
        const fpIdx = buildFingerprintIndex();
        const r = unwrapMsg(content, fpIdx);
        if (!r) return { ...content, _undecryptable: true };
        const flat = { ...r.body, _decrypted: true, _rootId: r.rootId };
        if (r.body.k === 'tombstone') flat.type = 'tombstone';
        else if (r.body.k && !flat.type) flat.type = r.body.k;
        delete flat.k;
        return flat;
      }
      if (!content.encryptedPayload) return content;
      return await decryptFromTribe(content, tribesModel);
    },
    assertReadable(decrypted, what) {
      if (decrypted && decrypted._undecryptable) throw new Error(`${what} is tribe-encrypted and cannot be decrypted with available keys`);
    },
    async decryptIndexNodes(idx) {
      if (!tribesModel) return;
      for (const [k, n] of idx.nodes.entries()) {
        if (!n.c) continue;
        if (!n.c.encryptedPayload && !isTribeMsg(n.c)) continue;
        const dec = await decryptFromTribe(n.c, tribesModel);
        if (dec && !dec._undecryptable) {
          idx.nodes.set(k, { ...n, c: { ...dec, _decrypted: true } });
        } else {
          idx.nodes.set(k, { ...n, c: { ...n.c, _decrypted: false } });
        }
      }
    },
    unwrapMessagesForKind(messages, kindOrKinds) {
      const kinds = Array.isArray(kindOrKinds) ? kindOrKinds : [kindOrKinds];
      const kSet = new Set(kinds);
      const fpIdx = buildFingerprintIndex();
      const out = [];
      for (const m of messages) {
        const c = m && m.value && m.value.content;
        if (!c) continue;
        if (!isTribeMsg(c)) { out.push(m); continue; }
        const r = unwrapMsg(c, fpIdx);
        if (!r || !r.body) continue;
        const inner = r.body;
        if (inner.k === 'tombstone' && inner.target) {
          const flat = { type: 'tombstone', target: inner.target, deletedAt: inner.deletedAt, author: inner.author };
          out.push({ ...m, value: { ...m.value, content: flat } });
        } else if (kSet.has(inner.k)) {
          const flat = { ...inner, type: inner.k, _decrypted: true, _rootId: r.rootId };
          delete flat.k;
          out.push({ ...m, value: { ...m.value, content: flat } });
        }
      }
      return out;
    },
    async encryptTombstone(target, tribeId, author) {
      const tombstone = { type: 'tombstone', target, deletedAt: new Date().toISOString(), author };
      if (!tribeId || !tribesModel) return tombstone;
      try {
        const rootId = await tribesModel.getRootId(tribeId);
        const key = getKey(rootId);
        if (!key) return tombstone;
        return wrapMsg({ k: 'tombstone', target, deletedAt: tombstone.deletedAt, author }, key);
      } catch (_) {
        return tombstone;
      }
    }
  });

  loadKeyring();

  return {
    SENSITIVE_FIELDS, ENVELOPE_PRESERVE,
    ENVELOPE_TYPE, ENVELOPE_VERSION, KEY_DISTRIB_TYPE, KEY_DISTRIB_BATCH,
    loadKeyring, saveKeyring,
    generateTribeKey, getKey, getKeys, getGen, getAllRootIds,
    setKey, setKeys, mergeKeys, addNewKey, dropKey,
    fingerprint, buildFingerprintIndex,
    isTribeMsg, wrapMsg, unwrapMsg,
    encryptWithKey, decryptWithKey,
    generateInviteSalt, hashInviteCode, deriveInviteKey,
    encryptForInvite, decryptFromInvite,
    encryptChainForInvite, decryptChainFromInvite, inviteMatchesCode,
    buildKeyDistribPayload, isKeyDistribContent, tryUnboxKeyDistrib,
    boxKeyForMember, unboxKeyFromMember,
    canonicalAad, encryptChain, decryptChain,
    encryptContent, decryptContent,
    buildKeyChainSets, resolveKeyChain, resolveKeyChainSets,
    encryptForTribe, decryptFromTribe,
    createHelpers
  };
};
