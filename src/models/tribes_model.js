const pull = require('../server/node_modules/pull-stream');

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb };

  return {
    type: 'tribe',

    async createTribe(title, description, image, location, tagsRaw = [], isLARP = false, isAnonymous = true, inviteMode = 'strict') {
      const ssb = await openSsb();
      const userId = ssb.id;
      let blobId = null;
      if (image) {
        const match = image.match(/\(([^)]+)\)/);
        blobId = match ? match[1] : image;
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: userId,
        feed: [],
      };
      return new Promise((res, rej) => ssb.publish(content, (e, r) => e ? rej(e) : res(r)));
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

      const code = Math.random().toString(36).substring(2, 10);
      const invites = Array.isArray(tribe.invites) ? [...tribe.invites, code] : [code];

      await this.updateTribeInvites(tribeId, invites);
      return code;
    },

    async updateTribeInvites(tribeId, invites) {
      const ssb = await openSsb();
      const tribe = await this.getTribeById(tribeId);
      const updatedTribe = {
        type: 'tribe',
        replaces: tribeId,
        title: tribe.title,
        description: tribe.description,
        image: tribe.image,
        location: tribe.location,
        tags: tribe.tags,
        isLARP: tribe.isLARP,
        isAnonymous: tribe.isAnonymous,
        members: tribe.members,
        invites: invites,
        inviteMode: tribe.inviteMode,
        createdAt: tribe.createdAt,
        updatedAt: new Date().toISOString(),
        author: tribe.author,
        feed: tribe.feed
      };
      return this.publishUpdatedTribe(tribeId, updatedTribe);
    },

    async leaveTribe(tribeId) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const tribe = await this.getTribeById(tribeId);
      if (!tribe) throw new Error('Tribe not found');
      const members = Array.isArray(tribe.members) ? [...tribe.members] : [];
      const idx = members.indexOf(userId);
      if (idx === -1) throw new Error('Inhabitant is not a member of the tribe');
      members.splice(idx, 1);
      const updatedTribe = {
        type: 'tribe',
        replaces: tribeId, 
        title: tribe.title,
        description: tribe.description,
        image: tribe.image,
        location: tribe.location,
        tags: tribe.tags,
        isLARP: tribe.isLARP,
        isAnonymous: tribe.isAnonymous,
        members: members,
        invites: tribe.invites,
        inviteMode: tribe.inviteMode,
        createdAt: tribe.createdAt,
        updatedAt: new Date().toISOString(),
        author: tribe.author,
        feed: tribe.feed
      };
      return new Promise((resolve, reject) => {
        ssb.publish(updatedTribe, (err, result) => err ? reject(err) : resolve(result));
      });
    },

    async joinByInvite(code) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const tribes = await this.listAll();
      const latestTribe = tribes.find(tribe => tribe.invites && tribe.invites.includes(code));
      if (!latestTribe) {
        return new Promise((_, rej) => rej(new Error('Invalid or expired invite code.')));
      }
      const tribe = latestTribe;
      if (!tribe.invites.includes(code)) {
        return new Promise((_, rej) => rej(new Error('Invalid or expired invite code.')));
      }
      const members = Array.isArray(tribe.members) ? [...tribe.members] : [];
      if (!members.includes(userId)) members.push(userId);
      const updatedInvites = tribe.invites.filter(c => c !== code);
      const updatedTribe = {
        type: 'tribe',
        replaces: tribe.id, 
        title: tribe.title,
        description: tribe.description,
        image: tribe.image,
        location: tribe.location,
        tags: tribe.tags,
        isLARP: tribe.isLARP,
        isAnonymous: tribe.isAnonymous,
        members: members,
        invites: updatedInvites,
        inviteMode: tribe.inviteMode,
        createdAt: tribe.createdAt,
        updatedAt: new Date().toISOString(),
        author: tribe.author,
        feed: tribe.feed
      };
      await this.publishUpdatedTribe(tribe.id, updatedTribe);
      return new Promise((res) => res(tribe.id));
    },

    async deleteTribeById(tribeId) {
       await this.publishTombstone(tribeId);
    },

    async updateTribeMembers(tribeId, members) {
      const ssb = await openSsb();
      const tribe = await this.getTribeById(tribeId);

      const updatedTribe = {
        type: 'tribe',
        replaces: tribeId,
        title: tribe.title,
        description: tribe.description,
        image: tribe.image,
        location: tribe.location,
        tags: tribe.tags,
        isLARP: tribe.isLARP,
        isAnonymous: tribe.isAnonymous,
        members: members,
        invites: tribe.invites,
        inviteMode: tribe.inviteMode,
        createdAt: tribe.createdAt,
        updatedAt: new Date().toISOString(),
        author: tribe.author,
        feed: tribe.feed
      };
      return this.publishUpdatedTribe(tribeId, updatedTribe);
    },

    async updateTribeFeed(tribeId, newFeed) {
      const ssb = await openSsb();
      const tribe = await this.getTribeById(tribeId);

      const updatedTribe = {
        type: 'tribe',
        replaces: tribeId,
        title: tribe.title,
        description: tribe.description,
        image: tribe.image,
        location: tribe.location,
        tags: tribe.tags,
        isLARP: tribe.isLARP,
        isAnonymous: tribe.isAnonymous,
        members: tribe.members,
        invites: tribe.invites,
        inviteMode: tribe.inviteMode,
        createdAt: tribe.createdAt,
        updatedAt: new Date().toISOString(),
        author: tribe.author,
        feed: newFeed
      };
      return this.publishUpdatedTribe(tribeId, updatedTribe);
    },

    async publishUpdatedTribe(tribeId, updatedTribe) {
      const ssb = await openSsb();
      const userId = ssb.id;
      await this.publishTombstone(tribeId);
      const updatedTribeData = {
        type: 'tribe',
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
        createdAt: updatedTribe.createdAt,
        updatedAt: new Date().toISOString(),
        author: updatedTribe.author,
        feed: updatedTribe.feed
      };
      return new Promise((resolve, reject) => {
         ssb.publish(updatedTribeData, (err, result) => err ? reject(err) : resolve(result));
      });
    },

    async getTribeById(tribeId) {
      const ssb = await openSsb();
      return new Promise((res, rej) => pull(
        ssb.createLogStream(),
        pull.collect((err, msgs) => {
          if (err) return rej(err);
          const tombstoned = new Set();
          const replaces = new Map();
          const tribes = new Map();
          for (const msg of msgs) {
            const k = msg.key;
            const c = msg.value?.content;
            if (!c) continue;
            if (c.type === 'tombstone' && c.target) tombstoned.add(c.target);
            if (c.type === 'tribe') {
              if (tombstoned.has(k)) continue;
              if (c.replaces) replaces.set(c.replaces, k);
              tribes.set(k, { id: k, content: c });
            }
          }
          let latestId = tribeId;
          while (replaces.has(latestId)) latestId = replaces.get(latestId);
          const tribe = tribes.get(latestId);
          if (!tribe) return rej(new Error('Tribe not found'));
          res({
            id: tribe.id,
            title: tribe.content.title,
            description: tribe.content.description,
            image: tribe.content.image || null,
            location: tribe.content.location,
            tags: Array.isArray(tribe.content.tags) ? tribe.content.tags : [],
            isLARP: tribe.content.isLARP,
            isAnonymous: tribe.content.isAnonymous,
            members: Array.isArray(tribe.content.members) ? tribe.content.members : [],
            invites: Array.isArray(tribe.content.invites) ? tribe.content.invites : [],
            inviteMode: tribe.content.inviteMode || 'strict',
            createdAt: tribe.content.createdAt,
            updatedAt: tribe.content.updatedAt,
            author: tribe.content.author,
            feed: Array.isArray(tribe.content.feed) ? tribe.content.feed : []
          });
        })
      ));
    },

    async listAll() {
      const ssb = await openSsb();
      return new Promise((res, rej) => pull(
        ssb.createLogStream(),
        pull.collect((err, msgs) => {
          if (err) return rej(err);
          const tombstoned = new Set();
          const replaces = new Map();
          const tribes = new Map();
          for (const msg of msgs) {
            const k = msg.key;
            const c = msg.value?.content;
            if (!c) continue;
            if (c.type === 'tombstone' && c.target) tombstoned.add(c.target);
            if (c.type === 'tribe') {
              if (tombstoned.has(k)) continue;
              if (c.replaces) replaces.set(c.replaces, k);
              tribes.set(k, { id: k, content: c });
            }
          }
          const seen = new Set();
          const finalTribes = [];

          for (const [originalId, { content }] of tribes.entries()) {
            let latestId = originalId;
            let latestVersion = content;
            while (replaces.has(latestId)) {
              latestId = replaces.get(latestId);
              const nextTribe = tribes.get(latestId);
              if (nextTribe && nextTribe.content.updatedAt > latestVersion.updatedAt) {
                latestVersion = nextTribe.content;
              }
            }
            if (!seen.has(latestId) && !tombstoned.has(latestId)) {
              seen.add(latestId);
              finalTribes.push({
                id: latestId,
                type: latestVersion.type,
                title: latestVersion.title,
                description: latestVersion.description,
                image: latestVersion.image || null,
                location: latestVersion.location,
                tags: Array.isArray(latestVersion.tags) ? latestVersion.tags : [],
                isLARP: latestVersion.isLARP || false,
                isAnonymous: latestVersion.isAnonymous === false ? false : true,
                members: Array.isArray(latestVersion.members) ? latestVersion.members : [],
                invites: Array.isArray(latestVersion.invites) ? latestVersion.invites : [],
                inviteMode: latestVersion.inviteMode || 'strict',
                createdAt: latestVersion.createdAt,
                updatedAt: latestVersion.updatedAt,
                author: latestVersion.author,
                feed: Array.isArray(latestVersion.feed) ? latestVersion.feed : []
              });
            }
          }
          res(finalTribes);
        })
      ));
    },
    
    async updateTribeById(tribeId, updatedContent) {
      const ssb = await openSsb();
      const tribe = await this.getTribeById(tribeId);
      if (!tribe) throw new Error('Tribe not found');
      const updatedTribe = {
        type: 'tribe',
        ...tribe,
        ...updatedContent,
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
      const tribe = await this.getTribeById(tribeId); 
      const tombstonedTribe = {
        type: 'tombstone',
        title: tribe.title,
        description: tribe.description,
        image: tribe.image,
        location: tribe.location,
        tags: tribe.tags,
        isLARP: tribe.isLARP,
        isAnonymous: tribe.isAnonymous,
        members: [],
        invites: [],
        inviteMode: tribe.inviteMode,
        createdAt: tribe.createdAt,
        updatedAt: new Date().toISOString(),
        author: tribe.author,
        feed: tribe.feed
      };
      return new Promise((resolve, reject) => {
        ssb.publish(tombstonedTribe, (err, result) => err ? reject(err) : resolve(result));
      });
    },

    async refeed(tribeId, messageId) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const tribe = await this.getTribeById(tribeId);
      if (!tribe.isAnonymous && !tribe.members.includes(userId)) throw new Error('Not a member');
      const feed = tribe.feed.map(item => {
        item.refeeds_inhabitants = item.refeeds_inhabitants || [];
        if (item.id === messageId && !item.refeeds_inhabitants.includes(userId)) {
          item.refeeds = (item.refeeds || 0) + 1;
          item.refeeds_inhabitants.push(userId);
        }
        return item;
      });
      await this.updateTribeFeed(tribeId, feed);
    },

    async postMessage(tribeId, message) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const tribe = await this.getTribeById(tribeId);
      if (!tribe.isAnonymous && !tribe.members.includes(userId)) throw new Error('Not a member');
      const now = Date.now();
      const feedItem = { type: 'feed', id: now.toString(), date: now, author: userId, message, refeeds: 0, refeeds_inhabitants: [] };
      const feed = [...tribe.feed, feedItem];
      await this.updateTribeFeed(tribeId, feed);
      return feedItem;
    }
  };
};

