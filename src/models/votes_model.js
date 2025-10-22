const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

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
    
    async updateVoteById(id, { question, deadline, options, tags }) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const oldMsg = await new Promise((res, rej) =>
        ssb.get(id, (err, msg) => err || !msg ? rej(new Error('Vote not found')) : res(msg))
      );
      const c = oldMsg.content;
      if (c.type !== 'votes') throw new Error('Invalid type');
      if (c.createdBy !== userId) throw new Error('Not the author');

      let newDeadline = c.deadline;
      if (deadline != null && deadline !== '') {
        const parsed = moment(deadline, moment.ISO_8601, true);
        if (!parsed.isValid() || parsed.isBefore(moment())) throw new Error('Invalid deadline');
        newDeadline = parsed.toISOString();
      }

      let newOptions = c.options;
      let newVotesMap = c.votes;
      let newTotalVotes = c.totalVotes;
      const optionsCambiaron = Array.isArray(options) && (
        options.length !== c.options.length ||
        options.some((o, i) => o !== c.options[i])
      );
      if (optionsCambiaron) {
        if (c.totalVotes > 0) {
          throw new Error('Cannot change options after voting has started');
        }
        newOptions = options;
        newVotesMap = newOptions.reduce((acc, opt) => (acc[opt] = 0, acc), {});
        newTotalVotes = 0;
      }

      const newTags =
        Array.isArray(tags) ? tags.filter(Boolean)
        : typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean)
        : c.tags || [];

      const updated = {
        ...c,
        replaces: id,
        question: question ?? c.question,
        deadline: newDeadline,
        options: newOptions,
        votes: newVotesMap,
        totalVotes: newTotalVotes,
        tags: newTags,
        updatedAt: new Date().toISOString()
      };
      return new Promise((res, rej) => ssb.publish(updated, (err, result) => err ? rej(err) : res(result)));
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

      const results = await new Promise((resolve, reject) => {
        pull(
          ssb.createLogStream({ limit: logLimit }),
          pull.collect((err, arr) => err ? reject(err) : resolve(arr))
        );
      });

      const votesByKey = new Map();
      const latestByRoot = new Map();

      for (const r of results) {
        const key = r.key;
        const v = r.value;
        const c = v && v.content;
        if (!c) continue;
        if (c.type === 'votes') {
          votesByKey.set(key, c);
          const ts = Number(v.timestamp || r.timestamp || Date.now());
          const root = c.replaces || key;
          const prev = latestByRoot.get(root);
          if (!prev || ts > prev.ts) latestByRoot.set(root, { key, ts });
        }
      }

      const latestEntry = latestByRoot.get(id);
      let latestId = latestEntry ? latestEntry.key : id;
      let content = votesByKey.get(latestId);

      if (!content) {
        const orig = await new Promise((res, rej) => ssb.get(id, (err, vote) => err ? rej(new Error('Vote not found')) : res(vote)));
        content = orig.content;
        latestId = id;
      }

      const status = content.status === 'OPEN' && moment(content.deadline).isBefore(now) ? 'CLOSED' : content.status;
      return { id, latestId, ...content, status };
    },

    async listAll(filter = 'all') {
      const ssb = await openSsb();
      const userId = ssb.id;
      const now = moment();

      return new Promise((resolve, reject) => {
        pull(ssb.createLogStream({ limit: logLimit }), 
        pull.collect((err, results) => {
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

