const { eq, ok, throwsAsync } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('votes: create + cast + list', (t) => {
  t('A proposes a vote', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('votes').createVote('Should we?', '2026-12-31', ['YES', 'NO'], ['gov']);
    ok(r);
    const list = await A.use('votes').listAll('all');
    ok(list.length >= 1);
    const vote = list.find(v => v.question === 'Should we?');
    ok(vote);
  });

  t('A casts vote on own proposal', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('votes').createVote('Q?', '2026-12-31', ['YES', 'NO']);
    await A.use('votes').voteOnVote(r.key, 'YES');
    const v = await A.use('votes').getVoteById(r.key);
    ok(v.totalVotes >= 1);
  });

  t('A casts opinion on vote', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('votes').createVote('Q?', '2026-12-31', ['YES', 'NO']);
    await A.use('votes').createOpinion(r.key, 'interesting');
  });

  t('B can vote on A proposal', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('votes').createVote('Q?', '2026-12-31', ['YES', 'NO']);
    B.setActor();
    await B.use('votes').voteOnVote(r.key, 'NO');
    const v = await B.use('votes').getVoteById(r.key);
    ok(v.totalVotes >= 1);
  });
});
