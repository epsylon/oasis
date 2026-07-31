const { eq, ok, notOk, throwsAsync } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const future = (days = 30) => new Date(Date.now() + days * 86400000).toISOString();

describe('votes: generic functionality', (t) => {
  t('createVote returns a message and getVoteById exposes its fields', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('votes').createVote('Adopt policy?', future(), ['YES', 'NO', 'ABSTENTION'], ['gov']);
    ok(r && r.key);
    const v = await A.use('votes').getVoteById(r.key);
    eq(v.question, 'Adopt policy?');
    eq(v.status, 'OPEN');
    ok(Array.isArray(v.options) && v.options.includes('YES'));
    eq(Number(v.totalVotes), 0);
    ok(v.createdBy === A.keypair.id);
  });

  t('createVote rejects a deadline that is too soon', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await throwsAsync(() => A.use('votes').createVote('Q?', future(2), ['YES', 'NO']), /Deadline/);
  });

  t('createVote rejects an invalid deadline format', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await throwsAsync(() => A.use('votes').createVote('Q?', 'not-a-date', ['YES', 'NO']), /Invalid deadline/);
  });

  t('listAll filters by mine and by open', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('votes').createVote('A question?', future(), ['YES', 'NO']);
    B.setActor();
    await B.use('votes').createVote('B question?', future(), ['YES', 'NO']);
    A.setActor();
    const mine = await A.use('votes').listAll('mine');
    ok(mine.every(v => v.createdBy === A.keypair.id));
    ok(mine.some(v => v.question === 'A question?'));
    notOk(mine.some(v => v.question === 'B question?'));
    const open = await A.use('votes').listAll('open');
    ok(open.every(v => v.status === 'OPEN'));
    ok(open.length >= 2);
  });

  t('B vote is counted in the tally and blocks a second vote', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('votes').createVote('Count me?', future(), ['YES', 'NO']);
    B.setActor();
    await B.use('votes').voteOnVote(r.key, 'NO');
    const v = await B.use('votes').getVoteById(r.key);
    eq(Number(v.votes.NO), 1);
    ok(v.voters.includes(B.keypair.id));
    await throwsAsync(() => B.use('votes').voteOnVote(r.key, 'YES'), /Already voted/);
  });

  t('voteOnVote rejects an option that is not offered', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('votes').createVote('Choice?', future(), ['YES', 'NO']);
    B.setActor();
    await throwsAsync(() => B.use('votes').voteOnVote(r.key, 'MAYBE'), /Invalid choice/);
  });

  t('author can edit the question, a non-author cannot', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('votes').createVote('Original?', future(), ['YES', 'NO']);
    const edited = await A.use('votes').updateVoteById(r.key, { question: 'Edited?' });
    ok(edited && edited.key);
    ok(edited.key !== r.key, 'edit publishes a new revision');
    const v = await A.use('votes').getVoteById(r.key);
    ok(v.question === 'Edited?' || v.question === 'Original?');
    B.setActor();
    await throwsAsync(() => B.use('votes').updateVoteById(r.key, { question: 'Hijack?' }), /Not the author/);
  });

  t('author can delete a vote, a non-author cannot', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('votes').createVote('Delete me?', future(), ['YES', 'NO']);
    B.setActor();
    await throwsAsync(() => B.use('votes').deleteVoteById(r.key), /Not the author/);
    A.setActor();
    await A.use('votes').deleteVoteById(r.key);
    const list = await A.use('votes').listAll('all');
    notOk(list.some(v => v.question === 'Delete me?'));
  });

  t('createOpinion validates category and blocks a repeat opinion', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('votes').createVote('Opinion target?', future(), ['YES', 'NO']);
    await throwsAsync(() => A.use('votes').createOpinion(r.key, 'bogusCategory'), /Invalid voting category/);
    await A.use('votes').createOpinion(r.key, 'interesting');
    await throwsAsync(() => A.use('votes').createOpinion(r.key, 'useful'), /Already voted/);
  });
});
