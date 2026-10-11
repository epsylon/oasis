const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('jobs: create + list + subscribe', (t) => {
  t('A creates a job', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('jobs').createJob({
      title: 'Dev', description: 'd', location: 'remote',
      job_type: 'freelancer', job_time: 'partial', vacants: 1, salary: '$50k', requirements: 'JS',
      tags: ['code'], status: 'OPEN'
    });
    ok(r);
    const list = await A.use('jobs').listJobs('ALL', A.keypair.id, {});
    ok(list.length >= 1);
  });

  t('B subscribes to A job', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('jobs').createJob({
      title: 'X', description: 'd', location: 'remote', job_type: 'freelancer', job_time: 'partial',
      vacants: 1, salary: '', requirements: '', tags: [], status: 'OPEN'
    });
    B.setActor();
    await B.use('jobs').subscribeToJob(r.key, B.keypair.id);
    const j = await B.use('jobs').getJobById(r.key, B.keypair.id);
    ok(j);
  });

  t('A deletes own job', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('jobs').createJob({
      title: 'Z', description: 'd', location: 'remote', job_type: 'freelancer', job_time: 'partial',
      vacants: 1, salary: '', requirements: '', tags: [], status: 'OPEN'
    });
    await A.use('jobs').deleteJob(r.key);
    const list = await A.use('jobs').listJobs('ALL', A.keypair.id, {});
    const found = list.find(j => j.title === 'Z');
    ok(!found);
  });
});

describe('jobs: visibility (public / hidden)', (t) => {
  t('default visibility is PUBLIC', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('jobs').createJob({
      title: 'PublicJob', description: 'd', location: 'remote', job_type: 'freelancer', job_time: 'partial',
      vacants: 1, salary: '', requirements: '', tags: [], status: 'OPEN'
    });
    const list = await A.use('jobs').listJobs('ALL', A.keypair.id, {});
    const job = list.find(j => j.title === 'PublicJob');
    eq(job.visibility, 'PUBLIC');
  });

  t('HIDDEN job is visible to author', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('jobs').createJob({
      title: 'SecretJob', description: 'd', location: 'remote', job_type: 'freelancer', job_time: 'partial',
      vacants: 1, salary: '', requirements: '', tags: [], status: 'OPEN', visibility: 'HIDDEN'
    });
    const list = await A.use('jobs').listJobs('ALL', A.keypair.id, {});
    const job = list.find(j => j.title === 'SecretJob');
    ok(job);
    eq(job.visibility, 'HIDDEN');
  });

  t('HIDDEN job is filtered out for non-author', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('jobs').createJob({
      title: 'HiddenJob', description: 'd', location: 'remote', job_type: 'freelancer', job_time: 'partial',
      vacants: 1, salary: '', requirements: '', tags: [], status: 'OPEN', visibility: 'HIDDEN'
    });
    B.setActor();
    const list = await B.use('jobs').listJobs('ALL', B.keypair.id, {});
    eq(list.find(j => j.title === 'HiddenJob'), undefined);
  });

  t('HIDDEN job getJobById throws for non-author', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('jobs').createJob({
      title: 'NoPeek', description: 'd', location: 'remote', job_type: 'freelancer', job_time: 'partial',
      vacants: 1, salary: '', requirements: '', tags: [], status: 'OPEN', visibility: 'HIDDEN'
    });
    B.setActor();
    let threw = false;
    try { await B.use('jobs').getJobById(r.key, B.keypair.id); } catch (_) { threw = true; }
    ok(threw);
  });

  t('update can flip visibility PUBLIC -> HIDDEN', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('jobs').createJob({
      title: 'FlipJob', description: 'd', location: 'remote', job_type: 'freelancer', job_time: 'partial',
      vacants: 1, salary: '', requirements: '', tags: [], status: 'OPEN'
    });
    await A.use('jobs').updateJob(r.key, { visibility: 'HIDDEN' });
    B.setActor();
    const list = await B.use('jobs').listJobs('ALL', B.keypair.id, {});
    eq(list.find(j => j.title === 'FlipJob'), undefined);
  });
});

describe('jobs: versions republished by other inhabitants', (t) => {
  const pub = (P, content) => new Promise((res, rej) => P.node.publish(content, (e, m) => e ? rej(e) : res(m)));
  const raw = (net, key) => net.log.find(m => m.key === key).value.content;
  const offer = (A, title) => A.use('jobs').createJob({ title, description: 'd', location: 'remote', job_type: 'freelancer', job_time: 'partial', vacants: 1, salary: '', requirements: '', tags: [], status: 'OPEN' });

  t('a chain crossing other authors stays one job with the latest content of its author', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await offer(A, 'Baker');
    const b = await pub(B, { ...raw(net, r.key), replaces: r.key });
    const c = await pub(C, { ...raw(net, b.key), replaces: b.key });
    await pub(A, { ...raw(net, c.key), title: 'Baker II', replaces: c.key });
    const list = (await A.use('jobs').listJobs('ALL', A.keypair.id, {})).filter(j => j.title === 'Baker' || j.title === 'Baker II');
    eq(list.length, 1);
    eq(list[0].author, A.keypair.id);
    eq(list[0].title, 'Baker II');
    const byCopy = await A.use('jobs').getJobById(c.key, A.keypair.id);
    eq(byCopy.rootId, list[0].rootId);
    eq(byCopy.id, list[0].id);
  });

  t('subscribing through a foreign version lands on the job', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await offer(A, 'Painter');
    const b = await pub(B, { ...raw(net, r.key), replaces: r.key });
    B.setActor();
    await B.use('jobs').subscribeToJob(b.key, B.keypair.id);
    A.setActor();
    const list = (await A.use('jobs').listJobs('ALL', A.keypair.id, {})).filter(j => j.title === 'Painter');
    eq(list.length, 1);
    ok(list[0].subscribers.includes(B.keypair.id));
  });

  t('a foreign version never changes the job', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await offer(A, 'Cook');
    await pub(B, { ...raw(net, r.key), title: 'Cook by B', replaces: r.key });
    const list = (await A.use('jobs').listJobs('ALL', A.keypair.id, {})).filter(j => j.title === 'Cook' || j.title === 'Cook by B');
    eq(list.length, 1);
    eq(list[0].title, 'Cook');
    eq(list[0].author, A.keypair.id);
  });

  t('somebody else cannot delete the job', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await offer(A, 'Tailor');
    await pub(B, { type: 'tombstone', target: r.key, deletedAt: new Date().toISOString(), author: B.keypair.id });
    const job = await A.use('jobs').getJobById(r.key, A.keypair.id);
    eq(job.title, 'Tailor');
  });
});
