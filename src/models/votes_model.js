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
      if (!parsedDeadline.isValid()) throw new Error('Invalid deadline');
      if (parsedDeadline.isBefore(moment())) throw new Error('Deadline must be in the future');
      const tags = Array.isArray(tagsRaw) ? tagsRaw.filter(Boolean) : tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      const content = {
        type: 'votes',
        question,
        options,
        deadline: parsedDeadline.toISOString(),
        createdBy: userId,
        status: 'OPEN',
        votes: options.reduce((acc, opt) => { acc[opt] = 0; return acc; }, {}),
        totalVotes: 0,
        voters: [],
        tags,
        opinions: {},
        opinions_inhabitants: [],
        createdAt: new Date().toISOString()
      };
      return new Promise((resolve, reject) => {
        ssb.publish(content, (err, msg) => err ? reject(err) : resolve(msg));
      });
    },

    async updateVoteById(id, updatedData) {
      const ssb = await openSsb();
      const userId = ssb.id;
        const vote = await new Promise((resolve, reject) => {
          ssb.get(id, (err, vote) => {
          if (err || !vote?.content) return reject(new Error('Vote not found'));
        resolve(vote);
      });
    });

    if (vote.content.createdBy !== userId) {
      throw new Error('Not the author');
    }
    if (vote.content.totalVotes > 0) {
      throw new Error('Already voted');
    }
    const deadline = moment(vote.content.deadline);
    if (!deadline.isValid() || deadline.isBefore(moment())) {
      throw new Error('Deadline passed');
    }
    let tags = [];
    if (updatedData.tags) {
      if (Array.isArray(updatedData.tags)) {
        tags = updatedData.tags.filter(Boolean); 
      } else {
        tags = updatedData.tags.split(',').map(t => t.trim()).filter(Boolean);
      }
    } else {
      tags = vote.content.tags || [];
    }

    const tombstone = {
      type: 'tombstone',
      target: id,
      deletedAt: new Date().toISOString(),
      author: userId
    };

    const updated = {
      ...vote.content,
      ...updatedData,
      tags,
      updatedAt: new Date().toISOString(),
      replaces: id
    };
    await new Promise((resolve, reject) => {
      ssb.publish(tombstone, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
    const result = await new Promise((resolve, reject) => {
      ssb.publish(updated, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
      return result;
    },

    async deleteVoteById(id) {
      const ssb = await openSsb();
      const userId = ssb.id;
      return new Promise((resolve, reject) => {
        ssb.get(id, (err, vote) => {
          if (err || !vote?.content) return reject(new Error('Vote not found'));
          if (vote.content.createdBy !== userId) return reject(new Error('Not the author'));
          const tombstone = {
            type: 'tombstone',
            target: id,
            deletedAt: new Date().toISOString(),
            author: userId
          };
          ssb.publish(tombstone, (err, res) => err ? reject(err) : resolve(res));
        });
      });
    },

    async voteOnVote(id, choice) {
      const ssb = await openSsb();
      const userId = ssb.id;
      return new Promise((resolve, reject) => {
        ssb.get(id, (err, vote) => {
          if (err || !vote?.content) return reject(new Error('Vote not found'));
          const validChoices = vote.content.options || [];
          if (!validChoices.includes(choice)) return reject(new Error('Invalid choice'));
          const { voters = [], votes = {}, totalVotes = 0 } = vote.content;
          if (voters.includes(userId)) return reject(new Error('Already voted'));
          votes[choice] = (votes[choice] || 0) + 1;
          voters.push(userId);
          const tombstone = {
            type: 'tombstone',
            target: id,
            deletedAt: new Date().toISOString(),
            author: userId
          };
          const updated = {
            ...vote.content,
            votes,
            voters,
            totalVotes: totalVotes + 1,
            updatedAt: new Date().toISOString(),
            replaces: id
          };
          ssb.publish(tombstone, err => {
            if (err) return reject(err);
            ssb.publish(updated, (err2, res2) => err2 ? reject(err2) : resolve(res2));
          });
        });
      });
    },

    async getVoteById(id) {
      const ssb = await openSsb();
      return new Promise((resolve, reject) => {
        ssb.get(id, async (err, vote) => {
          if (err || !vote?.content) return reject(new Error('Vote not found'));
          const c = vote.content;
          const deadlineMoment = moment(c.deadline);
          let status = c.status || 'OPEN';
          if (deadlineMoment.isValid() && deadlineMoment.isBefore(moment()) && status !== 'CLOSED') {
            const tombstone = {
              type: 'tombstone',
              target: id,
              deletedAt: new Date().toISOString(),
              author: c.createdBy
            };
            const updated = {
              ...c,
              status: 'CLOSED',
              updatedAt: new Date().toISOString(),
              replaces: id
            };
            await ssb.publish(tombstone);
            await ssb.publish(updated);
            status = 'CLOSED';
          }
          resolve({
            id,
            question: c.question,
            options: c.options,
            votes: c.votes,
            totalVotes: c.totalVotes,
            status,
            deadline: c.deadline,
            createdBy: c.createdBy,
            createdAt: c.createdAt,
            tags: c.tags || [],
            opinions: c.opinions || {},
            opinions_inhabitants: c.opinions_inhabitants || []
          });
        });
      });
    },

    async listAll(filter = 'all') {
      const ssb = await openSsb();
      const userId = ssb.id;
      return new Promise((resolve, reject) => {
        pull(
          ssb.createLogStream(),
          pull.collect(async (err, results) => {
            if (err) return reject(err);
            const tombstoned = new Set();
            const replaces = new Map();
            const byId = new Map();
            const now = moment();
            for (const r of results) {
              const k = r.key;
              const c = r.value.content;
              if (!c) continue;
              if (c.type === 'tombstone' && c.target) {
                tombstoned.add(c.target);
                continue;
              }
              if (c.type === 'votes') {
                if (tombstoned.has(k)) continue;
                if (c.replaces) replaces.set(c.replaces, k);
                let status = c.status || 'OPEN';
                const deadline = moment(c.deadline);
                if (deadline.isValid() && deadline.isBefore(now) && status !== 'CLOSED') {
                  const tomb = {
                    type: 'tombstone',
                    target: k,
                    deletedAt: new Date().toISOString(),
                    author: c.createdBy
                  };
                  const updated = {
                    ...c,
                    status: 'CLOSED',
                    updatedAt: new Date().toISOString(),
                    replaces: k
                  };
                  await ssb.publish(tomb);
                  await ssb.publish(updated);
                  status = 'CLOSED';
                }
                byId.set(k, {
                  id: k,
                  question: c.question,
                  options: c.options,
                  votes: c.votes,
                  totalVotes: c.totalVotes,
                  status,
                  deadline: c.deadline,
                  createdBy: c.createdBy,
                  createdAt: c.createdAt,
                  tags: c.tags || [],
                  opinions: c.opinions || {},
                  opinions_inhabitants: c.opinions_inhabitants || []
                });
              }
            }
            for (const replaced of replaces.keys()) {
              byId.delete(replaced);
            }
            const out = Array.from(byId.values());
            if (filter === 'mine') return resolve(out.filter(v => v.createdBy === userId));
            if (filter === 'open') return resolve(out.filter(v => v.status === 'OPEN'));
            if (filter === 'closed') return resolve(out.filter(v => v.status === 'CLOSED'));
            resolve(out);
          })
        );
      });
    },

    async createOpinion(id, category) {
      const ssb = await openSsb();
      const userId = ssb.id;
      return new Promise((resolve, reject) => {
        ssb.get(id, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'votes') return reject(new Error('Vote not found'));
          if (msg.content.opinions_inhabitants?.includes(userId)) return reject(new Error('Already voted'));
          const tombstone = {
            type: 'tombstone',
            target: id,
            deletedAt: new Date().toISOString(),
            author: userId
          };
          const updated = {
            ...msg.content,
            opinions: {
              ...msg.content.opinions,
              [category]: (msg.content.opinions?.[category] || 0) + 1
            },
            opinions_inhabitants: [...(msg.content.opinions_inhabitants || []), userId],
            updatedAt: new Date().toISOString(),
            replaces: id
          };
          ssb.publish(tombstone, err => {
            if (err) return reject(err);
            ssb.publish(updated, (err2, result) => err2 ? reject(err2) : resolve(result));
          });
        });
      });
    }
  };
};

