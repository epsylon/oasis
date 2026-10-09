const pull = require('../server/node_modules/pull-stream');
const crypto = require('crypto');
const { getConfig } = require('../configs/config-manager.js');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const logLimit = getConfig().ssbLogStream?.limit || 1000;
const tribeLogLimit = Math.max(logLimit, 100000);
const { readTyped } = require('./typed_log');
const TRIBE_LOG_TYPES = ['tribe', 'tribe-msg', 'tribe-keys-distrib', 'tribe-invite-msg', 'tribe-invite-tombstone', 'tribe-open-invite-tombstone', 'tombstone', 'contact'];

const INVITE_CODE_BYTES = 16;
const VALID_INVITE_MODES = ['strict', 'open'];

const STRUCTURAL_FIELDS = ['title', 'description', 'image', 'location', 'tags', 'isAnonymous', 'inviteMode', 'status', 'parentTribeId', 'mapUrl'];

module.exports = ({ cooler, tribeCrypto }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  let tribeIndex = null;
  let tribeIndexTs = 0;

  const arraysEqual = (a, b) => {
    const aa = Array.isArray(a) ? a : [];
    const bb = Array.isArray(b) ? b : [];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
    return true;
  };

  const validMembershipDelta = (prev, next, author, selfJoinOk = () => true) => {
    const a = Array.isArray(prev) ? prev : [];
    const b = Array.isArray(next) ? next : [];
    const added = b.filter(m => !a.includes(m));
    const removed = a.filter(m => !b.includes(m));
    if (added.length === 0 && removed.length === 0) return true;
    if (added.length === 1 && removed.length === 0 && added[0] === author) return selfJoinOk() === true;
    if (removed.length === 1 && added.length === 0 && removed[0] === author) return true;
    return false;
  };

  const validInvitesDelta = (prev, next, author, rootAuthor) => {
    if (author === rootAuthor) return true;
    const prevHashes = new Set((prev || []).map(i => i && i.codeHash).filter(Boolean));
    const nextHashes = new Set((next || []).map(i => i && i.codeHash).filter(Boolean));
    for (const h of nextHashes) if (!prevHashes.has(h)) return false;
    return true;
  };

  const structuralFieldsEqual = (a, b) => {
    for (const f of STRUCTURAL_FIELDS) {
      const x = a[f];
      const y = b[f];
      if (Array.isArray(x) || Array.isArray(y)) { if (!arraysEqual(x, y)) return false; continue; }
      if (x !== y && !(x == null && y == null)) return false;
    }
    return true;
  };

  const streamLog = async () => {
    const client = await openSsb();
    return readTyped(client, TRIBE_LOG_TYPES, { limit: tribeLogLimit });
  };
  const readKeyDistribs = async () => {
    const client = await openSsb();
    const ssbKeys = require('../server/node_modules/ssb-keys');
    const config = require('../server/ssb_config');
    const msgs = await readTyped(client, TRIBE_LOG_TYPES, { limit: tribeLogLimit, withPrivate: true });
    const out = [];
    for (const m of msgs) {
      const v = m && m.value;
      if (!v) continue;
      const c = v.content;
      const dec = (c && typeof c === 'object') ? (v.private === true && tribeCrypto.isKeyDistribContent(c) ? c : null) : tribeCrypto.tryUnboxKeyDistrib(c, config.keys, ssbKeys);
      if (dec) out.push({ m, dec });
    }
    return { msgs, distribs: out };
  };

  const buildTribeIndex = async () => {
    subscribeInvalidation().catch(() => {});
    if (tribeIndex && Date.now() - tribeIndexTs < 5000) return tribeIndex;
    const fpIdx = tribeCrypto.buildFingerprintIndex();
    const msgs = await streamLog();

    const tribeMsgs = new Map();
    const tombstones = new Map();
    const inviteAuthorByCh = new Map();
    const inviteAuthorByKey = new Map();
    const inviteTombstonesByAuthor = new Map();

    for (const m of msgs) {
      const c = m.value && m.value.content;
      if (!c) continue;
      const author = m.value.author;
      const ts = m.value.timestamp;
      if (c.type === 'tribe-invite-msg' && typeof c.ch === 'string') { inviteAuthorByCh.set(c.ch, author); inviteAuthorByKey.set(m.key, author); continue; }
      if (c.type === 'tribe-invite-tombstone' && typeof c.target === 'string') {
        if (!inviteTombstonesByAuthor.has(author)) inviteTombstonesByAuthor.set(author, new Set());
        inviteTombstonesByAuthor.get(author).add(c.target);
        continue;
      }

      let body = null;
      if (tribeCrypto.isTribeMsg(c)) {
        const r = tribeCrypto.unwrapMsg(c, fpIdx);
        if (!r || !r.body || !r.body.k) continue;
        body = r.body;
      } else if (c.type === 'tribe' && typeof c === 'object') {
        body = {
          k: 'tribe',
          op: c.op || (c.replaces ? 'update' : 'create'),
          rootId: c.rootId || null,
          replaces: c.replaces || null,
          title: c.title,
          description: c.description,
          image: c.image,
          location: c.location,
          tags: c.tags,
          isAnonymous: c.isAnonymous,
          members: c.members,
          invites: c.invites,
          inviteMode: c.inviteMode,
          status: c.status,
          parentTribeId: c.parentTribeId,
          mapUrl: c.mapUrl,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          author: c.author,
          joinedWith: typeof c.joinedWith === 'string' ? c.joinedWith : undefined,
          removedSeqs: c.removedSeqs && typeof c.removedSeqs === 'object' ? c.removedSeqs : undefined
        };
      } else if (c.type === 'tombstone' && c.target) {
        tombstones.set(c.target, { author, ts });
        continue;
      } else {
        continue;
      }

      if (body.k === 'tombstone' && body.target) {
        tombstones.set(body.target, { author, ts });
        continue;
      }
      if (body.k === 'tribe') {
        tribeMsgs.set(m.key, {
          id: m.key,
          rootId: body.rootId || null,
          replaces: body.replaces || null,
          op: body.op || (body.rootId ? 'update' : 'create'),
          content: body,
          author,
          seq: (m.value && m.value.sequence) || 0,
          _ts: ts
        });
      }
    }

    const tribes = new Map();
    const parent = new Map();
    const child = new Map();
    const rootByTip = new Map();

    for (const [k, entry] of tribeMsgs.entries()) {
      if (!entry.replaces) {
        tribes.set(k, entry);
        rootByTip.set(k, k);
      }
    }

    const byReplaces = new Map();
    for (const [k, entry] of tribeMsgs.entries()) {
      if (!entry.replaces) continue;
      if (!byReplaces.has(entry.replaces)) byReplaces.set(entry.replaces, []);
      byReplaces.get(entry.replaces).push([k, entry]);
    }
    const queue = [...tribes.keys()];
    for (let qi = 0; qi < queue.length; qi++) {
      const replaces = queue[qi];
      if (child.has(replaces)) continue;
      const parentEntry = tribes.get(replaces);
      const root = rootByTip.get(replaces);
      const rootEntry = tribes.get(root);
      const rootAuthor = rootEntry && rootEntry.author;
      const prevMembers = Array.isArray(parentEntry.content.members) ? parentEntry.content.members : [];
      const candidates = [];
      for (const [k, entry] of (byReplaces.get(replaces) || [])) {
        if (tribes.has(k)) continue;
        const isRootAuthor = entry.author === rootAuthor;
        if (!isRootAuthor) {
          if (!prevMembers.includes(entry.author) && !(entry.content.members || []).includes(entry.author)) continue;
          const mode = String(parentEntry.content.inviteMode || (rootEntry && rootEntry.content.inviteMode) || 'strict');
          const inviterOk = (inviter) => !!inviter && (inviter === rootAuthor || (mode === 'open' && prevMembers.includes(inviter)));
          const selfJoinOk = () => {
            const proof = entry.content.joinedWith;
            if (proof && inviterOk(inviteAuthorByCh.get(proof))) return true;
            const mine = inviteTombstonesByAuthor.get(entry.author);
            if (mine) for (const target of mine) if (inviterOk(inviteAuthorByKey.get(target))) return true;
            return false;
          };
          if (!validMembershipDelta(prevMembers, entry.content.members, entry.author, selfJoinOk)) continue;
          if (!validInvitesDelta(parentEntry.content.invites, entry.content.invites, entry.author, rootAuthor)) continue;
          if (!structuralFieldsEqual(parentEntry.content, entry.content)) continue;
        }
        candidates.push({ k, entry, isRootAuthor, root });
      }
      if (!candidates.length) continue;
      let winner = candidates[0];
      for (let i = 1; i < candidates.length; i++) {
        const c = candidates[i];
        if (c.isRootAuthor && !winner.isRootAuthor) { winner = c; continue; }
        if (winner.isRootAuthor && !c.isRootAuthor) continue;
        const wt = winner.entry._ts || 0;
        const ct = c.entry._ts || 0;
        if (ct < wt) winner = c;
        else if (ct === wt && c.k < winner.k) winner = c;
      }
      parent.set(winner.k, replaces);
      child.set(replaces, winner.k);
      tribes.set(winner.k, winner.entry);
      rootByTip.set(winner.k, winner.root);
      queue.push(winner.k);
    }

    const tombstoned = new Set();
    for (const [target, t] of tombstones.entries()) {
      const e = tribes.get(target);
      if (!e) continue;
      const root = rootByTip.get(target);
      const rootAuthor = tribes.get(root) && tribes.get(root).author;
      if (t.author === rootAuthor) tombstoned.add(target);
    }

    const rootOf = (id) => rootByTip.get(id) || id;
    const tipByRoot = new Map();
    for (const k of tribes.keys()) {
      const root = rootOf(k);
      if (tipByRoot.has(root)) continue;
      let tip = root;
      while (child.has(tip)) tip = child.get(tip);
      tipByRoot.set(root, tip);
    }

    const effectivelyTombstoned = new Set(tombstoned);
    const deadMemo = new Map();
    const isDead = (k) => {
      if (tombstoned.has(k)) return true;
      if (deadMemo.has(k)) return deadMemo.get(k);
      deadMemo.set(k, false);
      const root = rootOf(k);
      let dead = tombstoned.has(tipByRoot.get(root)) || (root !== k && isDead(root));
      if (!dead) {
        const e = tribes.get(k);
        const pid = e && e.content && e.content.parentTribeId;
        if (pid) dead = isDead(rootOf(pid)) || isDead(pid);
      }
      deadMemo.set(k, dead);
      return dead;
    };
    for (const k of tribes.keys()) if (isDead(k)) effectivelyTombstoned.add(k);

    tribeIndex = { tribes, tombstoned, effectivelyTombstoned, parent, child, tipByRoot, rootByTip };
    tribeIndexTs = Date.now();
    return tribeIndex;
  };

  const subscribeInvalidation = (() => {
    let started = false;
    return async () => {
      if (started) return;
      started = true;
      try {
        const client = await openSsb();
        pull(
          client.createLogStream({ live: true, old: false }),
          pull.drain((m) => {
            const c = m && m.value && m.value.content;
            if (!c) return;
            if (typeof c === 'string' && c.endsWith('.box')) { tribeIndex = null; return; }
            if (tribeCrypto.isTribeMsg(c)) { tribeIndex = null; return; }
            if (c.type === 'tribe-invite-msg' || c.type === 'tribe-invite-tombstone') tribeIndex = null;
          }, () => { started = false; })
        );
      } catch (_) { started = false; }
    };
  })();

  const normalizeTribe = (entry) => {
    const c = entry.content;
    return {
      id: entry.id,
      title: c.title || '',
      description: c.description || '',
      image: c.image || null,
      location: c.location || null,
      tags: Array.isArray(c.tags) ? c.tags : [],
      isAnonymous: c.isAnonymous !== false,
      members: Array.isArray(c.members) ? c.members : [],
      invites: Array.isArray(c.invites) ? c.invites : [],
      inviteMode: c.inviteMode || 'strict',
      status: c.status || 'OPEN',
      parentTribeId: c.parentTribeId || null,
      mapUrl: c.mapUrl || '',
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      author: c.author || entry.author,
      _ts: entry._ts
    };
  };

  const wrapAndPublish = async (rootId, body) => {
    const client = await openSsb();
    const key = tribeCrypto.getKey(rootId);
    if (!key) throw new Error('Missing tribe key for ' + rootId);
    const envelope = tribeCrypto.wrapMsg(body, key);
    const result = await new Promise((resolve, reject) =>
      client.publish(envelope, (err, r) => err ? reject(err) : resolve(r))
    );
    tribeIndex = null;
    return result;
  };

  const scanOpenInviteMarkers = async () => {
    const msgs = await streamLog();
    const tombstoned = new Set();
    for (const m of msgs) {
      const c = m.value && m.value.content;
      if (!c) continue;
      if (c.type === 'tribe-open-invite-tombstone' && typeof c.target === 'string') tombstoned.add(c.target);
      if (c.type === 'tribe-invite-tombstone' && typeof c.target === 'string') tombstoned.add('inv:' + c.target);
    }
    const idx = await buildTribeIndex();
    const allowedMarker = (root, author) => {
      const rootEntry = idx.tribes.get(root);
      if (!rootEntry || !author) return false;
      if (author === rootEntry.author) return true;
      const tip = idx.tribes.get(idx.tipByRoot.get(root) || root) || rootEntry;
      const members = Array.isArray(tip.content.members) ? tip.content.members : [];
      return members.includes(author);
    };
    const byRoot = new Map();
    for (const m of msgs) {
      const v = m.value;
      const c = v && v.content;
      if (!c || c.type !== 'tribe-open-invite' || c.v !== 1) continue;
      if (typeof c.rootId !== 'string' || typeof c.code !== 'string') continue;
      if (tombstoned.has(m.key)) continue;
      if (c.inviteKey && tombstoned.has('inv:' + c.inviteKey)) continue;
      if (!allowedMarker(c.rootId, v.author)) continue;
      const ts = (v && v.timestamp) || 0;
      const prev = byRoot.get(c.rootId);
      if (!prev || ts > prev.ts) byRoot.set(c.rootId, { code: c.code, by: c.by || v.author, markerKey: m.key, inviteKey: c.inviteKey || null, ts });
    }
    return byRoot;
  };

  return {
    type: 'tribe',

    async createTribe(title, description, image, location, tagsRaw = [], isAnonymous = true, inviteMode = 'strict', parentTribeId = null, status = 'OPEN', mapUrl = '') {
      if (!VALID_INVITE_MODES.includes(inviteMode)) throw new Error('Invalid invite mode. Must be "strict" or "open"');
      const client = await openSsb();
      const userId = client.id;
      const blobId = image ? (String(image).trim() || null) : null;
      const tags = Array.isArray(tagsRaw)
        ? tagsRaw.filter(Boolean)
        : String(tagsRaw || '').split(',').map(t => t.trim()).filter(Boolean);

      const isPrivate = Boolean(isAnonymous);
      const newKey = tribeCrypto.generateTribeKey();
      const now = new Date().toISOString();
      const baseFields = {
        title,
        description,
        image: blobId,
        location,
        tags,
        isAnonymous: isPrivate,
        members: [userId],
        invites: [],
        inviteMode,
        status: status || 'OPEN',
        parentTribeId: parentTribeId || null,
        mapUrl: String(mapUrl || '').trim(),
        createdAt: now,
        updatedAt: now,
        author: userId
      };
      let envelope;
      if (isPrivate) {
        envelope = tribeCrypto.wrapMsg({ k: 'tribe', op: 'create', rootId: null, replaces: null, ...baseFields }, newKey);
      } else {
        envelope = { type: 'tribe', op: 'create', ...baseFields };
      }
      const result = await new Promise((resolve, reject) =>
        client.publish(envelope, (err, r) => err ? reject(err) : resolve(r))
      );
      tribeCrypto.setKey(result.key, newKey, 1);
      tribeIndex = null;
      subscribeInvalidation().catch(() => {});
      return result;
    },

    async departures(tribeId) {
      const idx = await buildTribeIndex();
      const root = idx.rootByTip.get(tribeId) || tribeId;
      const out = new Map();
      const rootAuthor = idx.tribes.get(root) && idx.tribes.get(root).author;
      let cur = root;
      let prev = null;
      let g = 0;
      while (cur && g++ < 100000) {
        const e = idx.tribes.get(cur);
        if (!e) break;
        const members = Array.isArray(e.content.members) ? e.content.members : [];
        const noted = rootAuthor && e.author === rootAuthor && e.content.removedSeqs ? e.content.removedSeqs : {};
        if (prev) for (const m of prev) if (!members.includes(m)) out.set(m, e.author === m ? { seq: e.seq || 0 } : (Number.isFinite(Number(noted[m])) && noted[m] !== null ? { seq: Number(noted[m]) } : { ts: e._ts || 0 }));
        for (const m of members) out.delete(m);
        prev = members;
        cur = idx.child.get(cur);
      }
      return out;
    },

    async getRootId(tribeId) {
      const idx = await buildTribeIndex();
      let cur = tribeId;
      while (idx.parent.has(cur)) cur = idx.parent.get(cur);
      return cur;
    },

    async getChainIds(tribeId) {
      const idx = await buildTribeIndex();
      let root = tribeId;
      while (idx.parent.has(root)) root = idx.parent.get(root);
      const ids = [root];
      let cur = root;
      while (idx.child.has(cur)) { cur = idx.child.get(cur); ids.push(cur); }
      return ids;
    },

    async getAncestryChain(tribeId) {
      const rootId = await this.getRootId(tribeId);
      let tribe;
      try { tribe = await this.getTribeById(tribeId); } catch (_) { return [rootId]; }
      const chain = [rootId];
      let cur = tribe;
      const seen = new Set([rootId]);
      while (cur && cur.parentTribeId) {
        const pRoot = await this.getRootId(cur.parentTribeId).catch(() => null);
        if (!pRoot || seen.has(pRoot)) break;
        chain.push(pRoot);
        seen.add(pRoot);
        try { cur = await this.getTribeById(cur.parentTribeId); } catch (_) { break; }
      }
      return chain;
    },

    async getTribeById(tribeId) {
      const idx = await buildTribeIndex();
      let latestId = tribeId;
      while (idx.child.has(latestId)) latestId = idx.child.get(latestId);
      if (idx.tombstoned.has(latestId) || idx.effectivelyTombstoned.has(latestId)) throw new Error('Tribe not found');
      const entry = idx.tribes.get(latestId);
      if (!entry) throw new Error('Tribe not found');
      return normalizeTribe(entry);
    },

    async listAll() {
      const idx = await buildTribeIndex();
      const items = [];
      for (const [root, tip] of idx.tipByRoot) {
        if (idx.tombstoned.has(root) || idx.tombstoned.has(tip)) continue;
        if (idx.effectivelyTombstoned.has(root) || idx.effectivelyTombstoned.has(tip)) continue;
        const entry = idx.tribes.get(tip);
        if (!entry) continue;
        items.push(normalizeTribe(entry));
      }
      return items;
    },

    async listTribesForViewer(userId) {
      const all = await this.listAll();
      const out = [];
      for (const t of all) {
        if (!t.isAnonymous) { out.push(t); continue; }
        if (t.author === userId || (Array.isArray(t.members) && t.members.includes(userId))) out.push(t);
      }
      return out;
    },

    async getViewerTribeScope(userId) {
      const all = await this.listAll();
      const memberOf = new Set();
      const createdBy = new Set();
      for (const t of all) {
        if (t.author === userId) { createdBy.add(t.id); memberOf.add(t.id); continue; }
        if (Array.isArray(t.members) && t.members.includes(userId)) memberOf.add(t.id);
      }
      return { memberOf, createdBy, allTribes: all };
    },

    async listSubTribes(parentId, userId) {
      const idx = await buildTribeIndex();
      const rootOf = (id) => { let cur = id; while (idx.parent.has(cur)) cur = idx.parent.get(cur); return cur; };
      const parentRoot = rootOf(parentId);
      const all = await this.listAll();
      const subs = all.filter(t => t.parentTribeId && rootOf(t.parentTribeId) === parentRoot);
      if (!userId) return subs;
      const out = [];
      for (const sub of subs) {
        const ok = await this.canAccessTribe(userId, sub.id).catch(() => false);
        if (ok) out.push(sub);
      }
      return out;
    },

    async wasEverMember(userId, tribeId) {
      if (!userId || !tribeId) return false;
      const idx = await buildTribeIndex();
      let root = tribeId;
      while (idx.parent.has(root)) root = idx.parent.get(root);
      for (const entry of idx.tribes.values()) {
        let r = entry.id;
        while (idx.parent.has(r)) r = idx.parent.get(r);
        if (r !== root) continue;
        if (entry.author === userId) return true;
        const members = entry.content && Array.isArray(entry.content.members) ? entry.content.members : [];
        if (members.includes(userId)) return true;
      }
      return false;
    },

    async isTribeMember(userId, tribeId) {
      if (!userId || !tribeId) return false;
      try {
        const tribe = await this.getTribeById(tribeId);
        if (!tribe) return false;
        if (tribe.author === userId) return true;
        return Array.isArray(tribe.members) && tribe.members.includes(userId);
      } catch (_) { return false; }
    },

    async canAccessTribe(userId, tribeId) {
      if (!userId || !tribeId) return false;
      try {
        const tribe = await this.getTribeById(tribeId);
        if (!tribe) return false;
        if (tribe.author === userId) return true;
        if (Array.isArray(tribe.members) && tribe.members.includes(userId)) return true;
        const effective = await this.getEffectiveStatus(tribeId);
        return !effective.isPrivate;
      } catch (_) { return false; }
    },

    async getEffectiveStatus(tribeId) {
      let current;
      try { current = await this.getTribeById(tribeId); } catch (_) { return { isPrivate: true, chain: [] }; }
      const chain = [{ id: current.id, isAnonymous: !!current.isAnonymous, author: current.author }];
      let cursor = current;
      const seen = new Set([current.id]);
      while (cursor.parentTribeId && !seen.has(cursor.parentTribeId)) {
        seen.add(cursor.parentTribeId);
        try {
          cursor = await this.getTribeById(cursor.parentTribeId);
          chain.push({ id: cursor.id, isAnonymous: !!cursor.isAnonymous, author: cursor.author });
        } catch (_) { break; }
      }
      const isPrivate = chain.some(c => c.isAnonymous);
      return { isPrivate, chain };
    },

    async updateTribeById(tribeId, updatedContent) {
      const tribe = await this.getTribeById(tribeId);
      if (!tribe) throw new Error('Tribe not found');
      const rootId = await this.getRootId(tribeId);
      const tipId = tribe.id;
      const now = new Date().toISOString();
      const fields = {
        title: updatedContent.title !== undefined ? updatedContent.title : tribe.title,
        description: updatedContent.description !== undefined ? updatedContent.description : tribe.description,
        image: updatedContent.image !== undefined ? updatedContent.image : tribe.image,
        location: updatedContent.location !== undefined ? updatedContent.location : tribe.location,
        tags: updatedContent.tags !== undefined ? updatedContent.tags : tribe.tags,
        isAnonymous: updatedContent.isAnonymous !== undefined ? updatedContent.isAnonymous : tribe.isAnonymous,
        members: updatedContent.members !== undefined ? updatedContent.members : tribe.members,
        invites: updatedContent.invites !== undefined ? updatedContent.invites : tribe.invites,
        inviteMode: updatedContent.inviteMode !== undefined ? updatedContent.inviteMode : tribe.inviteMode,
        status: updatedContent.status !== undefined ? updatedContent.status : tribe.status,
        parentTribeId: updatedContent.parentTribeId !== undefined ? updatedContent.parentTribeId : tribe.parentTribeId,
        mapUrl: updatedContent.mapUrl !== undefined ? updatedContent.mapUrl : tribe.mapUrl,
        createdAt: tribe.createdAt,
        updatedAt: now,
        author: tribe.author,
        ...(typeof updatedContent.joinedWith === 'string' && updatedContent.joinedWith ? { joinedWith: updatedContent.joinedWith } : {}),
        ...(updatedContent.removedSeqs && typeof updatedContent.removedSeqs === 'object' ? { removedSeqs: updatedContent.removedSeqs } : {})
      };
      if (fields.isAnonymous) {
        return wrapAndPublish(rootId, { k: 'tribe', op: 'update', rootId, replaces: tipId, ...fields });
      }
      const client = await openSsb();
      const content = { type: 'tribe', op: 'update', rootId, replaces: tipId, ...fields };
      const result = await new Promise((resolve, reject) =>
        client.publish(content, (err, r) => err ? reject(err) : resolve(r))
      );
      tribeIndex = null;
      return result;
    },

    async publishUpdatedTribe(tribeId, updated) {
      return this.updateTribeById(tribeId, updated);
    },

    async updateTribeMembers(tribeId, members) {
      const tribe = await this.getTribeById(tribeId);
      const old = tribe.members || [];
      const leaving = old.filter(m => !members.includes(m));
      const removedSeqs = {};
      if (leaving.length) {
        const client = await openSsb();
        for (const m of leaving) {
          removedSeqs[m] = await new Promise((resolve) => pull(client.createUserStream({ id: m, reverse: true, limit: 1 }), pull.collect((err, list) => resolve(!err && list && list[0] && list[0].value ? Number(list[0].value.sequence) || 0 : 0))));
        }
      }
      await this.updateTribeById(tribeId, { members, ...(leaving.length ? { removedSeqs } : {}) });
      const removed = old.filter(m => !members.includes(m));
      const added = members.filter(m => !old.includes(m));
      if (removed.length > 0) {
        await this.rotateTribeKey(tribeId, members);
      } else if (added.length > 0) {
        await this.distributeTribeKey(tribeId, added);
      }
    },

    async updateTribeInvites(tribeId, invites) {
      return this.updateTribeById(tribeId, { invites });
    },

    async generateInvite(tribeId) {
      const client = await openSsb();
      const userId = client.id;
      const tribe = await this.getTribeById(tribeId);
      if (tribe.inviteMode === 'strict' && tribe.author !== userId) {
        throw new Error('Only the author can generate invites in strict mode');
      }
      if (tribe.inviteMode === 'open' && !tribe.members.includes(userId)) {
        throw new Error('Only tribe members can generate invites in open mode');
      }
      const code = crypto.randomBytes(INVITE_CODE_BYTES).toString('hex');
      const targetRoot = await this.getRootId(tribeId);
      if (!targetRoot) throw new Error('Cannot resolve tribe root');
      const salt = tribeCrypto.generateInviteSalt();
      const ekChain = tribeCrypto.encryptChainForInvite([targetRoot], code, salt);
      if (!ekChain) throw new Error('Cannot encrypt invite chain — missing keys');
      const codeHash = tribeCrypto.hashInviteCode(code, salt);
      const inviteMsg = {
        type: 'tribe-invite-msg',
        v: 1,
        ch: codeHash,
        s: salt,
        ek: ekChain
      };
      const invitePub = await new Promise((resolve, reject) =>
        client.publish(inviteMsg, (err, r) => err ? reject(err) : resolve(r))
      );
      const inviteRef = {
        codeHash,
        salt,
        gen: tribeCrypto.getGen(targetRoot),
        msgKey: invitePub.key
      };
      const invites = Array.isArray(tribe.invites) ? [...tribe.invites, inviteRef] : [inviteRef];
      await this.updateTribeInvites(tribeId, invites);
      return code;
    },

    async getOpenInvite(tribeId) {
      const root = await this.getRootId(tribeId).catch(() => tribeId);
      const map = await scanOpenInviteMarkers();
      const rec = map.get(root);
      return rec ? { code: rec.code, by: rec.by, markerKey: rec.markerKey, inviteKey: rec.inviteKey } : null;
    },

    async enrichOpenInvites(tribes) {
      const list = Array.isArray(tribes) ? tribes : [];
      if (!list.length) return list;
      const map = await scanOpenInviteMarkers();
      const idx = await buildTribeIndex();
      for (const t of list) {
        const root = idx.rootByTip.get(t.id) || t.id;
        const rec = map.get(root);
        if (rec) { t.openInviteCode = rec.code; t.openInviteBy = rec.by; }
      }
      return list;
    },

    async generateOpenInvite(tribeId) {
      const client = await openSsb();
      const userId = client.id;
      const tribe = await this.getTribeById(tribeId);
      if (tribe.inviteMode === 'strict' && tribe.author !== userId) {
        throw new Error('Only the author can generate invites in strict mode');
      }
      if (tribe.inviteMode === 'open' && tribe.author !== userId && !tribe.members.includes(userId)) {
        throw new Error('Only tribe members can generate invites in open mode');
      }
      const existing = await this.getOpenInvite(tribeId);
      if (existing) throw new Error('An open invitation already exists');
      const code = crypto.randomBytes(INVITE_CODE_BYTES).toString('hex');
      const targetRoot = await this.getRootId(tribeId);
      if (!targetRoot) throw new Error('Cannot resolve tribe root');
      const salt = tribeCrypto.generateInviteSalt();
      const ekChain = tribeCrypto.encryptChainForInvite([targetRoot], code, salt);
      if (!ekChain) throw new Error('Cannot encrypt invite chain — missing keys');
      const codeHash = tribeCrypto.hashInviteCode(code, salt);
      const invitePub = await new Promise((resolve, reject) =>
        client.publish({ type: 'tribe-invite-msg', v: 1, multi: 1, ch: codeHash, s: salt, ek: ekChain }, (err, r) => err ? reject(err) : resolve(r))
      );
      await new Promise((resolve, reject) =>
        client.publish({ type: 'tribe-open-invite', v: 1, rootId: targetRoot, code, inviteKey: invitePub.key, by: userId, createdAt: new Date().toISOString() }, (err, r) => err ? reject(err) : resolve(r))
      );
      tribeIndex = null;
      return code;
    },

    async removeOpenInvite(tribeId) {
      const client = await openSsb();
      const userId = client.id;
      const tribe = await this.getTribeById(tribeId).catch(() => null);
      const rec = await this.getOpenInvite(tribeId);
      if (!rec) return;
      if (rec.by !== userId && !(tribe && tribe.author === userId)) {
        throw new Error('Not allowed to remove this invitation');
      }
      await new Promise((resolve, reject) =>
        client.publish({ type: 'tribe-open-invite-tombstone', v: 1, target: rec.markerKey, ts: new Date().toISOString() }, (err, r) => err ? reject(err) : resolve(r))
      );
      if (rec.inviteKey) await this.publishInviteTombstone(rec.inviteKey).catch(() => {});
      tribeIndex = null;
    },

    async joinByInvite(rawCode) {
      const code = String(rawCode || '').trim();
      if (!code) throw new Error('Invalid or expired invite code');
      const client = await openSsb();
      const userId = client.id;
      const msgs = await streamLog();
      const inviteTombstoned = new Set();
      for (const m of msgs) {
        const v = m.value;
        const c = v && v.content;
        if (!c || c.type !== 'tribe-invite-tombstone' || typeof c.target !== 'string') continue;
        inviteTombstoned.add(c.target);
      }
      let matched = null;
      for (const m of msgs) {
        const v = m.value;
        const c = v && v.content;
        if (!c || c.type !== 'tribe-invite-msg' || c.v !== 1) continue;
        if (typeof c.ch !== 'string' || typeof c.s !== 'string' || typeof c.ek !== 'string') continue;
        if (inviteTombstoned.has(m.key)) continue;
        if (tribeCrypto.hashInviteCode(code, c.s) !== c.ch) continue;
        const chain = tribeCrypto.decryptChainFromInvite(c.ek, code, c.s, 3);
        if (Array.isArray(chain) && chain.length) {
          matched = { msgKey: m.key, codeHash: c.ch, chain, multi: c.multi === 1 || c.multi === true };
          break;
        }
      }
      if (!matched) throw new Error('Invalid or expired invite code');
      const rootId = matched.chain[0].rootId;
      const fresh = matched.chain.filter(entry => entry && Array.isArray(entry.keys) && entry.keys.length && !tribeCrypto.getKeys(entry.rootId).length);
      for (const entry of fresh) tribeCrypto.setKeys(entry.rootId, entry.keys, entry.gen || entry.keys.length);
      tribeIndex = null;
      const undo = () => { for (const entry of fresh) tribeCrypto.dropKey(entry.rootId); tribeIndex = null; };
      let tribe;
      try { tribe = await this.getTribeById(rootId); } catch (_) { tribe = null; }
      if (!tribe) { undo(); throw new Error('Tribe not found'); }
      if (tribe.members.includes(userId)) { undo(); throw new Error('Already a member of this tribe'); }
      const lineage = new Set([rootId]);
      let cursor = tribe;
      for (let hops = 0; cursor && cursor.parentTribeId && hops < 8; hops++) {
        let parentTribe = null;
        try { parentTribe = await this.getTribeById(cursor.parentTribeId); } catch (_) { parentTribe = null; }
        if (!parentTribe) break;
        const parentCircle = [parentTribe.author, ...(Array.isArray(parentTribe.members) ? parentTribe.members : [])];
        if (!parentCircle.includes(cursor.author)) break;
        lineage.add(parentTribe.id);
        lineage.add(cursor.parentTribeId);
        cursor = parentTribe;
      }
      for (const entry of matched.chain) {
        if (!entry || !Array.isArray(entry.keys) || !entry.keys.length) continue;
        if (fresh.includes(entry)) { if (!lineage.has(entry.rootId)) tribeCrypto.dropKey(entry.rootId); continue; }
        if (lineage.has(entry.rootId)) tribeCrypto.mergeKeys(entry.rootId, entry.keys, entry.gen || entry.keys.length);
      }
      tribeIndex = null;
      const members = [...tribe.members, userId];
      if (matched.multi) {
        await this.updateTribeById(tribe.id, { members, joinedWith: matched.codeHash });
      } else {
        const invites = (tribe.invites || []).filter(inv => inv.codeHash !== matched.codeHash);
        await this.updateTribeById(tribe.id, { members, invites, joinedWith: matched.codeHash });
        await this.publishInviteTombstone(matched.msgKey).catch(() => {});
      }
      await this.ensureFollowTribeMembers(tribe.id).catch(() => {});
      subscribeInvalidation().catch(() => {});
      return rootId;
    },

    async publishInviteTombstone(inviteMsgKey) {
      const client = await openSsb();
      return new Promise((resolve, reject) =>
        client.publish({
          type: 'tribe-invite-tombstone',
          v: 1,
          target: inviteMsgKey,
          ts: new Date().toISOString()
        }, (err, r) => err ? reject(err) : resolve(r))
      );
    },

    async leaveTribe(tribeId, opts = {}) {
      const client = await openSsb();
      const userId = client.id;
      const tribe = await this.getTribeById(tribeId);
      if (!tribe) throw new Error('Tribe not found');
      const isAuthor = tribe.author === userId;
      if (isAuthor && !opts.force) throw new Error('Tribe author cannot leave their own tribe');
      const members = Array.isArray(tribe.members) ? [...tribe.members] : [];
      const idx = members.indexOf(userId);
      if (idx === -1) throw new Error('User is not a member of this tribe');
      members.splice(idx, 1);
      if (isAuthor && members.length === 0) {
        await this.publishTombstone(tribeId).catch(() => {});
        return;
      }
      await this.updateTribeById(tribeId, { members });
    },

    async distributeTribeKey(tribeId, toMembers) {
      if (!Array.isArray(toMembers) || !toMembers.length) return;
      const client = await openSsb();
      const rootId = await this.getRootId(tribeId);
      const keys = tribeCrypto.getKeys(rootId);
      const gen = tribeCrypto.getGen(rootId);
      if (!keys.length) return;
      const payload = tribeCrypto.buildKeyDistribPayload(rootId, keys, gen);
      const others = [...new Set(toMembers)].filter(m => m && m !== client.id);
      const batch = tribeCrypto.KEY_DISTRIB_BATCH - 1;
      let i = 0;
      do {
        const recps = [client.id, ...others.slice(i, i + batch)];
        await new Promise((resolve, reject) =>
          client.publish({ ...payload, recps }, (err) => err ? reject(err) : resolve())
        );
        i += batch;
      } while (i < others.length);
    },

    async rotateTribeKey(tribeId, remainingMembers) {
      const rootId = await this.getRootId(tribeId);
      const oldKey = tribeCrypto.getKey(rootId);
      if (!oldKey) return;
      const newKey = tribeCrypto.generateTribeKey();
      tribeCrypto.addNewKey(rootId, newKey);
      if (Array.isArray(remainingMembers) && remainingMembers.length > 0) {
        await this.distributeTribeKey(tribeId, remainingMembers).catch(() => {});
      }
    },

    async ensureTribeKeyDistribution(tribeId) {
      const client = await openSsb();
      const userId = client.id;
      let tribe;
      try { tribe = await this.getTribeById(tribeId); } catch (_) { return; }
      if (!tribe || tribe.author !== userId) return;
      const rootId = await this.getRootId(tribeId);
      if (!tribeCrypto.getKey(rootId)) return;
      const others = (tribe.members || []).filter(m => m !== userId);
      const { distribs } = await readKeyDistribs();
      const distributed = new Set();
      const currentGen = tribeCrypto.getGen(rootId);
      const holdersOfCurrent = new Set();
      for (const { m, dec } of distribs) {
        if (m.value.author !== userId) continue;
        if (dec.rootId !== rootId) continue;
        const recps = Array.isArray(dec.recps) ? dec.recps : [];
        for (const r of recps) distributed.add(r);
        if (Number(dec.gen) === Number(currentGen)) for (const r of recps) holdersOfCurrent.add(r);
      }
      const departed = [...holdersOfCurrent].filter(r => r !== userId && !(tribe.members || []).includes(r));
      if (departed.length > 0) { await this.rotateTribeKey(tribeId, others).catch(() => {}); return; }
      if (!others.length) return;
      const missing = others.filter(m => !distributed.has(m));
      if (missing.length > 0) await this.distributeTribeKey(tribeId, missing).catch(() => {});
    },

    async processIncomingKeys() {
      const { msgs, distribs } = await readKeyDistribs();
      const byTribe = new Map();
      const authorOf = new Map();
      for (const m of msgs) if (m && m.key && m.value) authorOf.set(m.key, m.value.author);
      for (const { m, dec } of distribs) {
        const list = byTribe.get(dec.rootId) || [];
        list.push({ generation: dec.gen || dec.keys.length, keys: dec.keys, ts: m.value.timestamp, author: m.value.author });
        byTribe.set(dec.rootId, list);
      }
      for (const [rootId, all] of byTribe.entries()) {
        const owner = authorOf.get(rootId);
        if (!owner) continue;
        let members = [];
        try { const t = await this.getTribeById(rootId); members = Array.isArray(t && t.members) ? t.members : []; } catch (_) {}
        const allowed = new Set([owner, ...members]);
        const entries = all.filter(e => allowed.has(e.author));
        entries.sort((a, b) => b.generation - a.generation);
        const top = entries[0];
        if (top && Array.isArray(top.keys) && top.keys.length) {
          tribeCrypto.mergeKeys(rootId, top.keys, top.generation);
        }
      }
    },

    async ensureFollowTribeMembers(tribeId) {
      const client = await openSsb();
      const me = client.id;
      let tribe;
      try { tribe = await this.getTribeById(tribeId); } catch (_) { return; }
      const fpIdx = tribeCrypto.buildFingerprintIndex();
      const rootId = await this.getRootId(tribeId).catch(() => tribeId);
      const tribeChainIds = await this.getChainIds(tribeId).catch(() => [tribeId]);
      const tribeRootSet = new Set([rootId]);
      const tribeChainSet = new Set(tribeChainIds);
      tribeChainSet.add(tribeId);
      const ssbKeys = require('../server/node_modules/ssb-keys');
      const config = require('../server/ssb_config');
      const discovered = new Set();
      const myFollows = new Map();
      const myInviteMsgKeys = new Set();
      const msgs = await streamLog();
      for (const m of msgs) {
        const v = m.value;
        if (!v) continue;
        const c = v.content;
        if (!c) continue;
        if (v.author === me && c.type === 'tribe-invite-msg') {
          myInviteMsgKeys.add(m.key);
        }
        if (v.author === me && c && c.type === 'contact' && c.contact && typeof c.following === 'boolean') {
          myFollows.set(c.contact, c.following);
          continue;
        }
        if (c.type === 'tribe-invite-tombstone' && typeof c.target === 'string' && v.author && v.author !== me) {
          if (myInviteMsgKeys.has(c.target)) discovered.add(v.author);
          continue;
        }
        const dec = tribeCrypto.tryUnboxKeyDistrib(c, config.keys, ssbKeys);
        if (dec && tribeRootSet.has(dec.rootId)) {
          const recps = Array.isArray(dec.recps) ? dec.recps : [];
          for (const r of recps) discovered.add(r);
          if (v.author) discovered.add(v.author);
          continue;
        }
        if (tribeCrypto.isTribeMsg(c)) {
          const r = tribeCrypto.unwrapMsg(c, fpIdx);
          if (!r || !r.body) continue;
          if (r.body.k !== 'tribe') continue;
          if (!tribeChainSet.has(m.key) && !tribeChainSet.has(r.body.replaces || '') && r.rootId !== rootId) continue;
          const mems = Array.isArray(r.body.members) ? r.body.members : [];
          for (const fid of mems) if (fid) discovered.add(fid);
          if (v.author) discovered.add(v.author);
        }
      }
      for (const m of msgs) {
        const v = m.value;
        if (!v || v.author !== me) continue;
        const c = v.content;
        if (!c || c.type !== 'tribe-invite-msg') continue;
        for (const m2 of msgs) {
          const v2 = m2.value;
          if (!v2) continue;
          const c2 = v2.content;
          if (!c2 || c2.type !== 'tribe-invite-tombstone') continue;
          if (c2.target === m.key && v2.author && v2.author !== me) discovered.add(v2.author);
        }
      }
      const baseMembers = Array.isArray(tribe.members) ? tribe.members : [];
      for (const fid of baseMembers) discovered.add(fid);
      if (tribe.author) discovered.add(tribe.author);
      discovered.delete(me);
      const members = [...discovered].filter(Boolean);
      if (!members.length) return;
      for (const memberId of members) {
        if (myFollows.get(memberId) === true) continue;
        await new Promise((resolve) =>
          client.publish({ type: 'contact', contact: memberId, following: true }, () => resolve())
        );
      }
    },

    async forceSync() {
      try {
        const client = await openSsb();
        if (client.replicate && typeof client.replicate.upto === 'function') {
          await new Promise((resolve) => { try { client.replicate.upto(() => resolve()); } catch (_) { resolve(); } });
        }
      } catch (_) {}
    },

    async deleteTribeById(tribeId) {
      return this.publishTombstone(tribeId);
    },

    async publishTombstone(tribeId) {
      const client = await openSsb();
      const userId = client.id;
      const rootId = await this.getRootId(tribeId);
      const idx = await buildTribeIndex();
      let tipId = rootId;
      while (idx.child.has(tipId)) tipId = idx.child.get(tipId);
      let tribe;
      try { tribe = await this.getTribeById(tribeId); } catch (_) { tribe = null; }
      const isPrivate = tribe ? !!tribe.isAnonymous : !!tribeCrypto.getKey(rootId);
      let result;
      if (isPrivate) {
        result = await wrapAndPublish(rootId, { k: 'tombstone', rootId, target: tipId, author: userId, deletedAt: new Date().toISOString() });
      } else {
        const tomb = { type: 'tombstone', target: tipId, deletedAt: new Date().toISOString(), author: userId };
        result = await new Promise((resolve, reject) =>
          client.publish(tomb, (err, r) => err ? reject(err) : resolve(r))
        );
      }
      tribeIndex = null;
      return result;
    },

    async pruneOrphanKeys() {
      if (!tribeCrypto || typeof tribeCrypto.getAllRootIds !== 'function') return 0;
      const idx = await buildTribeIndex();
      const all = tribeCrypto.getAllRootIds();
      let removed = 0;
      for (const rid of all) {
        if (idx.effectivelyTombstoned.has(rid)) {
          try { tribeCrypto.dropKey(rid); removed++; } catch (_) {}
        }
      }
      return removed;
    }
  };
};
