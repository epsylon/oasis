const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('maps: create + marker + list', (t) => {
  t('A creates standalone map', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('maps').createMap(40.4, -3.7, 'Center', 'SINGLE', ['city'], 'My map', null, 'X', null);
    ok(r);
    const list = await A.use('maps').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(list.length >= 1);
    eq(list[0].title, 'My map');
  });

  t('A creates SINGLE map (no markers)', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('maps').createMap(0, 0, 'desc', 'SINGLE', [], 'Single', null, 'pin', null);
    ok(r);
    const list = await A.use('maps').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(list.find(m => m.title === 'Single'));
  });

  t('A deletes own map', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('maps').createMap(0, 0, 'd', 'SINGLE', [], 'X', null, '', null);
    await A.use('maps').deleteMapById(r.key);
    const list = await A.use('maps').listAll({ filter: 'all', viewerId: A.keypair.id });
    const found = list.find(m => m.title === 'X');
    ok(!found);
  });
});
