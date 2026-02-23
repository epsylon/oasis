const pull = require('../server/node_modules/pull-stream');
const crypto = require('crypto');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const INVITE_CODE_BYTES = 16;
const VALID_INVITE_MODES = ['strict', 'open'];

module.exports = ({ cooler }) => {
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

    async createTribe(title, description, image, location, tagsRaw = [], isLARP = false, isAnonymous = true, inviteMode = 'strict', parentTribeId = null, status = 'OPEN') {
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: userId,
      };
      const result = await new Promise((res, rej) => ssb.publish(content, (e, r) => e ? rej(e) : res(r)));
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
      const invites = Array.isArray(tribe.invites) ? [...tribe.invites, code] : [code];
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
      return this.updateTribeById(tribeId, { members });
    },

    async joinByInvite(code) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const tribes = await this.listAll();
      const tribe = tribes.find(t => t.invites && t.invites.includes(code));
      if (!tribe) throw new Error('Invalid or expired invite code');
      if (tribe.members.includes(userId)) {
        throw new Error('Already a member of this tribe');
      }
      const members = [...tribe.members, userId];
      const invites = tribe.invites.filter(c => c !== code);
      await this.updateTribeById(tribe.id, { members, invites });
      return tribe.id;
    },

    async deleteTribeById(tribeId) {
       await this.publishTombstone(tribeId);
    },

    async updateTribeMembers(tribeId, members) {
      return this.updateTribeById(tribeId, { members });
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
    }
  };
};

