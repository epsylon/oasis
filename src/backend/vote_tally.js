const INSTITUTIONAL_VOTE_TAG = /^(gov|govMethod|courtsCase|courtsMethod):/;

const msOf = (v) => {
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

const isLater = (a, b) => a.ts > b.ts || (a.ts === b.ts && a.seq > b.seq);

const legacyChoice = (kid, parent, options) => {
  const kVoters = Array.isArray(kid.content.voters) ? kid.content.voters : [];
  const pVoters = Array.isArray(parent.content.voters) ? parent.content.voters : [];
  if (!kVoters.includes(kid.author) || pVoters.includes(kid.author)) return null;
  const kVotes = kid.content.votes || {};
  const pVotes = parent.content.votes || {};
  let choice = null;
  for (const o of options) {
    const d = (Number(kVotes[o]) || 0) - (Number(pVotes[o]) || 0);
    if (d === 0) continue;
    if (d !== 1 || choice !== null) return null;
    choice = o;
  }
  return choice;
};

const buildVoteResults = (messages) => {
  const nodes = new Map();
  const ballotsByTarget = new Map();

  for (const m of messages || []) {
    const v = m && m.value;
    const c = v && v.content;
    if (!c) continue;
    const ts = Number(v.timestamp || m.timestamp || 0) || 0;
    const seq = Number(v.sequence || 0) || 0;
    if (c.type === 'votesVote') {
      if (typeof c.target !== 'string' || !v.author) continue;
      if (!ballotsByTarget.has(c.target)) ballotsByTarget.set(c.target, []);
      ballotsByTarget.get(c.target).push({ author: v.author, choice: c.choice, ts, seq });
      continue;
    }
    if (c.type !== 'votes') continue;
    nodes.set(m.key, { key: m.key, author: v.author, content: c, ts, seq });
  }

  const prev = new Map();
  for (const [k, n] of nodes) {
    const t = n.content.replaces;
    if (typeof t === 'string' && t !== k && nodes.has(t)) prev.set(k, t);
  }
  const rootOf = (k) => { let x = k, g = 0; while (prev.has(x) && g++ < 100000) x = prev.get(x); return x; };

  const groups = new Map();
  for (const k of nodes.keys()) { const r = rootOf(k); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(k); }

  const results = new Map();
  for (const [root, keys] of groups.entries()) {
    const rootNode = nodes.get(root);
    if (!rootNode) continue;
    const creator = rootNode.author;
    const tags = Array.isArray(rootNode.content.tags) ? rootNode.content.tags : [];
    const frozen = tags.some(t => INSTITUTIONAL_VOTE_TAG.test(String(t)));
    let current = rootNode;
    if (!frozen) {
      for (const k of keys) {
        const n = nodes.get(k);
        if (n.author === creator && isLater(n, current)) current = n;
      }
    }
    const options = Array.isArray(current.content.options) ? current.content.options.filter(o => typeof o === 'string') : [];
    const deadline = typeof current.content.deadline === 'string' ? current.content.deadline : null;
    const opensAt = rootNode.ts;
    const closesAt = deadline ? msOf(deadline) : null;

    const cast = [];
    for (const k of keys) {
      for (const b of ballotsByTarget.get(k) || []) cast.push(b);
      const n = nodes.get(k);
      if (n.author === creator || !prev.has(k)) continue;
      const choice = legacyChoice(n, nodes.get(prev.get(k)), options);
      if (choice !== null) cast.push({ author: n.author, choice, ts: n.ts, seq: n.seq });
    }

    const latest = new Map();
    for (const b of cast) {
      if (!b.author || b.author === creator) continue;
      if (!options.includes(b.choice)) continue;
      if (b.ts < opensAt) continue;
      if (closesAt !== null && b.ts > closesAt) continue;
      const known = latest.get(b.author);
      if (!known || isLater(b, known)) latest.set(b.author, b);
    }

    const votes = {};
    for (const o of options) votes[o] = 0;
    const voters = [];
    for (const b of [...latest.values()].sort((a, b) => a.ts - b.ts || a.seq - b.seq)) {
      votes[b.choice] = (votes[b.choice] || 0) + 1;
      voters.push(b.author);
    }

    const result = { votes, voters, totalVotes: voters.length, creator, rootId: root, deadline, options };
    for (const k of keys) results.set(k, result);
  }

  return results;
};

const buildVoteTally = (messages) => {
  const shared = new Map();
  const tallyByKey = new Map();
  for (const [k, r] of buildVoteResults(messages)) {
    if (!shared.has(r)) shared.set(r, { votes: r.votes, voters: r.voters, totalVotes: r.totalVotes });
    tallyByKey.set(k, shared.get(r));
  }
  return tallyByKey;
};

module.exports = { buildVoteTally, buildVoteResults };
