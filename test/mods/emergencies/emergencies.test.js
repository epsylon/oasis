const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const confirmBy = async (peer, id) => { peer.setActor(); await peer.use('emergencies').confirmEmergency(id); };

describe('emergencies: raise, confirm, update, resolve', (t) => {
  t('A raises an emergency; it lists as ACTIVE, UNVERIFIED and unexpired', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('emergencies').createEmergency({ title: 'Water cut', text: 'north district', category: 'infrastructure', tags: 'water, north', expiresIn: '3d' });
    ok(r && r.key);
    const list = await A.use('emergencies').listAll({ filter: 'all' });
    eq(list.length, 1);
    const al = list[0];
    eq(al.title, 'Water cut'); eq(al.category, 'INFRASTRUCTURE'); eq(al.status, 'ACTIVE'); eq(al.severity, 'UNVERIFIED');
    eq(al.tags.join(','), 'water,north');
    ok(Date.parse(al.expiresAt) > Date.now() + 2 * 86400000, 'expires in three days');
  });

  t('severity grows with confirmations from other inhabitants, never from the author or twice', async () => {
    const net = makeNetwork(); const A = makePeer(net);
    const others = [makePeer(net), makePeer(net), makePeer(net), makePeer(net), makePeer(net)];
    A.setActor();
    const r = await A.use('emergencies').createEmergency({ title: 'Storm', text: '', category: 'WEATHER' });
    let failed = false;
    try { await A.use('emergencies').confirmEmergency(r.key); } catch (_) { failed = true; }
    ok(failed, 'the author cannot confirm their own emergency');
    await confirmBy(others[0], r.key);
    let twice = false;
    try { await others[0].use('emergencies').confirmEmergency(r.key); } catch (_) { twice = true; }
    ok(twice, 'a second confirmation by the same inhabitant is refused');
    A.setActor();
    eq((await A.use('emergencies').getEmergencyById(r.key)).severity, 'UNVERIFIED', 'one confirmation is not enough');
    await confirmBy(others[1], r.key);
    A.setActor();
    eq((await A.use('emergencies').getEmergencyById(r.key)).severity, 'LOW', 'two confirmations → LOW');
    await confirmBy(others[2], r.key); await confirmBy(others[3], r.key); await confirmBy(others[4], r.key);
    A.setActor();
    const al = await A.use('emergencies').getEmergencyById(r.key);
    eq(al.confirmationCount, 5); eq(al.severity, 'MEDIUM', 'five confirmations → MEDIUM');
    const medium = await A.use('emergencies').listAll({ filter: 'MEDIUM' });
    eq(medium.length, 1, 'the severity filter lists it');
  });

  t('the author posts updates and resolves; others cannot', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('emergencies').createEmergency({ title: 'Road closed', text: '', category: 'SECURITY' });
    await A.use('emergencies').addUpdate(r.key, 'Police on site');
    B.setActor();
    let blocked = false;
    try { await B.use('emergencies').addUpdate(r.key, 'nope'); } catch (_) { blocked = true; }
    ok(blocked, 'only the author posts updates');
    let resolvedByB = false;
    try { await B.use('emergencies').resolveEmergency(r.key); } catch (_) { resolvedByB = true; }
    ok(resolvedByB, 'only the author resolves');
    A.setActor();
    await A.use('emergencies').resolveEmergency(r.key);
    const al = await A.use('emergencies').getEmergencyById(r.key);
    eq(al.status, 'RESOLVED'); eq(al.updates.length, 1); eq(al.updates[0].text, 'Police on site');
    eq((await A.use('emergencies').listAll({ filter: 'RESOLVED' })).length, 1);
    eq((await A.use('emergencies').listAll({ filter: 'ACTIVE' })).length, 0);
  });

  t('the featured emergency is the most severe active one with enough confirmations', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const crowd = Array.from({ length: 9 }, () => makePeer(net));
    A.setActor();
    const quiet = await A.use('emergencies').createEmergency({ title: 'Quiet', text: '', category: 'NEIGHBORHOOD' });
    B.setActor();
    const loud = await B.use('emergencies').createEmergency({ title: 'Loud', text: '', category: 'HEALTH' });
    await confirmBy(A, loud.key);
    for (const p of crowd) await confirmBy(p, loud.key);
    A.setActor();
    const featured = await A.use('emergencies').featured();
    ok(featured && featured.id === loud.key, 'the confirmed emergency is featured');
    eq(featured.severity, 'HIGH');
    eq(featured.confirmationCount, 10);
    await B.setActor(); await B.use('emergencies').resolveEmergency(loud.key);
    A.setActor();
    notOk(await A.use('emergencies').featured(), 'nothing featured once it is resolved and the other has no confirmations');
    ok(quiet.key);
  });

  t('deletion hides the emergency', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('emergencies').createEmergency({ title: 'Tmp', text: '', category: 'LOST' });
    await A.use('emergencies').deleteEmergency(r.key);
    notOk(await A.use('emergencies').getEmergencyById(r.key));
    eq((await A.use('emergencies').listAll({ filter: 'all' })).length, 0);
  });
});

describe('emergencies: updates can be edited, confirmed and deleted', (t) => {
  t('the author edits an update until someone confirms it; confirmations count once per inhabitant; deletion hides it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('emergencies').createEmergency({ title: 'Flood', text: '', category: 'WEATHER' });
    const u = await A.use('emergencies').addUpdate(r.key, 'River rising');
    await A.use('emergencies').editUpdate(u.key, 'River rising fast');
    let em = await A.use('emergencies').getEmergencyById(r.key);
    eq(em.updates.length, 1, 'an edit does not duplicate the update');
    eq(em.updates[0].text, 'River rising fast'); eq(em.updates[0].id, u.key); eq(em.updates[0].edited, true);
    B.setActor();
    await B.use('emergencies').confirmUpdate(u.key);
    let twice = false;
    try { await B.use('emergencies').confirmUpdate(u.key); } catch (_) { twice = true; }
    ok(twice, 'one confirmation per inhabitant');
    A.setActor();
    em = await A.use('emergencies').getEmergencyById(r.key);
    eq(em.updates[0].confirmationCount, 1);
    eq(em.confirmationCount, 1, 'confirming an update counts for the emergency as well');
    let locked = false;
    try { await A.use('emergencies').editUpdate(u.key, 'nope'); } catch (_) { locked = true; }
    ok(locked, 'a confirmed update cannot be edited');
    B.setActor();
    let notOwner = false;
    try { await B.use('emergencies').deleteUpdate(u.key); } catch (_) { notOwner = true; }
    ok(notOwner);
    A.setActor();
    await A.use('emergencies').deleteUpdate(u.key);
    eq((await A.use('emergencies').getEmergencyById(r.key)).updates.length, 0);
  });
});
