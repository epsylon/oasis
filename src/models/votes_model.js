const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  return {
    async createVote(question, deadline, options = ['YES', 'NO', 'ABSTENTION', 'CONFUSED', 'FOLLOW_MAJORITY', 'NOT_INTERESTED'], tagsRaw = []) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const parsedDeadline = moment(deadline, moment.ISO_8601, true);
      if (!parsedDeadline.isValid() || parsedDeadline.isBefore(moment())) throw new Error('Invalid deadline');
      const tags = Array.isArray(tagsRaw) ? tagsRaw.filter(Boolean) : tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      const content = {
        type: 'votes',
        question,
        options,
        deadline: parsedDeadline.toISOString(),
        createdBy: userId,
        status: 'OPEN',
        votes: options.reduce((acc, opt) => ({ ...acc, [opt]: 0 }), {}),
        totalVotes: 0,
        voters: [],
        tags,
        opinions: {},
        opinions_inhabitants: [],
        createdAt: new Date().toISOString()
      };
      return new Promise((res, rej) => ssb.publish(content, (err, msg) => err ? rej(err) : res(msg)));
    },

    async deleteVoteById(id) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const vote = await new Promise((res, rej) => ssb.get(id, (err, vote) => err ? rej(new Error('Vote not found')) : res(vote)));
      if (vote.content.createdBy !== userId) throw new Error('Not the author');
      const tombstone = { type: 'tombstone', target: id, deletedAt: new Date().toISOString(), author: userId };
      return new Promise((res, rej) => ssb.publish(tombstone, (err, result) => err ? rej(err) : res(result)));
    },

    async voteOnVote(id, choice) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const vote = await new Promise((res, rej) => ssb.get(id, (err, vote) => err ? rej(new Error('Vote not found')) : res(vote)));
      if (!vote.content.options.includes(choice)) throw new Error('Invalid choice');
      if (vote.content.voters.includes(userId)) throw new Error('Already voted');
      vote.content.votes[choice] += 1;
      vote.content.voters.push(userId);
      vote.content.totalVotes += 1;
      const tombstone = { type: 'tombstone', target: id, deletedAt: new Date().toISOString(), author: userId };
      const updated = { ...vote.content, updatedAt: new Date().toISOString(), replaces: id };
      await new Promise((res, rej) => ssb.publish(tombstone, err => err ? rej(err) : res()));
      return new Promise((res, rej) => ssb.publish(updated, (err, result) => err ? rej(err) : res(result)));
    },

    async getVoteById(id) {
      const ssb = await openSsb();
      const now = moment();
      const vote = await new Promise((res, rej) => ssb.get(id, (err, vote) => err ? rej(new Error('Vote not found')) : res(vote)));
      const c = vote.content;
      const status = c.status === 'OPEN' && moment(c.deadline).isBefore(now) ? 'CLOSED' : c.status;
      return { id, ...c, status };
    },

    async listAll(filter = 'all') {
      const ssb = await openSsb();
      const userId = ssb.id;
      const now = moment();
      return new Promise((resolve, reject) => {
        pull(ssb.createLogStream(), pull.collect((err, results) => {
          if (err) return reject(err);
          const tombstoned = new Set();
          const replaced = new Map();
          const votes = new Map();

          for (const r of results) {
            const { key, value: { content: c } } = r;
            if (!c) continue;
            if (c.type === 'tombstone') tombstoned.add(c.target);
            if (c.type === 'votes') {
              if (c.replaces) replaced.set(c.replaces, key);
              const status = c.status === 'OPEN' && moment(c.deadline).isBefore(now) ? 'CLOSED' : c.status;
              votes.set(key, { id: key, ...c, status });
            }
          }

          tombstoned.forEach(id => votes.delete(id));
          replaced.forEach((_, oldId) => votes.delete(oldId));

          const out = [...votes.values()];
          if (filter === 'mine') return resolve(out.filter(v => v.createdBy === userId));
          if (filter === 'open') return resolve(out.filter(v => v.status === 'OPEN'));
          if (filter === 'closed') return resolve(out.filter(v => v.status === 'CLOSED'));
          resolve(out);
        }));
      });
    },

    async createOpinion(id, category) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const vote = await new Promise((res, rej) => ssb.get(id, (err, vote) => err ? rej(new Error('Vote not found')) : res(vote)));
      if (vote.content.opinions_inhabitants.includes(userId)) throw new Error('Already voted');
      const tombstone = { type: 'tombstone', target: id, deletedAt: new Date().toISOString(), author: userId };
      const updated = {
        ...vote.content,
        opinions: { ...vote.content.opinions, [category]: (vote.content.opinions[category] || 0) + 1 },
        opinions_inhabitants: [...vote.content.opinions_inhabitants, userId],
        updatedAt: new Date().toISOString(),
        replaces: id
      };
      await new Promise((res, rej) => ssb.publish(tombstone, err => err ? rej(err) : res()));
      return new Promise((res, rej) => ssb.publish(updated, (err, result) => err ? rej(err) : res(result)));
    }
  };
};

