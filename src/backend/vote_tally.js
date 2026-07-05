const buildVoteTally = (messages) => {
  const nodes = new Map();
  const ballots = [];

  for (const m of messages) {
    const v = m && m.value;
    const c = v && v.content;
    if (!c) continue;
    if (c.type === 'votesVote') { if (c.target) ballots.push({ target: c.target, author: v.author, choice: c.choice }); continue; }
    if (c.type !== 'votes') continue;
    nodes.set(m.key, { key: m.key, author: v.author, content: c, ts: v.timestamp || m.timestamp || 0 });
  }

  const prev = new Map();
  for (const [k, n] of nodes) {
    const t = n.content.replaces;
    if (typeof t === 'string' && nodes.has(t)) prev.set(k, t);
  }
  const childrenOf = new Map();
  for (const [k, p] of prev) {
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    childrenOf.get(p).push(k);
  }
  const rootOf = (k) => { let x = k, g = 0; while (prev.has(x) && g++ < 100000) x = prev.get(x); return x; };

  const groups = new Map();
  for (const k of nodes.keys()) { const r = rootOf(k); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(k); }

  const tallyByKey = new Map();
  for (const [root, keys] of groups.entries()) {
    const rootNode = nodes.get(root);
    if (!rootNode) continue;
    const options = Array.isArray(rootNode.content.options) ? rootNode.content.options : [];
    let votesMap = Object.assign({}, rootNode.content.votes || {});
    let voters = Array.isArray(rootNode.content.voters) ? rootNode.content.voters.slice() : [];
    for (const o of options) if (!(o in votesMap)) votesMap[o] = 0;

    let cur = root;
    let g = 0;
    let creatorChoice = null;
    let creatorCounted = false;
    while (g++ < 100000) {
      const kids = (childrenOf.get(cur) || []).map(k => nodes.get(k)).filter(Boolean).sort((a, b) => a.ts - b.ts);
      if (!kids.length) break;
      let advanced = false;
      for (const kid of kids) {
        const kVotes = Object.assign({}, kid.content.votes || {});
        const kVoters = Array.isArray(kid.content.voters) ? kid.content.voters.slice() : [];
        for (const o of options) if (!(o in kVotes)) kVotes[o] = 0;
        if (kid.author === rootNode.author) {
          if (!creatorCounted && kVoters.includes(rootNode.author) && !voters.includes(rootNode.author)) {
            creatorCounted = true;
            let inc = null;
            let incCount = 0;
            for (const o of options) {
              const d = (Number(kVotes[o]) || 0) - (Number(votesMap[o]) || 0);
              if (d >= 1) { inc = o; incCount++; }
            }
            if (incCount === 1) creatorChoice = inc;
          }
          votesMap = kVotes;
          voters = kVoters;
          cur = kid.key;
          advanced = true;
          break;
        }
        if (voters.includes(kid.author)) continue;
        if (kVoters.length !== voters.length + 1) continue;
        const added = kVoters.filter(x => !voters.includes(x));
        if (added.length !== 1 || added[0] !== kid.author) continue;
        let deltas = 0;
        let deltaOk = true;
        for (const o of options) {
          const d = (Number(kVotes[o]) || 0) - (Number(votesMap[o]) || 0);
          if (d === 0) continue;
          if (d === 1) { deltas++; continue; }
          deltaOk = false;
          break;
        }
        if (!deltaOk || deltas !== 1) continue;
        votesMap = kVotes;
        voters = kVoters;
        cur = kid.key;
        advanced = true;
        break;
      }
      if (!advanced) break;
    }

    if (voters.includes(rootNode.author)) {
      voters = voters.filter(x => x !== rootNode.author);
      if (creatorChoice && (Number(votesMap[creatorChoice]) || 0) > 0) votesMap[creatorChoice] = votesMap[creatorChoice] - 1;
    }

    const voterSet = new Set(voters);
    let totalVotes = voters.length;
    const chainKeys = new Set(keys);
    for (const b of ballots) {
      if (!chainKeys.has(b.target)) continue;
      if (b.author === rootNode.author) continue;
      if (!b.author || voterSet.has(b.author)) continue;
      if (!options.includes(b.choice)) continue;
      voterSet.add(b.author);
      voters.push(b.author);
      votesMap[b.choice] = (votesMap[b.choice] || 0) + 1;
      totalVotes += 1;
    }

    const tally = { votes: votesMap, voters, totalVotes };
    for (const k of keys) tallyByKey.set(k, tally);
  }

  return tallyByKey;
};

module.exports = { buildVoteTally };
