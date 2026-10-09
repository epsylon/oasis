const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const publish = (peer, content) => new Promise((res, rej) => peer.node.publish(content, (e, m) => e ? rej(e) : res(m)));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const future = (days = 30) => new Date(Date.now() + days * 86400000).toISOString();

const rawVote = (peer, over = {}) => publish(peer, {
  type: 'votes', question: 'Q?', options: ['YES', 'NO'], deadline: future(), createdBy: peer.keypair.id,
  status: 'OPEN', votes: { YES: 0, NO: 0 }, totalVotes: 0, voters: [], tags: [], createdAt: new Date().toISOString(), ...over
});
const ballot = (peer, target, choice) => publish(peer, { type: 'votesVote', target, choice, createdAt: new Date().toISOString() });

describe('votes: only signed ballots are counted', (t) => {
  t('the counters written by whoever opened the vote are ignored', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const v = await rawVote(A, { votes: { YES: 50, NO: 0 }, totalVotes: 50, voters: ['@x.ed25519', '@y.ed25519'] });
    A.setActor();
    let got = await A.use('votes').getVoteById(v.key);
    eq(Number(got.totalVotes), 0, 'nobody has signed a ballot yet');
    eq(Number(got.votes.YES), 0, 'so the declared YES count is ignored');
    eq(got.voters.length, 0, 'and so are the declared voters');
    await ballot(B, v.key, 'NO');
    got = await A.use('votes').getVoteById(v.key);
    eq(Number(got.votes.NO), 1, 'a signed ballot is counted');
    eq(Number(got.totalVotes), 1);
  });

  t('rewriting the vote does not rewrite its result', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    const v = await rawVote(A);
    await ballot(B, v.key, 'YES');
    await rawVote(A, { replaces: v.key, votes: { YES: 0, NO: 99 }, totalVotes: 99, voters: [C.keypair.id] });
    await rawVote(C, { replaces: v.key, votes: { YES: 0, NO: 77 }, totalVotes: 77, voters: [C.keypair.id] });
    A.setActor();
    const got = await A.use('votes').getVoteById(v.key);
    eq(Number(got.votes.YES), 1, 'the ballot of B stands');
    eq(Number(got.votes.NO), 0, 'no rewrite adds votes');
    eq(Number(got.totalVotes), 1);
    notOk(got.voters.includes(C.keypair.id), 'nobody becomes a voter by being written into the vote');
  });

  t('each inhabitant counts once, with the last ballot cast in time', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const v = await rawVote(A);
    await ballot(B, v.key, 'YES');
    await ballot(B, v.key, 'NO');
    A.setActor();
    const got = await A.use('votes').getVoteById(v.key);
    eq(Number(got.totalVotes), 1, 'one inhabitant, one vote');
    eq(Number(got.votes.NO), 1, 'the last ballot is the one that counts');
    eq(Number(got.votes.YES), 0);
  });

  t('ballots cast after the deadline are ignored', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    const v = await rawVote(A, { deadline: new Date(Date.now() + 300).toISOString() });
    await ballot(B, v.key, 'YES');
    await wait(400);
    await ballot(C, v.key, 'NO');
    await ballot(B, v.key, 'NO');
    A.setActor();
    const got = await A.use('votes').getVoteById(v.key);
    eq(Number(got.totalVotes), 1, 'only the ballot cast before the deadline');
    eq(Number(got.votes.YES), 1, 'and a late change of mind does not count either');
    notOk(got.voters.includes(C.keypair.id));
  });

  t('the one who opened the vote cannot vote on it', async () => {
    const net = makeNetwork(); const A = makePeer(net);
    const v = await rawVote(A);
    await ballot(A, v.key, 'YES');
    A.setActor();
    const got = await A.use('votes').getVoteById(v.key);
    eq(Number(got.totalVotes), 0);
    ok(!got.voters.includes(A.keypair.id));
  });
});
