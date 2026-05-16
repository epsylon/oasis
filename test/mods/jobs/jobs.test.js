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
