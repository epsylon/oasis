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
