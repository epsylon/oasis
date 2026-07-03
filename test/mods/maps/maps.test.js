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

  t('marker survives subsequent map edits (anchored to root, not tip)', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('maps').createMap(40.4, -3.7, 'Center', 'OPEN', ['city'], 'EditMap', null, 'X', null);
    await A.use('maps').updateMapById(r.key, 40.4, -3.7, 'Center v2', 'OPEN', ['city'], 'EditMap', null);
    let map = (await A.use('maps').listAll({ filter: 'all', viewerId: A.keypair.id })).find(m => m.title === 'EditMap');
    ok(map, 'map present after first edit');
    await A.use('maps').addMarker(map.key, 41.0, -4.0, 'Pin1', null);
    await A.use('maps').updateMapById(map.key, 40.4, -3.7, 'Center v3', 'OPEN', ['city'], 'EditMap', null);
    map = (await A.use('maps').listAll({ filter: 'all', viewerId: A.keypair.id })).find(m => m.title === 'EditMap');
    ok(map, 'map present after second edit');
    ok((map.markers || []).some(mk => mk.label === 'Pin1'), 'marker still visible after the tip changed again');
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

describe('maps: open (multi-use) invitation', (t) => {
  t('open invitation is multi-use and only one at a time', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('maps').createMap(1, 2, 'p', 'SINGLE', [], 'Open Map', null, '', null);
    const code = await A.use('maps').generateOpenInvite(r.key);
    ok(typeof code === 'string' && code.length > 0, 'open invite code generated');
    const rec = await A.use('maps').getOpenInvite(r.key);
    eq(rec && rec.code, code, 'getOpenInvite returns the code');
    let dup = false;
    try { await A.use('maps').generateOpenInvite(r.key); } catch (_) { dup = true; }
    ok(dup, 'a second open invitation is rejected');
    B.setActor();
    ok(await B.use('maps').joinByInvite(code), 'B joins via open invite');
    C.setActor();
    ok(await C.use('maps').joinByInvite(code), 'C also joins via the same open invite (multi-use)');
  });

  t('author can remove the open invitation', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('maps').createMap(3, 4, 'p', 'SINGLE', [], 'Removable', null, '', null);
    const code = await A.use('maps').generateOpenInvite(r.key);
    await A.use('maps').removeOpenInvite(r.key);
    eq(await A.use('maps').getOpenInvite(r.key), null, 'open invite removed');
    B.setActor();
    let threw = false;
    try { await B.use('maps').joinByInvite(code); } catch (_) { threw = true; }
    ok(threw, 'removed open invite no longer works');
  });
});
