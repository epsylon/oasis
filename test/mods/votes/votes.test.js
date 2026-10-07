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

  t('A cannot vote on own proposal', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('votes').createVote('Q?', '2026-12-31', ['YES', 'NO']);
    let rejected = false;
    try { await A.use('votes').voteOnVote(r.key, 'YES'); } catch (e) { rejected = true; }
    ok(rejected, 'creator self-vote is rejected');
    const v = await A.use('votes').getVoteById(r.key);
    ok(Number(v.totalVotes) === 0, 'no votes counted');
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

describe('votes: results cannot be tampered with', (t) => {
  t('the author can withdraw a vote nobody has used yet', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('votes').createVote('Empty?', '2030-12-31', ['YES', 'NO']);
    await A.use('votes').deleteVoteById(r.key);
    ok(!(await A.use('votes').listAll('all')).some(v => v.id === r.key), 'gone');
  });

  t('once someone has voted, the author can neither edit nor delete it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('votes').createVote('Locked?', '2030-12-31', ['YES', 'NO']);
    B.setActor();
    await B.use('votes').voteOnVote(r.key, 'YES');
    A.setActor();
    await throwsAsync(() => A.use('votes').deleteVoteById(r.key), 'Vote locked');
    await throwsAsync(() => A.use('votes').updateVoteById(r.key, { question: 'Changed?', options: ['NO', 'YES'] }), 'Vote locked');
    eq((await A.use('votes').getVoteById(r.key)).question, 'Locked?', 'the question is unchanged');
  });

  t('a Parliament or Courts vote can never be removed by whoever opened it', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('votes').createVote('Law?', '2030-12-31', ['YES', 'NO', 'ABSTENTION'], ['gov:term1', 'govMethod:DEMOCRACY', 'proposal']);
    await throwsAsync(() => A.use('votes').deleteVoteById(r.key), 'Vote locked');
  });
});

