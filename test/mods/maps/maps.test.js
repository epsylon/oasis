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

describe('maps: invite + join', (t) => {
  t('A creates a private map, generates an invite, B joins by code', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('maps').createMap(10, 20, 'secret place', 'SINGLE', [], 'Private Map', null, '', null);
    const code = await A.use('maps').generateInvite(r.key);
    ok(typeof code === 'string' && code.length > 0, 'invite code generated');
    B.setActor();
    const joined = await B.use('maps').joinByInvite(code);
    ok(joined, 'B joined the private map via invite');
  });

  t('non-author cannot generate an invite for a map', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('maps').createMap(0, 0, 'd', 'SINGLE', [], 'Mine', null, '', null);
    B.setActor();
    let threw = false;
    try { await B.use('maps').generateInvite(r.key); } catch (_) { threw = true; }
    ok(threw, 'only the author can generate map invites');
  });
});
