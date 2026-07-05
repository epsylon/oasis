const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('activity: feed', (t) => {
  t('A creates a public tribe → A sees it in activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('tribes').createTribe('Pub', '', null, '', [], false, 'strict', null, 'OPEN', '');
    const feed = await A.use('activity').listFeed('all');
    ok(Array.isArray(feed));
    const tribe = feed.find(a => a.type === 'tribe');
    ok(tribe);
  });

  t('A creates a private tribe → A (member) sees its create in activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('tribes').createTribe('Hidden', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const feed = await A.use('activity').listFeed('all');
    const tribe = feed.find(a => a.type === 'tribe');
    ok(tribe, 'A as member sees own private tribe creation');
  });

  t('B (non-member) does NOT see private tribe creation in activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('tribes').createTribe('Secret', '', null, '', [], true, 'strict', null, 'OPEN', '');
    B.setActor();
    const feed = await B.use('activity').listFeed('all');
    const tribe = feed.find(a => a.type === 'tribe');
    ok(!tribe, 'B sees no private tribe activity');
  });
});

describe('activity: private task comment does not leak', (t) => {
  const start = () => new Date(Date.now() + 3600e3).toISOString();
  const end = () => new Date(Date.now() + 7200e3).toISOString();

  const commentOnTask = async (peer, taskKey) => {
    const ssb = await peer.cooler.open();
    return new Promise((res, rej) =>
      ssb.publish({ type: 'post', root: taskKey, text: 'a comment about the task' }, (e, r) => e ? rej(e) : res(r)));
  };

  t('author sees the comment on their own private task', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const task = await A.use('tasks').createTask('Secret task', 'd', start(), end(), 'HIGH', '', [], 'PRIVATE');
    await commentOnTask(A, task.key);
    const feed = await A.use('activity').listFeed('all');
    const comment = feed.find(a => a.type === 'post' && a.content && a.content.root === task.key);
    ok(comment, 'author sees the comment referencing their private task');
  });

  t('non-author does NOT see a comment referencing a private task', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const task = await A.use('tasks').createTask('Secret task', 'd', start(), end(), 'HIGH', '', [], 'PRIVATE');
    await commentOnTask(A, task.key);
    B.setActor();
    const feed = await B.use('activity').listFeed('all');
    const leaked = feed.find(a => a.type === 'post' && a.content && a.content.root === task.key);
    ok(!leaked, 'B must not see a comment that references a private task');
  });

  t('comment referencing a PUBLIC task is visible to others', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const task = await A.use('tasks').createTask('Open task', 'd', start(), end(), 'LOW', '', [], 'PUBLIC');
    await commentOnTask(A, task.key);
    B.setActor();
    const feed = await B.use('activity').listFeed('all');
    const comment = feed.find(a => a.type === 'post' && a.content && a.content.root === task.key);
    ok(comment, 'B sees comments on public tasks');
  });
});

describe('activity: vote tally matches the votes module', (t) => {
  const OPTS = ['YES', 'NO', 'ABSTENTION', 'CONFUSED', 'FOLLOW_MAJORITY', 'NOT_INTERESTED'];
  const deadline = () => new Date(Date.now() + 8 * 864e5).toISOString();

  t('activity aggregates votesVote and ignores non-owner content forgery', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net); const D = makePeer(net);

    A.setActor();
    const v = await A.use('votes').createVote('Best pasta?', deadline());
    B.setActor(); await B.use('votes').voteOnVote(v.key, 'YES');
    C.setActor(); await C.use('votes').voteOnVote(v.key, 'NO');

    D.setActor();
    const ssbD = await D.cooler.open();
    await new Promise((res, rej) => ssbD.publish({
      type: 'votes', replaces: v.key, question: 'Best pasta?', options: OPTS,
      deadline: deadline(), createdBy: A.keypair.id, status: 'OPEN',
      votes: { YES: 99, NO: 0, ABSTENTION: 0, CONFUSED: 0, FOLLOW_MAJORITY: 0, NOT_INTERESTED: 0 },
      totalVotes: 99, voters: Array.from({ length: 99 }, (_, i) => '@ballotstuff' + i + '.ed25519'),
      createdAt: new Date().toISOString()
    }, (e) => e ? rej(e) : res()));

    A.setActor();
    const authoritative = await A.use('votes').getVoteById(v.key);
    const feed = await A.use('activity').listFeed('votes');
    const card = feed.find(a => a.type === 'votes' && a.content && a.content.question === 'Best pasta?');
    ok(card, 'the vote shows up as an activity card');
    eq(Number(card.content.totalVotes), Number(authoritative.totalVotes), 'activity total equals the votes module total');
    eq(Number(card.content.totalVotes), 2, 'only the two real votesVote ballots are counted');
    eq(Number(card.content.votes.YES), 1, 'YES tallied from the votesVote, not the forged 99');
    eq(Number(card.content.votes.NO), 1, 'NO tallied from the real ballot');
  });

  t('a vote with no ballots still shows up in activity (no card dropped)', async () => {
    const net = makeNetwork(); const A = makePeer(net);
    A.setActor();
    const v = await A.use('votes').createVote('Lonely poll?', deadline());
    const inAll = (await A.use('activity').listFeed('all')).find(a => a.type === 'votes' && a.content.question === 'Lonely poll?');
    const inVotes = (await A.use('activity').listFeed('votes')).find(a => a.type === 'votes' && a.content.question === 'Lonely poll?');
    ok(inAll, 'vote appears under the all feed');
    ok(inVotes, 'vote appears under the votes feed');
    eq(Number(inVotes.content.totalVotes), 0, 'zero ballots reported as zero');
    ok(v);
  });
});

describe('activity: own content survives log window', (t) => {
  t('own old feed appears in filter=feed despite heavy later traffic from others', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('feed').createFeed('my ancient feed text');
    const ssbB = await B.cooler.open();
    for (let i = 0; i < 1100; i++) {
      await new Promise((res, rej) => ssbB.publish({ type: 'post', text: 'noise ' + i }, e => e ? rej(e) : res()));
    }
    A.setActor();
    A.use('activity').invalidateCache();
    const feed = await A.use('activity').listFeed('feed');
    const mine = feed.find(a => a.type === 'feed' && a.author === A.keypair.id);
    ok(mine, 'own old feed still appears in activity');
  });
});

describe('activity: foreign tombstone cannot hide content', (t) => {
  t('a tombstone by another author does not remove the victim feed from activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('feed').createFeed('my persistent feed');
    const ssbB = await B.cooler.open();
    await new Promise((res, rej) => ssbB.publish({ type: 'tombstone', target: r.key, deletedAt: new Date().toISOString() }, e => e ? rej(e) : res()));
    A.use('activity').invalidateCache();
    const feed = await A.use('activity').listFeed('feed');
    const mine = feed.find(a => a.type === 'feed' && a.author === A.keypair.id);
    ok(mine, 'foreign tombstone ignored, own feed still visible');
  });

  t('a self tombstone still removes own content from activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('feed').createFeed('to be deleted');
    const ssbA = await A.cooler.open();
    await new Promise((res, rej) => ssbA.publish({ type: 'tombstone', target: r.key, deletedAt: new Date().toISOString() }, e => e ? rej(e) : res()));
    A.use('activity').invalidateCache();
    const feed = await A.use('activity').listFeed('feed');
    const mine = feed.find(a => a.type === 'feed' && a.content && a.content.text === 'to be deleted');
    ok(!mine, 'self tombstone still hides the content');
  });
});
