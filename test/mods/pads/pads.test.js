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

describe('pads: open (multi-use) invitation', (t) => {
  t('open invitation is multi-use and only one at a time', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('pads').createPad('Shared', 'INVITE-ONLY', '2026-12-31', [], null);
    const code = await A.use('pads').generateOpenInvite(r.key);
    ok(typeof code === 'string' && code.length > 0, 'open invite code generated');
    eq((await A.use('pads').getOpenInvite(r.key)).code, code, 'getOpenInvite returns the code');
    let dup = false;
    try { await A.use('pads').generateOpenInvite(r.key); } catch (_) { dup = true; }
    ok(dup, 'a second open invitation is rejected');
    B.setActor();
    ok(await B.use('pads').joinByInvite(code), 'B joins via open invite');
    C.setActor();
    ok(await C.use('pads').joinByInvite(code), 'C also joins via the same open invite (multi-use)');
  });

  t('author can remove the open invitation', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('pads').createPad('Shared2', 'INVITE-ONLY', '2026-12-31', [], null);
    const code = await A.use('pads').generateOpenInvite(r.key);
    await A.use('pads').removeOpenInvite(r.key);
    eq(await A.use('pads').getOpenInvite(r.key), null, 'open invite removed');
    B.setActor();
    let threw = false;
    try { await B.use('pads').joinByInvite(code); } catch (_) { threw = true; }
    ok(threw, 'removed open invite no longer works');
  });
});
