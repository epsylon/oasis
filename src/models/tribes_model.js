const pull = require('../server/node_modules/pull-stream');
const crypto = require('crypto');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const INVITE_CODE_BYTES = 16;
const VALID_INVITE_MODES = ['strict', 'open'];

module.exports = ({ cooler, tribeCrypto }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb };

  let tribeIndex = null;
  let tribeIndexTs = 0;

  const buildTribeIndex = async () => {
    if (tribeIndex && Date.now() - tribeIndexTs < 5000) return tribeIndex;
    const client = await openSsb();
    return new Promise((resolve, reject) => {
      pull(
        client.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => {
          if (err) return reject(err);
          const tombstoned = new Set();
          const parent = new Map();
          const child = new Map();
          const tribes = new Map();
          for (const msg of msgs) {
            const k = msg.key;
            const c = msg.value?.content;
            if (!c) continue;
            if (c.type === 'tombstone' && c.target) { tombstoned.add(c.target); continue; }
            if (c.type !== 'tribe') continue;
            if (c.replaces) {
              parent.set(k, c.replaces);
              child.set(c.replaces, k);
            }
            tribes.set(k, { id: k, content: c, _ts: msg.value?.timestamp });
          }
          const rootOf = (id) => { let cur = id; while (parent.has(cur)) cur = parent.get(cur); return cur; };
          const tipOf = (id) => { let cur = id; while (child.has(cur)) cur = child.get(cur); return cur; };
          const tipByRoot = new Map();
          for (const k of tribes.keys()) {
            const root = rootOf(k);
            const tip = tipOf(root);
            tipByRoot.set(root, tip);
          }
          tribeIndex = { tribes, tombstoned, parent, child, tipByRoot };
          tribeIndexTs = Date.now();
          resolve(tribeIndex);
        })
      );
    });
  };

  return {
    type: 'tribe',

    async createTribe(title, description, image, location, tagsRaw = [], isLARP = false, isAnonymous = true, inviteMode = 'strict', parentTribeId = null, status = 'OPEN', mapUrl = '') {
      if (!VALID_INVITE_MODES.includes(inviteMode)) {
        throw new Error('Invalid invite mode. Must be "strict" or "open"');
      }
      const ssb = await openSsb();
      const userId = ssb.id;
      let blobId = null;
      if (image) {
        blobId = String(image).trim() || null;
      }
      const tags = Array.isArray(tagsRaw)
        ? tagsRaw.filter(Boolean)
        : tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      const content = {
        type: 'tribe',
        title,
        description,
        image: blobId,
        location,
        tags,
        isLARP: Boolean(isLARP),
        isAnonymous: Boolean(isAnonymous),
        members: [userId],
        invites: [],
        inviteMode,
        status: status || 'OPEN',
        parentTribeId: parentTribeId || null,
        mapUrl: String(mapUrl || '').trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: userId,
      };
      const result = await new Promise((res, rej) => ssb.publish(content, (e, r) => e ? rej(e) : res(r)));
      if (tribeCrypto) {
        const tribeKey = tribeCrypto.generateTribeKey();
        tribeCrypto.setKey(result.key, tribeKey, 1);
      }
      tribeIndex = null;
      return result;
    },

    async generateInvite(tribeId) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const tribe = await this.getTribeById(tribeId);
      if (tribe.inviteMode === 'strict' && tribe.author !== userId) {
        throw new Error('Only the author can generate invites in strict mode');
      }
      if (tribe.inviteMode === 'open' && !tribe.members.includes(userId)) {
        throw new Error('Only tribe members can generate invites in open mode');
      }
      const code = crypto.randomBytes(INVITE_CODE_BYTES).toString('hex');
      let invite = code;
      if (tribeCrypto) {
        const rootId = await this.getRootId(tribeId);
        const tribeKey = tribeCrypto.getKey(rootId);
        if (tribeKey) {
          const ek = tribeCrypto.encryptForInvite(tribeKey, code);
          invite = { code, ek, gen: tribeCrypto.getGen(rootId) };
        }
      }
      const invites = Array.isArray(tribe.invites) ? [...tribe.invites, invite] : [invite];
      await this.updateTribeInvites(tribeId, invites);
      return code;
    },

    async updateTribeInvites(tribeId, invites) {
      return this.updateTribeById(tribeId, { invites });
    },

    async leaveTribe(tribeId) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const tribe = await this.getTribeById(tribeId);
      if (!tribe) throw new Error('Tribe not found');
      if (tribe.author === userId) {
        throw new Error('Tribe author cannot leave their own tribe');
      }
      const members = Array.isArray(tribe.members) ? [...tribe.members] : [];
      const idx = members.indexOf(userId);
      if (idx === -1) throw new Error('User is not a member of this tribe');
      members.splice(idx, 1);
      await this.updateTribeById(tribeId, { members });
      await this.rotateTribeKey(tribeId, members);
    },

    async joinByInvite(code) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const tribes = await this.listAll();
      let matchedTribe = null;
      let matchedInvite = null;
      for (const t of tribes) {
        if (!t.invites) continue;
        for (const inv of t.invites) {
          if (typeof inv === 'string' && inv === code) {
            matchedTribe = t; matchedInvite = inv; break;
          }
          if (typeof inv === 'object' && inv.code === code) {
            matchedTribe = t; matchedInvite = inv; break;
          }
        }
        if (matchedTribe) break;
      }
      if (!matchedTribe) throw new Error('Invalid or expired invite code');
      if (matchedTribe.members.includes(userId)) {
        throw new Error('Already a member of this tribe');
      }
      if (tribeCrypto && typeof matchedInvite === 'object' && matchedInvite.ek) {
        const tribeKey = tribeCrypto.decryptFromInvite(matchedInvite.ek, code);
        const rootId = await this.getRootId(matchedTribe.id);
        tribeCrypto.setKey(rootId, tribeKey, matchedInvite.gen || 1);
      }
      const members = [...matchedTribe.members, userId];
      const invites = matchedTribe.invites.filter(inv => {
        if (typeof inv === 'string') return inv !== code;
        return inv.code !== code;
      });
      await this.updateTribeById(matchedTribe.id, { members, invites });
      return matchedTribe.id;
    },

    async deleteTribeById(tribeId) {
       await this.publishTombstone(tribeId);
    },

    async updateTribeMembers(tribeId, members) {
      const tribe = await this.getTribeById(tribeId);
      const oldMembers = tribe.members || [];
      await this.updateTribeById(tribeId, { members });
      const removed = oldMembers.filter(m => !members.includes(m));
      const added = members.filter(m => !oldMembers.includes(m));
      if (removed.length > 0) {
        await this.rotateTribeKey(tribeId, members);
      } else if (added.length > 0) {
        await this.distributeTribeKey(tribeId, added);
      }
    },

    async distributeTribeKey(tribeId, toMembers) {
      if (!tribeCrypto) return;
      const ssb = await openSsb();
      const ssbKeys = require('../server/node_modules/ssb-keys');
      const rootId = await this.getRootId(tribeId);
      const currentKey = tribeCrypto.getKey(rootId);
      if (!currentKey) return;
      const gen = tribeCrypto.getGen(rootId);
      const memberKeys = {};
      for (const memberId of toMembers) {
        try { memberKeys[memberId] = tribeCrypto.boxKeyForMember(currentKey, memberId, ssbKeys); } catch (_) {}
      }
      if (!Object.keys(memberKeys).length) return;
      await new Promise((resolve, reject) => {
        ssb.publish({ type: 'tribe-keys', tribeId: rootId, generation: gen, memberKeys }, (err, res) => err ? reject(err) : resolve(res));
      });
    },

    async ensureTribeKeyDistribution(tribeId) {
      if (!tribeCrypto) return;
      const ssb = await openSsb();
      const userId = ssb.id;
      const tribe = await this.getTribeById(tribeId).catch(() => null);
      if (!tribe || tribe.author !== userId) return;
      const rootId = await this.getRootId(tribeId);
      const currentKey = tribeCrypto.getKey(rootId);
      if (!currentKey) return;
      const gen = tribeCrypto.getGen(rootId);
      const msgs = await new Promise((resolve, reject) => {
        pull(ssb.createLogStream({ limit: logLimit }), pull.collect((err, m) => err ? reject(err) : resolve(m)));
      });
      const distributed = new Set();
      for (const m of msgs) {
        const c = m.value?.content;
        if (!c || c.type !== 'tribe-keys') continue;
        if (c.tribeId !== rootId) continue;
        if ((c.generation || 0) < gen) continue;
        for (const mid of Object.keys(c.memberKeys || {})) distributed.add(mid);
      }
      const members = Array.isArray(tribe.members) ? tribe.members : [];
      const missing = members.filter(m => m !== userId && !distributed.has(m));
      if (missing.length > 0) await this.distributeTribeKey(tribeId, missing);
    },

    async publishUpdatedTribe(tribeId, updatedTribe) {
      const ssb = await openSsb();
      const updatedTribeData = {
        type: 'tribe',
        replaces: updatedTribe.replaces || tribeId,
        title: updatedTribe.title,
        description: updatedTribe.description,
        image: updatedTribe.image,
        location: updatedTribe.location,
        tags: updatedTribe.tags,
        isLARP: updatedTribe.isLARP,
        isAnonymous: updatedTribe.isAnonymous,
        members: updatedTribe.members,
        invites: updatedTribe.invites,
        inviteMode: updatedTribe.inviteMode,
        status: updatedTribe.status || 'OPEN',
        parentTribeId: updatedTribe.parentTribeId || null,
        mapUrl: updatedTribe.mapUrl || "",
        createdAt: updatedTribe.createdAt,
        updatedAt: new Date().toISOString(),
        author: updatedTribe.author,
      };
      const result = await new Promise((resolve, reject) => {
         ssb.publish(updatedTribeData, (err, result) => err ? reject(err) : resolve(result));
      });
      tribeIndex = null;
      return result;
    },

    async getTribeById(tribeId) {
      const { tribes, tombstoned, child } = await buildTribeIndex();
      let latestId = tribeId;
      while (child.has(latestId)) latestId = child.get(latestId);
      if (tombstoned.has(latestId)) throw new Error('Tribe not found');
      const tribe = tribes.get(latestId);
      if (!tribe) throw new Error('Tribe not found');
      return {
        id: tribe.id,
        title: tribe.content.title,
        description: tribe.content.description,
        image: tribe.content.image || null,
        location: tribe.content.location,
        tags: Array.isArray(tribe.content.tags) ? tribe.content.tags : [],
        isLARP: !!tribe.content.isLARP,
        isAnonymous: tribe.content.isAnonymous,
        members: Array.isArray(tribe.content.members) ? tribe.content.members : [],
        invites: Array.isArray(tribe.content.invites) ? tribe.content.invites : [],
        inviteMode: tribe.content.inviteMode || 'strict',
        status: tribe.content.status || 'OPEN',
        parentTribeId: tribe.content.parentTribeId || null,
        mapUrl: tribe.content.mapUrl || "",
        createdAt: tribe.content.createdAt,
        updatedAt: tribe.content.updatedAt,
        author: tribe.content.author,
      };
    },

    async listAll() {
      const { tribes, tombstoned, tipByRoot } = await buildTribeIndex();
      const items = [];
      for (const [root, tip] of tipByRoot) {
        if (tombstoned.has(root) || tombstoned.has(tip)) continue;
        const entry = tribes.get(tip);
        if (!entry) continue;
        const c = entry.content;
        items.push({
          id: tip,
          title: c.title,
          description: c.description,
          image: c.image || null,
          location: c.location,
          tags: Array.isArray(c.tags) ? c.tags : [],
          isLARP: !!c.isLARP,
          isAnonymous: c.isAnonymous !== false,
          members: Array.isArray(c.members) ? c.members : [],
          invites: Array.isArray(c.invites) ? c.invites : [],
          inviteMode: c.inviteMode || 'strict',
          status: c.status || 'OPEN',
          parentTribeId: c.parentTribeId || null,
          mapUrl: c.mapUrl || "",
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          author: c.author,
          _ts: entry._ts
        });
      }
      return items;
    },

    async getChainIds(tribeId) {
      const { parent, child } = await buildTribeIndex();
      let root = tribeId;
      while (parent.has(root)) root = parent.get(root);
      const ids = [root];
      let cur = root;
      while (child.has(cur)) { cur = child.get(cur); ids.push(cur); }
      return ids;
    },

    async getRootId(tribeId) {
      const { parent } = await buildTribeIndex();
      let root = tribeId;
      while (parent.has(root)) root = parent.get(root);
      return root;
    },

    async getAncestryChain(tribeId) {
      const rootId = await this.getRootId(tribeId);
      const tribe = await this.getTribeById(tribeId);
      const chain = [rootId];
      let currentTribe = tribe;
      while (currentTribe.parentTribeId) {
        const parentRootId = await this.getRootId(currentTribe.parentTribeId);
        chain.push(parentRootId);
        try {
          currentTribe = await this.getTribeById(currentTribe.parentTribeId);
        } catch (e) {
          break;
        }
      }
      return chain;
    },

    async rotateTribeKey(tribeId, remainingMembers) {
      if (!tribeCrypto) return;
      const ssb = await openSsb();
      const ssbKeys = require('../server/node_modules/ssb-keys');
      const rootId = await this.getRootId(tribeId);
      const oldKey = tribeCrypto.getKey(rootId);
      if (!oldKey) return;
      const newKey = tribeCrypto.generateTribeKey();
      const newGen = tribeCrypto.addNewKey(rootId, newKey);
      const memberKeys = {};
      for (const memberId of remainingMembers) {
        memberKeys[memberId] = tribeCrypto.boxKeyForMember(newKey, memberId, ssbKeys);
      }
      const entries = Object.entries(memberKeys);
      const BATCH_SIZE = 20;
      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = Object.fromEntries(entries.slice(i, i + BATCH_SIZE));
        await new Promise((resolve, reject) => {
          ssb.publish({ type: 'tribe-keys', tribeId: rootId, generation: newGen, memberKeys: batch },
            (err, res) => err ? reject(err) : resolve(res));
        });
      }
      const tribe = await this.getTribeById(tribeId);
      if (Array.isArray(tribe.invites) && tribe.invites.length > 0) {
        const updatedInvites = tribe.invites.map(inv => {
          if (typeof inv === 'object' && inv.code) {
            return { code: inv.code, ek: tribeCrypto.encryptForInvite(newKey, inv.code), gen: newGen };
          }
          return inv;
        });
        await this.updateTribeInvites(tribeId, updatedInvites);
      }
    },

    async processIncomingKeys() {
      if (!tribeCrypto) return;
      const ssb = await openSsb();
      const ssbKeys = require('../server/node_modules/ssb-keys');
      const config = require('../server/ssb_config');
      const msgs = await new Promise((resolve, reject) => {
        pull(
          ssb.createLogStream({ limit: logLimit }),
          pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
        );
      });
      for (const m of msgs) {
        const c = m.value?.content;
        if (!c || c.type !== 'tribe-keys') continue;
        const myEntry = c.memberKeys && c.memberKeys[ssb.id];
        if (!myEntry) continue;
        const currentGen = tribeCrypto.getGen(c.tribeId);
        if (c.generation <= currentGen) continue;
        const newKey = tribeCrypto.unboxKeyFromMember(myEntry, config.keys, ssbKeys);
        if (newKey) {
          tribeCrypto.addNewKey(c.tribeId, newKey);
        }
      }
    },
    
    async updateTribeById(tribeId, updatedContent) {
      const ssb = await openSsb();
      const tribe = await this.getTribeById(tribeId);
      if (!tribe) throw new Error('Tribe not found');
      const updatedTribe = {
        type: 'tribe',
        ...tribe,
        ...updatedContent,
        replaces: tribeId,
        updatedAt: new Date().toISOString()
      };
      return this.publishUpdatedTribe(tribeId, updatedTribe);
    },

    async publishTombstone(tribeId) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const tombstone = {
        type: 'tombstone',
        target: tribeId,
        deletedAt: new Date().toISOString(),
        author: userId
      };
      await new Promise((resolve, reject) => {
        ssb.publish(tombstone, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      tribeIndex = null;
    },

    async listSubTribes(parentId) {
      const idx = await buildTribeIndex();
      const rootOf = (id) => { let cur = id; while (idx.parent.has(cur)) cur = idx.parent.get(cur); return cur; };
      const parentRoot = rootOf(parentId);
      const all = await this.listAll();
      return all.filter(t => t.parentTribeId && rootOf(t.parentTribeId) === parentRoot);
    },

    async isTribeMember(userId, tribeId) {
      if (!userId || !tribeId) return false;
      try {
        const tribe = await this.getTribeById(tribeId);
        if (!tribe) return false;
        if (tribe.author === userId) return true;
        return Array.isArray(tribe.members) && tribe.members.includes(userId);
      } catch (e) {
        return false;
      }
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
      } catch (e) {
        return false;
      }
    },

    async getEffectiveStatus(tribeId) {
      let current;
      try { current = await this.getTribeById(tribeId); } catch (e) { return { isPrivate: true, chain: [] }; }
      const chain = [{ id: current.id, isAnonymous: !!current.isAnonymous, author: current.author }];
      let cursor = current;
      const seen = new Set([current.id]);
      while (cursor.parentTribeId && !seen.has(cursor.parentTribeId)) {
        seen.add(cursor.parentTribeId);
        try {
          cursor = await this.getTribeById(cursor.parentTribeId);
          chain.push({ id: cursor.id, isAnonymous: !!cursor.isAnonymous, author: cursor.author });
        } catch (e) { break; }
      }
      const isPrivate = chain.some(c => c.isAnonymous);
      return { isPrivate, chain };
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
    }
  };
};

