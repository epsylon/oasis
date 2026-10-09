const { eq, ok, notOk, throwsAsync } = require('../../helpers/assert');
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

describe('transfers: UBI payments need no manual confirmation', (t) => {
  t('a UBI transfer carrying its ECOin txid is already closed', async () => {
    const net = makeNetwork(); const pub = makePeer(net); const me = makePeer(net); me.setActor();
    const txid = 'a'.repeat(64);
    const now = new Date().toISOString();
    me.node.publish({ type: 'ubiClaim', pubId: pub.keypair.id, epochId: '2026-09', claimedAt: now }, () => {});
    pub.node.publish({ type: 'transfer', from: pub.keypair.id, to: me.keypair.id, concept: 'UBI - 2026-09', amount: '2.500000', category: 'ECONOMIC', createdAt: now, updatedAt: now, deadline: null, confirmedBy: [pub.keypair.id, me.keypair.id], status: 'CLOSED', tags: ['UBI', 'epoch:2026-09'], opinions: {}, opinions_inhabitants: [], txid }, () => {});
    const list = await me.use('transfers').listAll('all', me.keypair.id);
    const paid = list.find(x => String(x.concept || '').startsWith('UBI - '));
    ok(paid, 'the payment is listed');
    eq(paid.status, 'CLOSED', 'no confirmation is pending');
  });

  t('a UBI-tagged transfer with a txid from someone you never claimed from is not settled', async () => {
    const net = makeNetwork(); const pub = makePeer(net); const stranger = makePeer(net); const me = makePeer(net); me.setActor();
    const now = new Date().toISOString();
    me.node.publish({ type: 'ubiClaim', pubId: pub.keypair.id, epochId: '2026-09', claimedAt: now }, () => {});
    stranger.node.publish({ type: 'transfer', from: stranger.keypair.id, to: me.keypair.id, concept: 'UBI - 2026-09 bonus', amount: '9.000000', category: 'ECONOMIC', createdAt: now, updatedAt: now, deadline: null, confirmedBy: [stranger.keypair.id, me.keypair.id], status: 'CLOSED', tags: ['UBI', 'epoch:2026-09'], opinions: {}, opinions_inhabitants: [], txid: 'b'.repeat(64) }, () => {});
    const list = await me.use('transfers').listAll('all', me.keypair.id);
    const forged = list.find(x => String(x.concept || '') === 'UBI - 2026-09 bonus');
    ok(forged, 'the transfer is listed');
    eq(forged.status, 'UNCONFIRMED', 'an invented txid does not close it');
  });

  t('a claim with no payment yet stays unconfirmed', async () => {
    const net = makeNetwork(); const pub = makePeer(net); const me = makePeer(net); me.setActor();
    const now = new Date().toISOString();
    pub.node.publish({ type: 'transfer', from: pub.keypair.id, to: me.keypair.id, concept: 'UBI - 2026-08', amount: '1.000000', category: 'ECONOMIC', createdAt: now, updatedAt: now, deadline: null, confirmedBy: [pub.keypair.id], status: 'UNCONFIRMED', tags: ['UBI', 'epoch:2026-08'], opinions: {}, opinions_inhabitants: [] }, () => {});
    const list = await me.use('transfers').listAll('all', me.keypair.id);
    const pending = list.find(x => String(x.concept || '') === 'UBI - 2026-08');
    ok(pending, 'the allocation is listed');
    eq(pending.status, 'UNCONFIRMED', 'without a txid it is not settled');
  });
});

describe('transfers: only signed parties decide a transfer', (t) => {
  const publish = (peer, content) => new Promise((res, rej) => peer.node.publish(content, (e, m) => e ? rej(e) : res(m)));
  const future = () => new Date(Date.now() + 30 * 86400000).toISOString();
  const raw = (from, to, extra = {}) => { const now = new Date().toISOString(); return { type: 'transfer', from, to, concept: 'raw', amount: '10.000000', category: 'ECONOMIC', createdAt: now, updatedAt: now, deadline: future(), confirmedBy: [from], status: 'UNCONFIRMED', tags: [], opinions: {}, opinions_inhabitants: [], ...extra }; };

  t('a transfer published by a third party in the payer name is ignored', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    const forged = await publish(C, raw(A.keypair.id, B.keypair.id, { concept: 'forged', confirmedBy: [A.keypair.id, B.keypair.id], status: 'CLOSED' }));
    B.setActor();
    const list = await B.use('transfers').listAll('all');
    notOk(list.find(x => x.concept === 'forged'), 'it is not listed');
    await throwsAsync(() => B.use('transfers').getTransferById(forged.key), 'Not found');
  });

  t('confirmations and status written into the content do not close a transfer', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    await publish(A, raw(A.keypair.id, B.keypair.id, { concept: 'self-closed', confirmedBy: [A.keypair.id, B.keypair.id], status: 'CLOSED' }));
    const tr = (await B.use('transfers').listAll('all')).find(x => x.concept === 'self-closed');
    ok(tr);
    eq(tr.status, 'UNCONFIRMED');
    notOk(tr.confirmedBy.includes(B.keypair.id), 'the recipient has not signed anything');
  });

  t('the recipient confirmation closes the transfer', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('transfers').createTransfer(B.keypair.id, 'closes', '10', future(), []);
    eq((await A.use('transfers').getTransferById(r.key)).status, 'UNCONFIRMED');
    B.setActor();
    await B.use('transfers').confirmTransferById(r.key);
    const tr = await A.use('transfers').getTransferById(r.key);
    eq(tr.status, 'CLOSED');
    ok(tr.confirmedBy.includes(B.keypair.id));
  });

  t('a confirmation by a stranger does not count', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('transfers').createTransfer(B.keypair.id, 'stranger-confirm', '10', future(), []);
    await publish(C, { type: 'transferConfirm', target: r.key, tip: r.key, createdAt: new Date().toISOString() });
    const tr = await A.use('transfers').getTransferById(r.key);
    eq(tr.status, 'UNCONFIRMED');
    notOk(tr.confirmedBy.includes(C.keypair.id));
  });

  t('a tombstone by a stranger does not hide a transfer, the payer one does', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('transfers').createTransfer(B.keypair.id, 'kept', '10', future(), []);
    await publish(C, { type: 'tombstone', target: r.key, deletedAt: new Date().toISOString(), author: C.keypair.id });
    ok((await B.use('transfers').listAll('all')).find(x => x.concept === 'kept'), 'still listed');
    await A.use('transfers').deleteTransferById(r.key);
    notOk((await B.use('transfers').listAll('all')).find(x => x.concept === 'kept'), 'gone once the payer deletes it');
  });

  t('an edit by another author does not replace the transfer', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('transfers').createTransfer(B.keypair.id, 'orig-author', '10', future(), []);
    await publish(B, raw(B.keypair.id, B.keypair.id, { concept: 'hijack', replaces: r.key }));
    const list = await A.use('transfers').listAll('all');
    ok(list.find(x => x.concept === 'orig-author'), 'the original stays');
    notOk(list.find(x => x.concept === 'hijack'), 'the foreign edit is dropped');
  });

  t('the payer cannot change a transfer after the recipient confirmed it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('transfers').createTransfer(B.keypair.id, 'sealed', '10', future(), []);
    B.setActor();
    await B.use('transfers').confirmTransferById(r.key);
    await publish(A, raw(A.keypair.id, B.keypair.id, { concept: 'sealed', amount: '999.000000', status: 'DISCARDED', replaces: r.key }));
    const tr = (await B.use('transfers').listAll('all')).find(x => x.concept === 'sealed');
    ok(tr);
    eq(Number(tr.amount), 10, 'the confirmed amount stays');
    eq(tr.status, 'CLOSED');
  });

  t('a UBI transfer from a random peer does not hide a pending claim, the claimed PUB payment does', async () => {
    const net = makeNetwork(); const P = makePeer(net); const R = makePeer(net); const U = makePeer(net);
    U.setActor();
    await publish(U, { type: 'ubiClaim', pubId: P.keypair.id, epochId: '2026-07', claimedAt: new Date().toISOString() });
    const pending = async () => (await U.use('transfers').listAll('all')).filter(x => x.to === U.keypair.id && (x.tags || []).includes('PENDING'));
    eq((await pending()).length, 1, 'the claim shows as pending');
    await publish(R, raw(R.keypair.id, U.keypair.id, { concept: 'UBI - 2026-07', deadline: null, tags: ['UBI', 'epoch:2026-07'], txid: 'c'.repeat(64) }));
    eq((await pending()).length, 1, 'a payment from someone else does not settle it');
    await publish(P, raw(P.keypair.id, U.keypair.id, { concept: 'UBI - 2026-07', deadline: null, tags: ['UBI', 'epoch:2026-07'], txid: 'd'.repeat(64) }));
    eq((await pending()).length, 0, 'the claimed PUB payment does');
  });

  t('the default PUB paying a claim addressed to another PUB also settles it', async () => {
    const fs = require('fs');
    const net = makeNetwork(); const P = makePeer(net); const D = makePeer(net); const U = makePeer(net);
    U.setActor();
    await publish(U, { type: 'ubiClaim', pubId: P.keypair.id, epochId: '2026-06', claimedAt: new Date().toISOString() });
    await publish(D, raw(D.keypair.id, U.keypair.id, { concept: 'UBI - 2026-06', deadline: null, tags: ['UBI', 'epoch:2026-06'], txid: 'e'.repeat(64) }));
    const realRead = fs.readFileSync;
    fs.readFileSync = function (p, ...rest) {
      if (String(p).endsWith('snh-invite-code.json')) return JSON.stringify({ code: `pub.example:8008:${D.keypair.id}~invite` });
      return realRead.call(this, p, ...rest);
    };
    try {
      const list = await U.use('transfers').listAll('all');
      eq(list.filter(x => x.to === U.keypair.id && (x.tags || []).includes('PENDING')).length, 0);
    } finally { fs.readFileSync = realRead; }
  });
});
