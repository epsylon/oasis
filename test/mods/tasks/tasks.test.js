const { eq, ok, notOk, throwsAsync } = require('../../helpers/assert');
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

describe('tasks: get + edit + delete', (t) => {
  t('getTaskById returns created fields', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('tasks').createTask('Detail', 'body', '2030-01-01', '2030-01-05', 'HIGH', 'home', ['x'], 'public');
    const t = await A.use('tasks').getTaskById(r.key);
    eq(t.title, 'Detail');
    eq(t.description, 'body');
    eq(t.priority, 'HIGH');
    eq(t.status, 'OPEN');
    eq(t.author, A.keypair.id);
  });

  t('author edits title', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('tasks').createTask('Old', '', '2030-01-01', '2030-01-05', 'LOW', '', [], 'public');
    await A.use('tasks').updateTaskById(r.key, { title: 'Renamed' });
    const t = await A.use('tasks').getTaskById(r.key);
    eq(t.title, 'Renamed');
  });

  t('default visibility normalizes to PUBLIC', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('tasks').createTask('Vis', '', '2030-01-01', '2030-01-05', 'LOW', '', [], 'nonsense');
    const t = await A.use('tasks').getTaskById(r.key);
    eq(t.isPublic, 'PUBLIC');
  });

  t('author deletes own task', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('tasks').createTask('Gone', '', '2030-01-01', '2030-01-05', 'LOW', '', [], 'public');
    await A.use('tasks').deleteTaskById(r.key);
    const list = await A.use('tasks').listAll();
    notOk(list.find(x => x.title === 'Gone'));
  });

  t('B self-assigns to A task', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('tasks').createTask('Shared', '', '2030-01-01', '2030-01-05', 'LOW', '', [], 'public');
    B.setActor();
    await B.use('tasks').toggleAssignee(r.key);
    const t = await B.use('tasks').getTaskById(r.key);
    ok(t.assignees.includes(B.keypair.id));
    ok(t.assignees.includes(A.keypair.id));
  });
});

describe('tasks: opinions + closed lifecycle', (t) => {
  t('B opines on A task', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('tasks').createTask('Op', '', '2030-01-01', '2030-01-05', 'LOW', '', [], 'public');
    B.setActor();
    await B.use('tasks').createOpinion(r.key, 'interesting');
    const t = await B.use('tasks').getTaskById(r.key);
    ok(t.opinions_inhabitants.includes(B.keypair.id));
    eq(t.opinions.interesting, 1);
  });

  t('cannot opine twice', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('tasks').createTask('Op2', '', '2030-01-01', '2030-01-05', 'LOW', '', [], 'public');
    B.setActor();
    await B.use('tasks').createOpinion(r.key, 'interesting');
    await throwsAsync(() => B.use('tasks').createOpinion(r.key, 'interesting'), /Already opined/);
  });

  t('closed task cannot be edited', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('tasks').createTask('Close', '', '2030-01-01', '2030-01-05', 'LOW', '', [], 'public');
    const closed = await A.use('tasks').updateTaskStatus(r.key, 'CLOSED');
    await throwsAsync(() => A.use('tasks').updateTaskById(closed.key, { title: 'nope' }), /closed/i);
  });
});

describe('tasks: permissions + validation', (t) => {
  t('non-author cannot edit task', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('tasks').createTask('Guarded', '', '2030-01-01', '2030-01-05', 'LOW', '', [], 'public');
    B.setActor();
    await throwsAsync(() => B.use('tasks').updateTaskById(r.key, { title: 'Hacked' }), /Not the author/);
  });

  t('non-author cannot delete task', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('tasks').createTask('Guarded2', '', '2030-01-01', '2030-01-05', 'LOW', '', [], 'public');
    B.setActor();
    await throwsAsync(() => B.use('tasks').deleteTaskById(r.key), /Not the author/);
  });

  t('invalid dates are rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await throwsAsync(() => A.use('tasks').createTask('Bad', '', 'not-a-date', 'also-bad', 'LOW', '', [], 'public'), /Invalid dates/);
  });

  t('end before start is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await throwsAsync(() => A.use('tasks').createTask('Bad2', '', '2030-01-05', '2030-01-01', 'LOW', '', [], 'public'), /Invalid time range/);
  });

  t('invalid status value is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('tasks').createTask('S', '', '2030-01-01', '2030-01-05', 'LOW', '', [], 'public');
    await throwsAsync(() => A.use('tasks').updateTaskStatus(r.key, 'BOGUS'), /Invalid status/);
  });
});
