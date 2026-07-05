const pull = require('../server/node_modules/pull-stream');
const crypto = require('crypto');
const { getConfig } = require('../configs/config-manager.js');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler, tribeCrypto, forumCrypto }) => {
  let ssb, userId;
  const ownCrypto = forumCrypto || tribeCrypto;
  const lookupKey = (rid) => (ownCrypto && ownCrypto.getKey(rid)) || (tribeCrypto && tribeCrypto.getKey(rid)) || null;

  const decryptForumContent = (rawContent, rootId) => {
    if (!rawContent) return rawContent;
    if (!rawContent.encryptedPayload) return rawContent;
    if (!ownCrypto || !tribeCrypto) return { ...rawContent, _undecryptable: true };
    let keys = (rootId && ownCrypto.getKeys && ownCrypto.getKeys(rootId)) || [];
    if (!keys.length && typeof ownCrypto.getAllRootIds === 'function') {
      const seen = new Set();
      for (const rid of ownCrypto.getAllRootIds()) {
        const ks = ownCrypto.getKeys(rid) || [];
        for (const k of ks) if (!seen.has(k)) { seen.add(k); keys.push(k); }
      }
    }
    if (!keys.length) return { ...rawContent, _undecryptable: true };
    const dec = tribeCrypto.decryptContent(rawContent, keys.map(k => [k]));
    if (!dec || dec._undecryptable) return { ...rawContent, _undecryptable: true };
    return { ...dec, _decrypted: true };
  };

  const ingestOwnTribeKeys = async () => {
    if (!ownCrypto) return;
    try {
      const ssbClient = await openSsb();
      const ssbKeys = require('../server/node_modules/ssb-keys');
      const cfg = require('../server/ssb_config');
      const msgs = await new Promise((res, rej) =>
        pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((e, m) => e ? rej(e) : res(m)))
      );
      for (const m of msgs) {
        const c = m.value && m.value.content;
        if (!c || c.type !== 'tribe-keys') continue;
        const memberKeys = c.memberKeys;
        if (!memberKeys || typeof memberKeys !== 'object') continue;
        const boxed = memberKeys[ssbClient.id];
        if (!boxed) continue;
        try {
          const unboxed = ssbKeys.unbox(boxed, cfg.keys);
          const key = typeof unboxed === 'string' ? unboxed : (unboxed && unboxed.toString ? unboxed.toString() : null);
          if (key && c.tribeId) ownCrypto.addNewKey(c.tribeId, key);
        } catch (_) {}
      }
    } catch (_) {}
  };

  const openSsb = async () => {
    if (!ssb) {
      ssb = await cooler.open();
      userId = ssb.id;
    }
    return ssb;
  };

  const readForumLog = async () => {
    const ssbClient = await openSsb();
    return new Promise((res, rej) => pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((e, m) => e ? rej(e) : res(m || []))));
  };

  const scanForumOpenInvite = async (forumId) => {
    const messages = await readForumLog();
    const markerTomb = new Set();
    const invTomb = new Set();
    for (const m of messages) {
      const c = m.value && m.value.content;
      if (!c) continue;
      if (c.type === 'forum-open-invite-tombstone' && typeof c.target === 'string') markerTomb.add(c.target);
      if (c.type === 'forum-invite-tombstone' && typeof c.target === 'string') invTomb.add(c.target);
    }
    let best = null;
    for (const m of messages) {
      const c = m.value && m.value.content;
      if (!c || c.type !== 'forum-open-invite' || c.v !== 1) continue;
      if (c.target !== forumId || typeof c.code !== 'string') continue;
      if (markerTomb.has(m.key)) continue;
      if (c.inviteKey && invTomb.has(c.inviteKey)) continue;
      const ts = (m.value && m.value.timestamp) || 0;
      if (!best || ts > best.ts) best = { code: c.code, by: c.by || m.value.author, markerKey: m.key, inviteKey: c.inviteKey || null, ts };
    }
    return best;
  };

  async function collectTombstones(ssbClient) {
    return new Promise((resolve, reject) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => err ? reject(err) : resolve(buildValidatedTombstoneSet(msgs)))
      );
    });
  }

  async function findActiveVote(ssbClient, targetId, voter) {
    const tombstoned = await collectTombstones(ssbClient);
    return new Promise((resolve, reject) => {
      pull(
        ssbClient.links({ source: voter, dest: targetId, rel: 'vote', values: true, keys: true }),
        pull.filter(link => !tombstoned.has(link.key)),
        pull.collect((err, links) => err ? reject(err) : resolve(links))
      );
    });
  }

  async function aggregateVotes(ssbClient, targetId) {
    const tombstoned = await collectTombstones(ssbClient);
    return new Promise((resolve, reject) => {
      let positives = 0, negatives = 0;
      pull(
        ssbClient.links({ source: null, dest: targetId, rel: 'vote', values: true, keys: true }),
        pull.filter(link => link.value.content?.vote && !tombstoned.has(link.key)),
        pull.drain(
          link => link.value.content.vote.value > 0 ? positives++ : negatives++,
          err => err ? reject(err) : resolve({ positives, negatives })
        )
      );
    });
  }

  function nestReplies(flat) {
    const lookup = new Map();
    const roots = [];
    for (const msg of flat) {
      msg.children = [];
      lookup.set(msg.key, msg);
    }
    for (const msg of flat) {
      if (msg.parent && lookup.has(msg.parent)) {
        lookup.get(msg.parent).children.push(msg);
      } else {
        roots.push(msg);
      }
    }
    return roots;
  }

  async function getMessageById(id) {
    const ssbClient = await openSsb();
    const msgs = await new Promise((res, rej) =>
      pull(ssbClient.createLogStream({ limit: logLimit }), 
      pull.collect((err, data) => err ? rej(err) : res(data)))
    );
    const msg = msgs.find(m => m.key === id && m.value.content?.type === 'forum');
    if (!msg) throw new Error('Message not found');
    return { key: msg.key, ...msg.value.content, timestamp: msg.value.timestamp };
  }

  return {
    ingestKeys: async () => { await ingestOwnTribeKeys(); },

    createForum: async (category, title, text, isPrivate = false) => {
      const ssbClient = await openSsb();
      const isPrivateFlag = isPrivate === true || isPrivate === 'true' || isPrivate === 'on';
      const plainContent = {
        type: 'forum',
        category,
        title,
        text,
        createdAt: new Date().toISOString(),
        author: userId,
        votes: { positives: 0, negatives: 0 },
        votes_inhabitants: [],
        isPrivate: isPrivateFlag
      };
      let content = plainContent;
      let forumKey = null;
      if (isPrivateFlag && ownCrypto && tribeCrypto) {
        forumKey = ownCrypto.generateTribeKey();
        content = tribeCrypto.encryptContent(plainContent, [forumKey], true);
      }
      const result = await new Promise((resolve, reject) =>
        ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res))
      );
      if (forumKey) {
        ownCrypto.setKey(result.key, forumKey, 1);
        try {
          const ssbKeys = require('../server/node_modules/ssb-keys');
          const memberKeys = { [userId]: tribeCrypto.boxKeyForMember(forumKey, userId, ssbKeys) };
          await new Promise((resolve) => {
            ssbClient.publish({ type: 'tribe-keys', tribeId: result.key, generation: 1, memberKeys }, () => resolve());
          });
        } catch (_) {}
      }
      return { key: result.key, ...plainContent };
    },

    addMessageToForum: async (forumId, message, parentId = null) => {
      const ssbClient = await openSsb();
      const rawRoot = await new Promise((res, rej) => ssbClient.get(forumId, (e, m) => e ? rej(e) : res(m)));
      const rootRaw = rawRoot && rawRoot.content;
      const rootDec = rootRaw && rootRaw.encryptedPayload
        ? decryptForumContent(rootRaw, forumId)
        : rootRaw;
      const isPrivate = rootDec && rootDec.isPrivate === true;
      let content = {
        ...message,
        root: forumId,
        type: 'forum',
        author: userId,
        timestamp: new Date().toISOString(),
        votes: { positives: 0, negatives: 0 },
        votes_inhabitants: []
      };
      if (parentId) content.branch = parentId;
      if (isPrivate && ownCrypto && tribeCrypto) {
        const key = lookupKey(forumId);
        if (!key) throw new Error('Missing forum key — cannot reply to encrypted forum');
        content = tribeCrypto.encryptContent(content, [key], true);
      }
      return new Promise((resolve, reject) =>
        ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res))
      );
    },

    generateInvite: async (forumId) => {
      if (!ownCrypto || !tribeCrypto) throw new Error('Forum crypto unavailable');
      const ssbClient = await openSsb();
      const rawRoot = await new Promise((res, rej) => ssbClient.get(forumId, (e, m) => e ? rej(e) : res(m)));
      if (!rawRoot || !rawRoot.content) throw new Error('Forum not found');
      const rawC = rawRoot.content;
      const dec = rawC && rawC.encryptedPayload ? decryptForumContent(rawC, forumId) : rawC;
      if (dec && dec._undecryptable) throw new Error('Forum is encrypted and cannot be decrypted');
      if (dec.author !== userId) throw new Error('Only the author can generate invites');
      if (dec.isPrivate !== true) throw new Error('Only private forums use invitation codes');
      const key = lookupKey(forumId);
      if (!key) throw new Error('Missing forum key');
      const code = crypto.randomBytes(16).toString('hex');
      const inviteSalt = tribeCrypto.generateInviteSalt();
      const ek = tribeCrypto.encryptForInvite(key, code, inviteSalt);
      await new Promise((resolve, reject) => {
        ssbClient.publish({ type: 'forum-invite', target: forumId, ek, salt: inviteSalt, codeHash: tribeCrypto.hashInviteCode(code, inviteSalt) }, (err) => err ? reject(err) : resolve());
      });
      return { code, forumId };
    },

    getOpenInvite: async (forumId) => {
      const rec = await scanForumOpenInvite(forumId);
      return rec ? { code: rec.code, by: rec.by, markerKey: rec.markerKey, inviteKey: rec.inviteKey } : null;
    },

    generateOpenInvite: async (forumId) => {
      if (!ownCrypto || !tribeCrypto) throw new Error('Forum crypto unavailable');
      const ssbClient = await openSsb();
      const rawRoot = await new Promise((res, rej) => ssbClient.get(forumId, (e, m) => e ? rej(e) : res(m)));
      if (!rawRoot || !rawRoot.content) throw new Error('Forum not found');
      const rawC = rawRoot.content;
      const dec = rawC && rawC.encryptedPayload ? decryptForumContent(rawC, forumId) : rawC;
      if (dec && dec._undecryptable) throw new Error('Forum is encrypted and cannot be decrypted');
      if (dec.author !== userId) throw new Error('Only the author can generate invites');
      if (dec.isPrivate !== true) throw new Error('Only private forums use invitation codes');
      if (await scanForumOpenInvite(forumId)) throw new Error('An open invitation already exists');
      const key = lookupKey(forumId);
      if (!key) throw new Error('Missing forum key');
      const code = crypto.randomBytes(16).toString('hex');
      const inviteSalt = tribeCrypto.generateInviteSalt();
      const ek = tribeCrypto.encryptForInvite(key, code, inviteSalt);
      const invitePub = await new Promise((resolve, reject) => {
        ssbClient.publish({ type: 'forum-invite', target: forumId, ek, salt: inviteSalt, codeHash: tribeCrypto.hashInviteCode(code, inviteSalt), multi: 1 }, (err, r) => err ? reject(err) : resolve(r));
      });
      await new Promise((resolve, reject) => {
        ssbClient.publish({ type: 'forum-open-invite', v: 1, target: forumId, code, inviteKey: invitePub.key, by: userId, createdAt: new Date().toISOString() }, (err) => err ? reject(err) : resolve());
      });
      return { code, forumId };
    },

    removeOpenInvite: async (forumId) => {
      const ssbClient = await openSsb();
      const rec = await scanForumOpenInvite(forumId);
      if (!rec) return;
      let author = null;
      try {
        const rawRoot = await new Promise((res, rej) => ssbClient.get(forumId, (e, m) => e ? rej(e) : res(m)));
        const rawC = rawRoot && rawRoot.content;
        const dec = rawC && rawC.encryptedPayload ? decryptForumContent(rawC, forumId) : rawC;
        author = dec && dec.author;
      } catch (_) {}
      if (rec.by !== userId && author !== userId) throw new Error('Not allowed to remove this invitation');
      await new Promise((resolve, reject) => ssbClient.publish({ type: 'forum-open-invite-tombstone', target: rec.markerKey, ts: new Date().toISOString() }, (err) => err ? reject(err) : resolve()));
      if (rec.inviteKey) await new Promise((resolve, reject) => ssbClient.publish({ type: 'forum-invite-tombstone', target: rec.inviteKey, ts: new Date().toISOString() }, (err) => err ? reject(err) : resolve()));
    },

    joinByInvite: async (code) => {
      if (!ownCrypto || !tribeCrypto) throw new Error('Forum crypto unavailable');
      const ssbClient = await openSsb();
      const messages = await new Promise((res, rej) =>
        pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((e, m) => e ? rej(e) : res(m)))
      );
      const invTomb = new Set();
      for (const m of messages) {
        const c = m.value && m.value.content;
        if (c && c.type === 'forum-invite-tombstone' && typeof c.target === 'string') invTomb.add(c.target);
      }
      let matched = null;
      for (const m of messages) {
        const c = m.value && m.value.content;
        if (!c || c.type !== 'forum-invite') continue;
        if (invTomb.has(m.key)) continue;
        try {
          const hash = tribeCrypto.hashInviteCode(code, c.salt);
          if (hash === c.codeHash) { matched = c; break; }
        } catch (_) {}
      }
      if (!matched) throw new Error('Invalid or expired invite code');
      const forumKey = tribeCrypto.decryptFromInvite(matched.ek, code, matched.salt);
      if (!forumKey) throw new Error('Could not decrypt invite');
      ownCrypto.addNewKey(matched.target, forumKey);
      return { ok: true, forumId: matched.target };
    },

    voteContent: async (targetId, value) => {
      const ssbClient = await openSsb();
      const whoami = await new Promise((res, rej) =>
        ssbClient.whoami((err, info) => err ? rej(err) : res(info))
      );
      const voter = whoami.id;
      const newVal = parseInt(value, 10);
      const existing = await findActiveVote(ssbClient, targetId, voter);
      if (existing.length > 0) {
        const prev = existing[0].value.content.vote.value;
        if (prev === newVal) return existing[0];
        await new Promise((resolve, reject) =>
          ssbClient.publish(
            { type: 'tombstone', target: existing[0].key, timestamp: new Date().toISOString(), author: voter },
            err => err ? reject(err) : resolve()
          )
        );
      }
      return new Promise((resolve, reject) =>
        ssbClient.publish(
          {
            type: 'vote',
            vote: { link: targetId, value: newVal },
            timestamp: new Date().toISOString(),
            author: voter
          },
          (err, result) => err ? reject(err) : resolve(result)
        )
      );
    },

    deleteForumById: async id => {
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) =>
        ssbClient.publish(
          { type: 'tombstone', target: id, timestamp: new Date().toISOString(), author: userId },
          (err, res) => err ? reject(err) : resolve(res)
        )
      );
    },

    listAll: async filter => {
      const ssbClient = await openSsb();
      const msgs = await new Promise((res, rej) =>
        pull(ssbClient.createLogStream({ limit: logLimit }), 
        pull.collect((err, data) => err ? rej(err) : res(data)))
      );
      const deleted = buildValidatedTombstoneSet(msgs);
      const decode = (m) => {
        const c = m.value && m.value.content;
        if (!c) return null;
        if (c.encryptedPayload) {
          const dec = decryptForumContent(c, m.value.content.root || m.key);
          return (dec && !dec._undecryptable) ? dec : null;
        }
        return c;
      };
      const forums = msgs
        .map(m => ({ m, c: decode(m) }))
        .filter(({ m, c }) => c && c.type === 'forum' && !c.root && !deleted.has(m.key))
        .map(({ m, c }) => ({ ...c, key: m.key }));
      const forumsWithVotes = await Promise.all(
        forums.map(async f => {
          const { positives, negatives } = await aggregateVotes(ssbClient, f.key);
          return { ...f, positiveVotes: positives, negativeVotes: negatives };
        })
      );
      const repliesByRoot = {};
      msgs.forEach(m => {
        const cRaw = m.value && m.value.content;
        if (!cRaw) return;
        const root = cRaw.encryptedPayload ? null : cRaw.root;
        if (!root) {
          if (!cRaw.encryptedPayload) return;
          const decReply = decryptForumContent(cRaw, null);
          if (!decReply || decReply._undecryptable || decReply.type !== 'forum' || !decReply.root) return;
          if (deleted.has(m.key)) return;
          repliesByRoot[decReply.root] = repliesByRoot[decReply.root] || [];
          repliesByRoot[decReply.root].push({ key: m.key, text: decReply.text, author: decReply.author, timestamp: m.value.timestamp });
          return;
        }
        if (cRaw.type === 'forum' && root && !deleted.has(m.key)) {
          repliesByRoot[root] = repliesByRoot[root] || [];
          repliesByRoot[root].push({ key: m.key, text: cRaw.text, author: cRaw.author, timestamp: m.value.timestamp });
        }
      });
      const final = await Promise.all(
        forumsWithVotes.map(async f => {
          const replies = repliesByRoot[f.key] || [];
          for (let r of replies) {
            const { positives: rp, negatives: rn } = await aggregateVotes(ssbClient, r.key);
            r.positiveVotes = rp;
            r.negativeVotes = rn;
            r.score = rp - rn;
          }
          const replyPos = replies.reduce((sum, r) => sum + (r.positiveVotes || 0), 0);
          const replyNeg = replies.reduce((sum, r) => sum + (r.negativeVotes || 0), 0);
          const positiveVotes = f.positiveVotes + replyPos;
          const negativeVotes = f.negativeVotes + replyNeg;
          const score = positiveVotes - negativeVotes;
          const participants = new Set(replies.map(r => r.author).concat(f.author));
          const messagesCount = replies.length + 1;
          const lastMessage =
            replies.length
              ? replies.reduce((a, b) => (new Date(a.timestamp) > new Date(b.timestamp) ? a : b))
              : null;
          return {
            ...f,
            positiveVotes,
            negativeVotes,
            score,
            participants: Array.from(participants),
            messagesCount,
            lastMessage,
            messages: replies
          };
        })
      );
      const filtered =
        filter === 'mine'
          ? final.filter(f => f.author === userId)
          : filter === 'recent'
          ? final.filter(f => new Date(f.createdAt).getTime() >= Date.now() - 86400000)
          : final;
      return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    getForumById: async id => {
      const ssbClient = await openSsb();
      const msgs = await new Promise((res, rej) =>
        pull(ssbClient.createLogStream({ limit: logLimit }), 
        pull.collect((err, data) => err ? rej(err) : res(data)))
      );
      const deleted = buildValidatedTombstoneSet(msgs);
      const original = msgs.find(m => m.key === id && !deleted.has(m.key));
      if (!original || original.value.content?.type !== 'forum') throw new Error('Forum not found');
      const rawBase = original.value.content;
      const base = rawBase.encryptedPayload ? decryptForumContent(rawBase, id) : rawBase;
      if (base && base._undecryptable) throw new Error('Forum is encrypted and cannot be decrypted with available keys');
      const { positives, negatives } = await aggregateVotes(ssbClient, id);
      const replyAuthors = [];
      for (const m of msgs) {
        if (deleted.has(m.key)) continue;
        const cRaw = m.value && m.value.content;
        if (!cRaw) continue;
        let rc = cRaw;
        if (cRaw.encryptedPayload) {
          const dec = decryptForumContent(cRaw, id);
          if (!dec || dec._undecryptable) continue;
          rc = dec;
        }
        if (rc.type === 'forum' && rc.root === id) replyAuthors.push(rc.author);
      }
      const participants = Array.from(new Set(replyAuthors.concat(base.author).filter(Boolean)));
      return {
        ...base,
        key: id,
        positiveVotes: positives,
        negativeVotes: negatives,
        score: positives - negatives,
        participants
      };
    },

    getMessagesByForumId: async forumId => {
      const ssbClient = await openSsb();
      const msgs = await new Promise((res, rej) =>
        pull(ssbClient.createLogStream({ limit: logLimit }), 
        pull.collect((err, data) => err ? rej(err) : res(data)))
      );
      const deleted = buildValidatedTombstoneSet(msgs);
      const decodeReply = (m) => {
        const c = m.value && m.value.content;
        if (!c || c.type !== 'forum') return null;
        if (c.encryptedPayload) {
          const dec = decryptForumContent(c, forumId);
          if (!dec || dec._undecryptable || dec.root !== forumId) return null;
          return { c: dec, m };
        }
        if (c.root !== forumId) return null;
        return { c, m };
      };
      const replies = msgs
        .map(decodeReply)
        .filter(r => r && !deleted.has(r.m.key))
        .map(({ c, m }) => ({
          key: m.key,
          text: c.text,
          author: c.author,
          timestamp: m.value.timestamp,
          parent: c.branch || null
        }));
      for (let r of replies) {
        const { positives: rp, negatives: rn } = await aggregateVotes(ssbClient, r.key);
        r.positiveVotes = rp;
        r.negativeVotes = rn;
        r.score = rp - rn;
      }
      const { positives: p, negatives: n } = await aggregateVotes(ssbClient, forumId);
      const replyPos = replies.reduce((sum, r) => sum + (r.positiveVotes || 0), 0);
      const replyNeg = replies.reduce((sum, r) => sum + (r.negativeVotes || 0), 0);
      const positiveVotes = p + replyPos;
      const negativeVotes = n + replyNeg;
      const totalScore = positiveVotes - negativeVotes;
      return {
        messages: nestReplies(replies),
        total: replies.length,
        positiveVotes,
        negativeVotes,
        totalScore
      };
    },

    getMessageById
  };
};

