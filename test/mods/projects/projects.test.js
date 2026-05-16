const { eq, ok } = require('../../helpers/assert');
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
