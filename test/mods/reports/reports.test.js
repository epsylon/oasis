const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('reports: create + list + confirm', (t) => {
  t('A creates a report', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('reports').createReport('Bug', 'description', 'tech', null, ['bug'], 'medium', {});
    ok(r);
    const list = await A.use('reports').listAll();
    ok(list.length >= 1);
    eq(list[0].title, 'Bug');
  });

  t('B confirms A report', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('reports').createReport('X', 'd', 'tech', null, [], 'low', {});
    B.setActor();
    await B.use('reports').confirmReportById(r.key);
    const list = await B.use('reports').listAll();
    const target = list.find(x => x.title === 'X');
    ok(target);
    ok(target.confirmations.includes(B.keypair.id));
  });

  t('A deletes own report', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('reports').createReport('Y', 'd', 'tech', null, [], 'low', {});
    await A.use('reports').deleteReportById(r.key);
    const list = await A.use('reports').listAll();
    const found = list.find(x => x.title === 'Y');
    ok(!found);
  });
});
