const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const signBy = async (peer, id, text) => { peer.setActor(); await peer.use('campaigns').sign(id, text); };

describe('campaigns: goals, signatures and status', (t) => {
  t('A starts a campaign; signatures count once per inhabitant and reaching the goal marks it ACHIEVED', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('campaigns').createCampaign({ title: 'Save the park', text: 'No parking lot here', category: 'environment', goal: 2, tags: 'park' });
    ok(r && r.key);
    let cp = await A.use('campaigns').getCampaignById(r.key);
    eq(cp.status, 'OPEN'); eq(cp.goal, 2); eq(cp.progress, 0); eq(cp.category, 'ENVIRONMENT'); eq(cp.canSign, true);
    await signBy(B, r.key, 'Trees matter');
    let twice = false;
    try { await B.use('campaigns').sign(r.key); } catch (_) { twice = true; }
    ok(twice, 'one signature per inhabitant');
    A.setActor();
    cp = await A.use('campaigns').getCampaignById(r.key);
    eq(cp.signatureCount, 1); eq(cp.progress, 50); eq(cp.signatures[0].text, 'Trees matter'); eq(cp.status, 'OPEN');
    await signBy(C, r.key);
    A.setActor();
    cp = await A.use('campaigns').getCampaignById(r.key);
    eq(cp.signatureCount, 2); eq(cp.progress, 100); eq(cp.status, 'ACHIEVED'); eq(cp.achieved, true); eq(cp.canElevate, true);
    eq((await A.use('campaigns').listAll({ filter: 'achieved' })).length, 1);
    eq((await A.use('campaigns').listAll({ filter: 'top' }))[0].id, r.key);
    B.setActor();
    eq((await B.use('campaigns').listAll({ filter: 'signed' })).length, 1);
  });

  t('the promoter posts updates, closes the campaign, records the proposal; others cannot', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('campaigns').createCampaign({ title: 'Bike lanes', text: '', category: 'INFRASTRUCTURE', goal: 100 });
    await A.use('campaigns').addUpdate(r.key, 'We met the council');
    await A.use('campaigns').addUpdate(r.key, '50 signatures!');
    B.setActor();
    let denied = 0;
    try { await B.use('campaigns').addUpdate(r.key, 'nope'); } catch (_) { denied++; }
    try { await B.use('campaigns').closeCampaign(r.key); } catch (_) { denied++; }
    try { await B.use('campaigns').updateCampaign(r.key, { title: 'hijack' }); } catch (_) { denied++; }
    eq(denied, 3);
    A.setActor();
    let cp = await A.use('campaigns').getCampaignById(r.key);
    eq(cp.updates.length, 2); eq(cp.updates[1].text, '50 signatures!');
    await A.use('campaigns').closeCampaign(r.key);
    cp = await A.use('campaigns').getCampaignById(r.key);
    eq(cp.status, 'CLOSED'); eq(cp.id, r.key);
    B.setActor();
    let closed = false;
    try { await B.use('campaigns').sign(r.key); } catch (_) { closed = true; }
    ok(closed, 'closed campaigns take no signatures');
    A.setActor();
    await A.use('campaigns').reopenCampaign(r.key);
    eq((await A.use('campaigns').getCampaignById(r.key)).status, 'OPEN');
    await A.use('campaigns').recordProposal(r.key, '%proposal.sha256');
    eq((await A.use('campaigns').getCampaignById(r.key)).proposalId, '%proposal.sha256');
  });

  t('the promoter edits and deletes an update; the campaign keeps the latest version and others cannot touch it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('campaigns').createCampaign({ title: 'Clean river', text: '', category: 'ENVIRONMENT', goal: 10 });
    const u = await A.use('campaigns').addUpdate(r.key, 'First step');
    const e = await A.use('campaigns').editUpdate(u.key, 'First step done');
    eq(e.rootId, u.key);
    let cp = await A.use('campaigns').getCampaignById(r.key);
    eq(cp.updates.length, 1); eq(cp.updates[0].id, u.key); eq(cp.updates[0].text, 'First step done'); eq(cp.updates[0].edited, true);
    B.setActor();
    let denied = 0;
    try { await B.use('campaigns').editUpdate(u.key, 'hijack'); } catch (_) { denied++; }
    try { await B.use('campaigns').deleteUpdate(u.key); } catch (_) { denied++; }
    eq(denied, 2);
    A.setActor();
    await A.use('campaigns').deleteUpdate(e.key);
    cp = await A.use('campaigns').getCampaignById(r.key);
    eq(cp.updates.length, 0);
  });

  t('a past deadline closes the campaign unless the goal was met; deletion hides it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const old = await A.use('campaigns').createCampaign({ title: 'Old', text: '', category: 'OTHER', goal: 1, deadline: new Date(Date.now() - 86400000).toISOString() });
    eq((await A.use('campaigns').getCampaignById(old.key)).status, 'CLOSED');
    const met = await A.use('campaigns').createCampaign({ title: 'Met', text: '', category: 'OTHER', goal: 1 });
    await signBy(B, met.key);
    A.setActor();
    await A.use('campaigns').updateCampaign(met.key, { deadline: new Date(Date.now() - 86400000).toISOString() });
    eq((await A.use('campaigns').getCampaignById(met.key)).status, 'ACHIEVED');
    await A.use('campaigns').deleteCampaign(old.key);
    notOk(await A.use('campaigns').getCampaignById(old.key));
    eq((await A.use('campaigns').listAll({ filter: 'all' })).length, 1);
  });

  t('inhabitants give one opinion per campaign', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('campaigns').createCampaign({ title: 'Trees', text: '', category: 'ENVIRONMENT', goal: 3 });
    B.setActor();
    await B.use('campaigns').createOpinion(r.key, 'interesting');
    let twice = false;
    try { await B.use('campaigns').createOpinion(r.key, 'inspiring'); } catch (_) { twice = true; }
    ok(twice, 'one opinion per inhabitant');
    A.setActor();
    const cp = await A.use('campaigns').getCampaignById(r.key);
    eq(cp.opinions.interesting, 1); eq(cp.opinionCount, 1); eq(cp.opinions_inhabitants[0], B.keypair.id);
  });
});
