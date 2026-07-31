const { eq, ok, notOk, throwsAsync } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('projects: create + list + follow + pledge', (t) => {
  t('A creates project', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('projects').createProject({
      title: 'Mission', description: 'd', goal: '1000', deadline: '2026-12-31',
      tags: ['nonprofit'], status: 'ACTIVE'
    });
    ok(r);
  });

  t('B follows A project', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('projects').createProject({
      title: 'P', description: '', goal: '100', deadline: '2026-12-31', tags: [], status: 'ACTIVE'
    });
    B.setActor();
    await B.use('projects').followProject(r.key, B.keypair.id);
  });

  t('B pledges to A project', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('projects').createProject({
      title: 'P', description: '', goal: '100', deadline: '2026-12-31', tags: [], status: 'ACTIVE'
    });
    B.setActor();
    await B.use('projects').pledgeToProject(r.key, B.keypair.id, 10);
  });
});

describe('projects: get + edit + status + delete', (t) => {
  t('getProjectById returns the created project', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('projects').createProject({
      title: 'Detail', description: 'body', goal: '500', deadline: '2027-01-01', tags: [], status: 'ACTIVE'
    });
    const p = await A.use('projects').getProjectById(r.key);
    eq(p.title, 'Detail');
    eq(p.description, 'body');
    eq(p.goal, 500);
    eq(p.status, 'ACTIVE');
    eq(p.author, A.keypair.id);
  });

  t('author edits title and description', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('projects').createProject({
      title: 'Old', description: 'x', goal: '100', deadline: '2027-01-01', tags: [], status: 'ACTIVE'
    });
    await A.use('projects').updateProject(r.key, { title: 'New', description: 'y' });
    const p = await A.use('projects').getProjectById(r.key);
    eq(p.title, 'New');
    eq(p.description, 'y');
  });

  t('status transition to PAUSED and filter', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('projects').createProject({
      title: 'Pausable', description: '', goal: '100', deadline: '2027-01-01', tags: [], status: 'ACTIVE'
    });
    await A.use('projects').updateProjectStatus(r.key, 'PAUSED');
    const p = await A.use('projects').getProjectById(r.key);
    eq(p.status, 'PAUSED');
    const paused = await A.use('projects').listProjects('PAUSED');
    ok(paused.find(x => x.title === 'Pausable'));
    const active = await A.use('projects').listProjects('ACTIVE');
    notOk(active.find(x => x.title === 'Pausable'));
  });

  t('progress 100 marks project COMPLETED', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('projects').createProject({
      title: 'Finisher', description: '', goal: '100', deadline: '2027-01-01', tags: [], status: 'ACTIVE'
    });
    await A.use('projects').updateProjectProgress(r.key, 100);
    const p = await A.use('projects').getProjectById(r.key);
    eq(p.progress, 100);
    eq(p.status, 'COMPLETED');
  });

  t('author deletes project (tombstoned, gone from list)', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('projects').createProject({
      title: 'Doomed', description: '', goal: '100', deadline: '2027-01-01', tags: [], status: 'ACTIVE'
    });
    await A.use('projects').deleteProject(r.key);
    const list = await A.use('projects').listProjects('ALL');
    notOk(list.find(x => x.title === 'Doomed'));
    await throwsAsync(() => A.use('projects').getProjectById(r.key), /not found/i);
  });
});

describe('projects: milestones + bounties + pledges', (t) => {
  t('add milestone then complete it raises progress', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('projects').createProject({
      title: 'MS', description: '', goal: '0', deadline: '2027-01-01', tags: [], status: 'ACTIVE'
    });
    await A.use('projects').addMilestone(r.key, { title: 'Phase 1', targetPercent: 40 });
    let p = await A.use('projects').getProjectById(r.key);
    eq(p.milestones.length, 1);
    await A.use('projects').completeMilestone(r.key, 0, A.keypair.id);
    p = await A.use('projects').getProjectById(r.key);
    ok(p.milestones[0].done);
    eq(p.progress, 40);
  });

  t('bounty claim by B then complete by A', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('projects').createProject({
      title: 'Bnty', description: '', goal: '0', deadline: '2027-01-01', tags: [], status: 'ACTIVE'
    });
    await A.use('projects').addBounty(r.key, { title: 'Fix it', amount: 50 });
    B.setActor();
    await B.use('projects').claimBounty(r.key, 0, B.keypair.id);
    let p = await B.use('projects').getProjectById(r.key);
    eq(p.bounties[0].claimedBy, B.keypair.id);
    A.setActor();
    await A.use('projects').completeBounty(r.key, 0, A.keypair.id);
    p = await A.use('projects').getProjectById(r.key);
    ok(p.bounties[0].done);
  });

  t('pledge accumulates and raises progress against goal', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('projects').createProject({
      title: 'Fund', description: '', goal: '100', deadline: '2027-01-01', tags: [], status: 'ACTIVE'
    });
    B.setActor();
    await B.use('projects').pledgeToProject(r.key, B.keypair.id, 25);
    const p = await B.use('projects').getProjectById(r.key);
    eq(p.pledged, 25);
    eq(p.progress, 25);
    ok(p.backers.some(x => x.userId === B.keypair.id));
  });

  t('author confirms a pledge', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('projects').createProject({
      title: 'Conf', description: '', goal: '100', deadline: '2027-01-01', tags: [], status: 'ACTIVE'
    });
    B.setActor();
    await B.use('projects').pledgeToProject(r.key, B.keypair.id, 30, { transferId: 'tx1' });
    A.setActor();
    await A.use('projects').confirmPledge(r.key, 'tx1');
    const p = await A.use('projects').getProjectById(r.key);
    const backer = p.backers.find(x => x.transferId === 'tx1');
    ok(backer);
    ok(backer.confirmed);
  });
});

describe('projects: permissions + validation', (t) => {
  t('non-author cannot update project', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('projects').createProject({
      title: 'Guarded', description: '', goal: '100', deadline: '2027-01-01', tags: [], status: 'ACTIVE'
    });
    B.setActor();
    await throwsAsync(() => B.use('projects').updateProject(r.key, { title: 'Hacked' }), /Unauthorized/);
  });

  t('non-positive pledge amount is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('projects').createProject({
      title: 'NoZero', description: '', goal: '100', deadline: '2027-01-01', tags: [], status: 'ACTIVE'
    });
    B.setActor();
    await throwsAsync(() => B.use('projects').pledgeToProject(r.key, B.keypair.id, 0), /Invalid amount/);
  });

  t('author cannot claim own bounty', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('projects').createProject({
      title: 'SelfClaim', description: '', goal: '0', deadline: '2027-01-01', tags: [], status: 'ACTIVE'
    });
    await A.use('projects').addBounty(r.key, { title: 'B', amount: 10 });
    await throwsAsync(() => A.use('projects').claimBounty(r.key, 0, A.keypair.id), /Authors cannot claim/);
  });
});
