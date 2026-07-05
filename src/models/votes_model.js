const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { getConfig } = require('../configs/config-manager.js');
const { dedupeBy, norm } = require('../backend/dedupe');
const { buildVoteTally } = require('../backend/vote_tally');
const categories = require('../backend/opinion_categories');
const logLimit = getConfig().ssbLogStream?.limit || 1000;
const MIN_VOTE_DAYS = 7;

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
    const tombstoned = buildValidatedTombstoneSet(messages);
    const votes = new Map();
    const naivePrev = new Map();
    const collabVotes = [];
    const collabOpinions = [];

    for (const m of messages) {
      const key = m.key;
      const v = m.value;
      const c = v && v.content;
      if (!c) continue;

      if (c.type === 'tombstone') continue;
      if (c.type === 'votesVote') { collabVotes.push({ target: c.target, author: v.author, choice: c.choice, ts: v.timestamp || 0 }); continue; }
      if (c.type === 'votesOpinion') { collabOpinions.push({ target: c.target, author: v.author, category: c.category, ts: v.timestamp || 0 }); continue; }
      if (c.type !== TYPE) continue;

      votes.set(key, { key, ts: v.timestamp || m.timestamp || 0, content: c, author: v.author });
    }

    for (const [key, node] of votes) {
      const t = node.content.replaces;
      if (t) { naivePrev.set(key, t); }
    }

    return { tombstoned, votes, naivePrev, collabVotes, collabOpinions, voteTallyByKey: buildVoteTally(messages) };
  }

  const rootOfIn = (naivePrev, votes, key) => { let x = key, g = 0; while (naivePrev.has(x) && votes.has(naivePrev.get(x)) && g++ < 100000) x = naivePrev.get(x); return x; };

  function statusFromContent(content, now) {
    const raw = String(content.status || 'OPEN').toUpperCase();
    if (raw === 'OPEN') {
      const dl = content.deadline ? moment(content.deadline) : null;
      if (dl && dl.isValid() && dl.isBefore(now)) return 'CLOSED';
    }
    return raw;
  }

  function computeActiveVotes(index) {
    const { tombstoned, votes, naivePrev, collabVotes, collabOpinions } = index;
    const rootOf = key => rootOfIn(naivePrev, votes, key);

    const groups = new Map();
    for (const [key, node] of votes.entries()) {
      const root = rootOf(key);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(node);
    }

    const cvByRoot = new Map(); const coByRoot = new Map();
    for (const cv of collabVotes) { if (!votes.has(cv.target)) continue; const r = rootOf(cv.target); if (!cvByRoot.has(r)) cvByRoot.set(r, []); cvByRoot.get(r).push(cv); }
    for (const co of collabOpinions) { if (!votes.has(co.target)) continue; const r = rootOf(co.target); if (!coByRoot.has(r)) coByRoot.set(r, []); coByRoot.get(r).push(co); }

    const now = moment();
    const result = [];

    for (const [root, nodes] of groups.entries()) {
      const rootNode = votes.get(root);
      const rootAuthor = rootNode ? rootNode.author : null;
      const ownerNodes = nodes.filter(n => n.author === rootAuthor);
      const pool = ownerNodes.length ? ownerNodes : (rootNode ? [rootNode] : nodes);

      let best = pool[0];
      let bestStatus = statusFromContent(best.content, now);
      for (let i = 1; i < pool.length; i++) {
        const candidate = pool[i];
        const cStatus = statusFromContent(candidate.content, now);
        if (cStatus === bestStatus) {
          const bestTime = new Date(best.content.updatedAt || best.content.createdAt || best.ts || 0);
          const cTime = new Date(candidate.content.updatedAt || candidate.content.createdAt || candidate.ts || 0);
          if (cTime > bestTime) { best = candidate; bestStatus = cStatus; }
        } else if (cStatus === 'CLOSED' && bestStatus !== 'CLOSED') { best = candidate; bestStatus = cStatus; }
        else if (cStatus === 'OPEN' && bestStatus !== 'OPEN') { best = candidate; bestStatus = cStatus; }
      }

      if (tombstoned.has(best.key)) continue;

      const lc = best.content;
      const options = Array.isArray(best.content.options) ? best.content.options : [];

      const tally = index.voteTallyByKey ? index.voteTallyByKey.get(best.key) : null;
      let votesMap;
      let voters;
      let totalVotes;
      if (tally) {
        votesMap = Object.assign({}, tally.votes || {});
        for (const o of options) if (!(o in votesMap)) votesMap[o] = 0;
        voters = tally.voters.slice();
        totalVotes = tally.totalVotes;
      } else {
        votesMap = Object.assign({}, lc.votes || {});
        for (const o of options) if (!(o in votesMap)) votesMap[o] = 0;
        voters = Array.isArray(lc.voters) ? lc.voters.slice() : [];
        const voterSet = new Set(voters);
        totalVotes = parseInt(lc.totalVotes || 0, 10) || voters.length;
        for (const cv of (cvByRoot.get(root) || [])) {
          if (voterSet.has(cv.author)) continue;
          if (!options.includes(cv.choice)) continue;
          voterSet.add(cv.author); voters.push(cv.author);
          votesMap[cv.choice] = (votesMap[cv.choice] || 0) + 1;
          totalVotes += 1;
        }
      }

      const opinions = Object.assign({}, lc.opinions || {});
      const opInh = Array.isArray(lc.opinions_inhabitants) ? lc.opinions_inhabitants.slice() : [];
      const opSet = new Set(opInh);
      for (const co of (coByRoot.get(root) || [])) {
        if (opSet.has(co.author)) continue;
        opSet.add(co.author); opInh.push(co.author);
        opinions[co.category] = (opinions[co.category] || 0) + 1;
      }

      result.push({
        id: best.key,
        latestId: best.key,
        ...best.content,
        votes: votesMap,
        voters,
        totalVotes,
        opinions,
        opinions_inhabitants: opInh,
        status: bestStatus
      });
    }

    return result;
  }

  async function resolveCurrentId(voteId) {
    const ssbClient = await openSsb();
    const messages = await getAllMessages(ssbClient);
    const nodeByKey = new Map();
    for (const m of messages) { const c = m.value && m.value.content; if (c && c.type === TYPE) nodeByKey.set(m.key, { author: m.value.author, replaces: c.replaces }); }
    const strictForward = new Map();
    for (const [key, n] of nodeByKey) { if (n.replaces && nodeByKey.has(n.replaces) && nodeByKey.get(n.replaces).author === n.author) strictForward.set(n.replaces, key); }
    let cur = voteId, g = 0;
    while (strictForward.has(cur) && g++ < 100000) cur = strictForward.get(cur);
    return cur;
  }

  return {
    async createVote(question, deadline, options = ['YES', 'NO', 'ABSTENTION', 'CONFUSED', 'FOLLOW_MAJORITY', 'NOT_INTERESTED'], tagsRaw = []) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const parsedDeadline = moment(deadline, moment.ISO_8601, true);
      if (!parsedDeadline.isValid()) throw new Error('Invalid deadline');
      if (parsedDeadline.isBefore(moment().add(MIN_VOTE_DAYS, 'days').subtract(2, 'minutes'))) throw new Error(`Deadline must be at least ${MIN_VOTE_DAYS} days from now`);

      const tags = Array.isArray(tagsRaw)
        ? tagsRaw.filter(Boolean)
        : String(tagsRaw || '').split(',').map(t => t.trim()).filter(Boolean);

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
      const agg = await this.getVoteById(id);
      const aggTotalVotes = agg ? (parseInt(agg.totalVotes || 0, 10) || 0) : 0;
      if (agg && Object.keys(agg.opinions || {}).some(k => (agg.opinions[k] || 0) > 0)) throw new Error('Cannot edit vote after it has received opinions.');

      let newDeadline = c.deadline;
      if (deadline != null && deadline !== '') {
        const parsed = moment(deadline, moment.ISO_8601, true);
        if (!parsed.isValid()) throw new Error('Invalid deadline');
        if (parsed.isBefore(moment().add(MIN_VOTE_DAYS, 'days').subtract(2, 'minutes'))) throw new Error(`Deadline must be at least ${MIN_VOTE_DAYS} days from now`);
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
        if (aggTotalVotes > 0) {
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
      const vote = await this.getVoteById(id);
      if (!vote) throw new Error('Vote not found');
      if (vote.createdBy === userId) throw new Error('Creator cannot vote');
      const options = Array.isArray(vote.options) ? vote.options : [];
      if (!options.includes(choice)) throw new Error('Invalid choice');
      if (Array.isArray(vote.voters) && vote.voters.includes(userId)) throw new Error('Already voted');

      const content = { type: 'votesVote', target: vote.id, choice, createdAt: new Date().toISOString() };
      return new Promise((res, rej) =>
        ssbClient.publish(content, (err, result) => (err ? rej(err) : res(result)))
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

      const rootOf = key => rootOfIn(index.naivePrev, index.votes, key);
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

      const deduped = dedupeBy(list, v => v.question ? [norm(v.createdBy), norm(v.question), norm(v.deadline)].join('|') : null);
      return deduped.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async createOpinion(id, category) {
      if (!categories.includes(category)) throw new Error('Invalid voting category');
      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      const vote2 = await this.getVoteById(id);
      if (!vote2) throw new Error('Vote not found');
      if (Array.isArray(vote2.opinions_inhabitants) && vote2.opinions_inhabitants.includes(userId)) throw new Error('Already voted');

      const content = { type: 'votesOpinion', target: vote2.id, category, createdAt: new Date().toISOString() };
      return new Promise((res, rej) =>
        ssbClient.publish(content, (err, result) => (err ? rej(err) : res(result)))
      );
    }
  };
};

