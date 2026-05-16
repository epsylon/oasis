const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('pads: standalone create + list', (t) => {
  t('A creates pad', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('pads').createPad('Notes', 'OPEN', '2026-12-31', ['notes'], null);
    ok(r);
    const list = await A.use('pads').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(list.length >= 1);
    const m = list.find(p => p.title === 'Notes');
    ok(m);
  });

  t('A closes pad', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('pads').createPad('P', 'OPEN', '2026-12-31', [], null);
    await A.use('pads').closePadById(r.key);
    const p = await A.use('pads').getPadById(r.key);
    eq(p.status, 'CLOSED');
  });

  t('A deletes pad', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('pads').createPad('Tmp', 'OPEN', '2026-12-31', [], null);
    await A.use('pads').deletePadById(r.key);
    const list = await A.use('pads').listAll({ filter: 'all', viewerId: A.keypair.id });
    const found = list.find(p => p.title === 'Tmp');
    ok(!found);
  });
});
