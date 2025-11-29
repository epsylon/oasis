const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { getConfig } = require('../configs/config-manager.js');
const categories = require('../backend/opinion_categories')
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const TYPE = 'votes';

  async function getAllMessages(ssbClient) {
    return new Promise((resolve, reject) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, results) => (err ? reject(err) : resolve(results)))
      );
    });
  }

  function buildIndex(messages) {
    const tombstoned = new Set();
    const replaced = new Map();
    const votes = new Map();
    const parent = new Map();

    for (const m of messages) {
      const key = m.key;
      const v = m.value;
      const c = v && v.content;
      if (!c) continue;
      if (c.type === 'tombstone' && c.target) {
        tombstoned.add(c.target);
        continue;
      }
      if (c.type !== TYPE) continue;
      const node = {
        key,
        ts: v.timestamp || m.timestamp || 0,
        content: c
      };
      votes.set(key, node);
      if (c.replaces) {
        replaced.set(c.replaces, key);
        parent.set(key, c.replaces);
      }
    }

    return { tombstoned, replaced, votes, parent };
  }

  function statusFromContent(content, now) {
    const raw = String(content.status || 'OPEN').toUpperCase();
    if (raw === 'OPEN') {
      const dl = content.deadline ? moment(content.deadline) : null;
      if (dl && dl.isValid() && dl.isBefore(now)) return 'CLOSED';
    }
    return raw;
  }

  function computeActiveVotes(index) {
    const { tombstoned, replaced, votes, parent } = index;
    const active = new Map(votes);

    tombstoned.forEach(id => active.delete(id));
    replaced.forEach((_, oldId) => active.delete(oldId));

    const rootOf = id => {
      let cur = id;
      while (parent.has(cur)) cur = parent.get(cur);
      return cur;
    };

    const groups = new Map();
    for (const [id, node] of active.entries()) {
      const root = rootOf(id);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(node);
    }

    const now = moment();
    const result = [];

    for (const nodes of groups.values()) {
      if (!nodes.length) continue;
      let best = nodes[0];
      let bestStatus = statusFromContent(best.content, now);

      for (let i = 1; i < nodes.length; i++) {
        const candidate = nodes[i];
        const cStatus = statusFromContent(candidate.content, now);
        if (cStatus === bestStatus) {
          const bestTime = new Date(best.content.updatedAt || best.content.createdAt || best.ts || 0);
          const cTime = new Date(candidate.content.updatedAt || candidate.content.createdAt || candidate.ts || 0);
          if (cTime > bestTime) {
            best = candidate;
            bestStatus = cStatus;
          }
        } else if (cStatus === 'CLOSED' && bestStatus !== 'CLOSED') {
          best = candidate;
          bestStatus = cStatus;
        } else if (cStatus === 'OPEN' && bestStatus !== 'OPEN') {
          best = candidate;
          bestStatus = cStatus;
        }
      }

      result.push({
        id: best.key,
        latestId: best.key,
        ...best.content,
        status: bestStatus
      });
    }

    return result;
  }

  async function resolveCurrentId(voteId) {
    const ssbClient = await openSsb();
    const messages = await getAllMessages(ssbClient);
    const forward = new Map();

    for (const m of messages) {
      const c = m.value && m.value.content;
      if (!c) continue;
      if (c.type === TYPE && c.replaces) {
        forward.set(c.replaces, m.key);
      }
    }

    let cur = voteId;
    while (forward.has(cur)) cur = forward.get(cur);
    return cur;
  }

  return {
    async createVote(question, deadline, options = ['YES', 'NO', 'ABSTENTION', 'CONFUSED', 'FOLLOW_MAJORITY', 'NOT_INTERESTED'], tagsRaw = []) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const parsedDeadline = moment(deadline, moment.ISO_8601, true);
      if (!parsedDeadline.isValid() || parsedDeadline.isBefore(moment())) throw new Error('Invalid deadline');

      const tags = Array.isArray(tagsRaw)
        ? tagsRaw.filter(Boolean)
        : String(tagsRaw).split(',').map(t => t.trim()).filter(Boolean);

      const content = {
        type: TYPE,
        question,
        options,
        deadline: parsedDeadline.toISOString(),
        createdBy: userId,
        status: 'OPEN',
        votes: options.reduce((acc, opt) => {
          acc[opt] = 0;
          return acc;
        }, {}),
        totalVotes: 0,
        voters: [],
        tags,
        opinions: {},
        opinions_inhabitants: [],
        createdAt: new Date().toISOString(),
        updatedAt: null
      };

      return new Promise((res, rej) =>
        ssbClient.publish(content, (err, msg) => (err ? rej(err) : res(msg)))
      );
    },

    async deleteVoteById(id) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await resolveCurrentId(id);
      const vote = await new Promise((res, rej) =>
        ssbClient.get(tipId, (err, msg) => (err || !msg ? rej(new Error('Vote not found')) : res(msg)))
      );
      if (!vote.content || vote.content.createdBy !== userId) throw new Error('Not the author');
      const tombstone = {
        type: 'tombstone',
        target: tipId,
        deletedAt: new Date().toISOString(),
        author: userId
      };
      return new Promise((res, rej) =>
        ssbClient.publish(tombstone, (err, result) => (err ? rej(err) : res(result)))
      );
    },

    async updateVoteById(id, payload) {
      const { question, deadline, options, tags } = payload || {};
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await resolveCurrentId(id);

      const oldMsg = await new Promise((res, rej) =>
        ssbClient.get(tipId, (err, msg) => (err || !msg ? rej(new Error('Vote not found')) : res(msg)))
      );

      const c = oldMsg.content;
      if (!c || c.type !== TYPE) throw new Error('Invalid type');
      if (c.createdBy !== userId) throw new Error('Not the author');
      if (Object.keys(c.opinions || {}).length > 0) throw new Error('Cannot edit vote after it has received opinions.')

      let newDeadline = c.deadline;
      if (deadline != null && deadline !== '') {
        const parsed = moment(deadline, moment.ISO_8601, true);
        if (!parsed.isValid() || parsed.isBefore(moment())) throw new Error('Invalid deadline');
        newDeadline = parsed.toISOString();
      }

      let newOptions = c.options || [];
      let newVotesMap = c.votes || {};
      let newTotalVotes = c.totalVotes || 0;

      const optionsChanged = Array.isArray(options) && (
        options.length !== newOptions.length ||
        options.some((o, i) => o !== newOptions[i])
      );

      if (optionsChanged) {
        if ((c.totalVotes || 0) > 0) {
          throw new Error('Cannot change options after voting has started');
        }
        newOptions = options;
        newVotesMap = newOptions.reduce((acc, opt) => {
          acc[opt] = 0;
          return acc;
        }, {});
        newTotalVotes = 0;
      }

      let newTags = c.tags || [];
      if (Array.isArray(tags)) {
        newTags = tags.filter(Boolean);
      } else if (typeof tags === 'string') {
        newTags = tags.split(',').map(t => t.trim()).filter(Boolean);
      }

      const updated = {
        ...c,
        replaces: tipId,
        question: question != null ? question : c.question,
        deadline: newDeadline,
        options: newOptions,
        votes: newVotesMap,
        totalVotes: newTotalVotes,
        tags: newTags,
        updatedAt: new Date().toISOString()
      };

      return new Promise((res, rej) =>
        ssbClient.publish(updated, (err, result) => (err ? rej(err) : res(result)))
      );
    },

    async voteOnVote(id, choice) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await resolveCurrentId(id);

      const vote = await new Promise((res, rej) =>
        ssbClient.get(tipId, (err, msg) => (err || !msg ? rej(new Error('Vote not found')) : res(msg)))
      );

      const content = vote.content || {};
      const options = Array.isArray(content.options) ? content.options : [];
      if (!options.includes(choice)) throw new Error('Invalid choice');

      const voters = Array.isArray(content.voters) ? content.voters.slice() : [];
      if (voters.includes(userId)) throw new Error('Already voted');

      const votesMap = Object.assign({}, content.votes || {});
      votesMap[choice] = (votesMap[choice] || 0) + 1;
      voters.push(userId);
      const totalVotes = (parseInt(content.totalVotes || 0, 10) || 0) + 1;

      const tombstone = {
        type: 'tombstone',
        target: tipId,
        deletedAt: new Date().toISOString(),
        author: userId
      };

      const updated = {
        ...content,
        votes: votesMap,
        voters,
        totalVotes,
        updatedAt: new Date().toISOString(),
        replaces: tipId
      };

      await new Promise((res, rej) =>
        ssbClient.publish(tombstone, err => (err ? rej(err) : res()))
      );

      return new Promise((res, rej) =>
        ssbClient.publish(updated, (err, result) => (err ? rej(err) : res(result)))
      );
    },

    async getVoteById(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const index = buildIndex(messages);
      const activeList = computeActiveVotes(index);
      const byId = new Map(activeList.map(v => [v.id, v]));

      if (byId.has(id)) {
        return byId.get(id);
      }

      const parent = index.parent;
      const rootOf = key => {
        let cur = key;
        while (parent.has(cur)) cur = parent.get(cur);
        return cur;
      };

      const root = rootOf(id);
      const candidate = activeList.find(v => rootOf(v.id) === root);
      if (candidate) {
        return candidate;
      }

      const msg = await new Promise((res, rej) =>
        ssbClient.get(id, (err, vote) => (err || !vote ? rej(new Error('Vote not found')) : res(vote)))
      );

      const content = msg.content || {};
      const status = statusFromContent(content, moment());

      return {
        id,
        latestId: id,
        ...content,
        status
      };
    },

    async listAll(filter = 'all') {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const messages = await getAllMessages(ssbClient);
      const index = buildIndex(messages);
      let list = computeActiveVotes(index);

      if (filter === 'mine') {
        list = list.filter(v => v.createdBy === userId);
      } else if (filter === 'open') {
        list = list.filter(v => v.status === 'OPEN');
      } else if (filter === 'closed') {
        list = list.filter(v => v.status === 'CLOSED');
      }

      return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async createOpinion(id, category) {
      if (!categories.includes(category)) throw new Error('Invalid voting category')
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await resolveCurrentId(id);

      const vote = await new Promise((res, rej) =>
        ssbClient.get(tipId, (err, msg) => (err || !msg ? rej(new Error('Vote not found')) : res(msg)))
      );

      const content = vote.content || {};
      const list = Array.isArray(content.opinions_inhabitants) ? content.opinions_inhabitants : [];

      if (list.includes(userId)) throw new Error('Already voted');

      const opinions = Object.assign({}, content.opinions || {});
      opinions[category] = (opinions[category] || 0) + 1;

      const tombstone = {
        type: 'tombstone',
        target: tipId,
        deletedAt: new Date().toISOString(),
        author: userId
      };

      const updated = {
        ...content,
        opinions,
        opinions_inhabitants: list.concat(userId),
        updatedAt: new Date().toISOString(),
        replaces: tipId
      };

      await new Promise((res, rej) =>
        ssbClient.publish(tombstone, err => (err ? rej(err) : res()))
      );

      return new Promise((res, rej) =>
        ssbClient.publish(updated, (err, result) => (err ? rej(err) : res(result)))
      );
    }
  };
};

