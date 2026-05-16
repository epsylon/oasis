const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('tasks: create + list + assign', (t) => {
  t('A creates task', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('tasks').createTask('Build', 'desc', '2030-01-01', '2030-01-05', 'HIGH', 'home', ['code'], 'public');
    ok(r);
    const list = await A.use('tasks').listAll();
    ok(list.length >= 1);
    eq(list[0].title, 'Build');
  });

  t('A toggles self-assign', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('tasks').createTask('T', '', '2030-01-01', '2030-01-02', 'LOW', '', [], 'public');
    await A.use('tasks').toggleAssignee(r.key);
    const t = await A.use('tasks').getTaskById(r.key);
    ok(t.assignees.includes(A.keypair.id));
  });

  t('A updates task status', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('tasks').createTask('T', '', '2030-01-01', '2030-01-02', 'LOW', '', [], 'public');
    await A.use('tasks').updateTaskStatus(r.key, 'IN-PROGRESS');
    const list = await A.use('tasks').listAll();
    const t = list.find(x => x.title === 'T');
    ok(t);
    eq(t.status, 'IN-PROGRESS');
  });
});
