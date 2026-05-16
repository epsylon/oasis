const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('transfers: create + list + confirm', (t) => {
  t('A creates transfer to B', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('transfers').createTransfer(B.keypair.id, 'rent', '10', '2026-12-31', []);
    ok(r);
    const list = await A.use('transfers').listAll('all');
    ok(list.length >= 1);
    const mine = list.find(x => x.concept === 'rent');
    ok(mine);
    ok(mine.amount.startsWith('10'));
    eq(mine.to, B.keypair.id);
  });

  t('B (recipient) confirms transfer', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('transfers').createTransfer(B.keypair.id, 'fee', '5', '2026-12-31', []);
    B.setActor();
    await B.use('transfers').confirmTransferById(r.key);
    const list = await B.use('transfers').listAll('all');
    const t = list.find(x => x.concept === 'fee');
    ok(t);
    ok(t.confirmedBy.includes(B.keypair.id));
  });

  t('A casts opinion on transfer', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('transfers').createTransfer(B.keypair.id, 'gift', '1', '2026-12-31', []);
    await A.use('transfers').createOpinion(r.key, 'inspiring');
  });
});

describe('transfers: ECONOMIC / TIME / TRUST categories', (t) => {
  t('default category is ECONOMIC when omitted', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('transfers').createTransfer(B.keypair.id, 'rent', '10', '2026-12-31', []);
    const list = await A.use('transfers').listAll('all');
    const tr = list.find(x => x.concept === 'rent');
    eq(tr.category, 'ECONOMIC');
  });

  t('TIME category persists and round-trips', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('transfers').createTransfer(B.keypair.id, 'fix-router', '2', '2026-12-31', ['help'], 'TIME');
    const list = await A.use('transfers').listAll('all');
    const tr = list.find(x => x.concept === 'fix-router');
    eq(tr.category, 'TIME');
    ok(tr.amount.startsWith('2'));
  });

  t('TRUST category persists and round-trips', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('transfers').createTransfer(B.keypair.id, 'vouch', '1', '2026-12-31', [], 'TRUST');
    const list = await A.use('transfers').listAll('all');
    const tr = list.find(x => x.concept === 'vouch');
    eq(tr.category, 'TRUST');
  });

  t('invalid category falls back to ECONOMIC', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('transfers').createTransfer(B.keypair.id, 'garbage-cat', '3', '2026-12-31', [], 'NONSENSE');
    const list = await A.use('transfers').listAll('all');
    const tr = list.find(x => x.concept === 'garbage-cat');
    eq(tr.category, 'ECONOMIC');
  });

  t('lowercase category is normalized', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('transfers').createTransfer(B.keypair.id, 'lc', '4', '2026-12-31', [], 'time');
    const list = await A.use('transfers').listAll('all');
    const tr = list.find(x => x.concept === 'lc');
    eq(tr.category, 'TIME');
  });

  t('update preserves category when not specified', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('transfers').createTransfer(B.keypair.id, 'orig', '5', '2026-12-31', [], 'TRUST');
    await A.use('transfers').updateTransferById(r.key, B.keypair.id, 'orig-v2', '6', '2026-12-31', []);
    const list = await A.use('transfers').listAll('all');
    const tr = list.find(x => x.concept === 'orig-v2');
    eq(tr.category, 'TRUST');
  });

  t('update can change category', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('transfers').createTransfer(B.keypair.id, 'swap', '5', '2026-12-31', [], 'ECONOMIC');
    await A.use('transfers').updateTransferById(r.key, B.keypair.id, 'swap-v2', '6', '2026-12-31', [], 'TIME');
    const list = await A.use('transfers').listAll('all');
    const tr = list.find(x => x.concept === 'swap-v2');
    eq(tr.category, 'TIME');
  });

  t('confirm preserves category', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('transfers').createTransfer(B.keypair.id, 'keepcat', '5', '2026-12-31', [], 'TIME');
    B.setActor();
    await B.use('transfers').confirmTransferById(r.key);
    const list = await B.use('transfers').listAll('all');
    const tr = list.find(x => x.concept === 'keepcat');
    eq(tr.category, 'TIME');
    ok(tr.confirmedBy.includes(B.keypair.id));
  });
});
