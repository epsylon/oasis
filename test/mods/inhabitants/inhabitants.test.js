const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('inhabitants: list', (t) => {
  t('lists peers in the network', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); A.setActor();
    const list = await A.use('inhabitants').listInhabitants({ filter: 'all', includeInactive: true });
    ok(Array.isArray(list));
  });
});

describe('inhabitants: public content stats (no private leak)', (t) => {
  const start = () => new Date(Date.now() + 3600e3).toISOString();
  const end = () => new Date(Date.now() + 7200e3).toISOString();

  t('a viewer counts only the public tasks of another user', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('tasks').createTask('Public one', 'd', start(), end(), 'LOW', '', [], 'PUBLIC');
    await A.use('tasks').createTask('Secret one', 'd', start(), end(), 'LOW', '', [], 'PRIVATE');
    B.setActor();
    const stats = await B.use('inhabitants').getInhabitantStats(A.keypair.id, B.keypair.id);
    eq(stats.task || 0, 1);
  });

  t('the author counts their own public and private tasks', async () => {
    const net = makeNetwork(); const A = makePeer(net);
    A.setActor();
    await A.use('tasks').createTask('Public one', 'd', start(), end(), 'LOW', '', [], 'PUBLIC');
    await A.use('tasks').createTask('Secret one', 'd', start(), end(), 'LOW', '', [], 'PRIVATE');
    const stats = await A.use('inhabitants').getInhabitantStats(A.keypair.id, A.keypair.id);
    eq(stats.task || 0, 2);
  });
});
