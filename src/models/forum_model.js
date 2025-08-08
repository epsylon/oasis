const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler }) => {
  let ssb, userId;

  const openSsb = async () => {
    if (!ssb) {
      ssb = await cooler.open();
      userId = ssb.id;
    }
    return ssb;
  };

  async function collectTombstones(ssbClient) {
    return new Promise((resolve, reject) => {
      const tomb = new Set();
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.filter(m => m.value.content?.type === 'tombstone' && m.value.content.target),
        pull.drain(m => tomb.add(m.value.content.target), err => err ? reject(err) : resolve(tomb))
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
    createForum: async (category, title, text) => {
      const ssbClient = await openSsb();
      const content = {
        type: 'forum',
        category,
        title,
        text,
        createdAt: new Date().toISOString(),
        author: userId,
        votes: { positives: 0, negatives: 0 },
        votes_inhabitants: []
      };
      return new Promise((resolve, reject) =>
        ssbClient.publish(content, (err, res) => err ? reject(err) : resolve({ key: res.key, ...content }))
      );
    },

    addMessageToForum: async (forumId, message, parentId = null) => {
      const ssbClient = await openSsb();
      const content = {
        ...message,
        root: forumId,
        type: 'forum',
        author: userId,
        timestamp: new Date().toISOString(),
        votes: { positives: 0, negatives: 0 },
        votes_inhabitants: []
      };
      if (parentId) content.branch = parentId;
      return new Promise((resolve, reject) =>
        ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res))
      );
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
      const deleted = new Set(
        msgs.filter(m => m.value.content?.type === 'tombstone').map(m => m.value.content.target)
      );
      const forums = msgs
        .filter(m => m.value.content?.type === 'forum' && !m.value.content.root && !deleted.has(m.key))
        .map(m => ({ ...m.value.content, key: m.key }));
      const forumsWithVotes = await Promise.all(
        forums.map(async f => {
          const { positives, negatives } = await aggregateVotes(ssbClient, f.key);
          return { ...f, positiveVotes: positives, negativeVotes: negatives };
        })
      );
      const repliesByRoot = {};
      msgs.forEach(m => {
        const c = m.value.content;
        if (c?.type === 'forum' && c.root && !deleted.has(m.key)) {
          repliesByRoot[c.root] = repliesByRoot[c.root] || [];
          repliesByRoot[c.root].push({ key: m.key, text: c.text, author: c.author, timestamp: m.value.timestamp });
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
      const deleted = new Set(
        msgs.filter(m => m.value.content?.type === 'tombstone').map(m => m.value.content.target)
      );
      const original = msgs.find(m => m.key === id && !deleted.has(m.key));
      if (!original || original.value.content?.type !== 'forum') throw new Error('Forum not found');
      const base = original.value.content;
      const { positives, negatives } = await aggregateVotes(ssbClient, id);
      return {
        ...base,
        key: id,
        positiveVotes: positives,
        negativeVotes: negatives,
        score: positives - negatives
      };
    },

    getMessagesByForumId: async forumId => {
      const ssbClient = await openSsb();
      const msgs = await new Promise((res, rej) =>
        pull(ssbClient.createLogStream({ limit: logLimit }), 
        pull.collect((err, data) => err ? rej(err) : res(data)))
      );
      const deleted = new Set(
        msgs.filter(m => m.value.content?.type === 'tombstone').map(m => m.value.content.target)
      );
      const replies = msgs
        .filter(m => m.value.content?.type === 'forum' && m.value.content.root === forumId && !deleted.has(m.key))
        .map(m => ({
          key: m.key,
          text: m.value.content.text,
          author: m.value.content.author,
          timestamp: m.value.timestamp,
          parent: m.value.content.branch || null
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

