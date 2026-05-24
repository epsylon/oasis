const { eq, ok, notOk, deepEq, throwsAsync } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('sub-tribes: hierarchy', (t) => {
  t('A creates parent + sub, both visible to A', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const tm = A.use('tribes');
    const p = await tm.createTribe('P', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const s = await tm.createTribe('S', '', null, '', [], true, 'strict', p.key, 'OPEN', '');
    const list = await tm.listAll();
    eq(list.length, 2);
    const sub = list.find(x => x.title === 'S');
    eq(sub.parentTribeId, p.key);
  });

  t('B invited to sub-tribe gets ONLY sub key (no parent leak)', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const p = await A.use('tribes').createTribe('P', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const s = await A.use('tribes').createTribe('S', '', null, '', [], true, 'strict', p.key, 'OPEN', '');
    const code = await A.use('tribes').generateInvite(s.key);
    B.setActor();
    await B.use('tribes').joinByInvite(code);
    eq(B.tribeCrypto.getKey(s.key) ? true : false, true);
    eq(B.tribeCrypto.getKey(p.key), null);
  });

  t('B in sub cannot read parent', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const p = await A.use('tribes').createTribe('P', 'secret', null, '', [], true, 'strict', null, 'OPEN', '');
    const s = await A.use('tribes').createTribe('S', '', null, '', [], true, 'strict', p.key, 'OPEN', '');
    const code = await A.use('tribes').generateInvite(s.key);
    B.setActor();
    await B.use('tribes').joinByInvite(code);
    await throwsAsync(() => B.use('tribes').getTribeById(p.key), 'Tribe not found');
  });

  t('parent tombstone cascades to sub-tribe', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const p = await A.use('tribes').createTribe('P', '', null, '', [], true, 'strict', null, 'OPEN', '');
    await A.use('tribes').createTribe('S', '', null, '', [], true, 'strict', p.key, 'OPEN', '');
    eq((await A.use('tribes').listAll()).length, 2);
    await A.use('tribes').publishTombstone(p.key);
    eq((await A.use('tribes').listAll()).length, 0);
  });

  t('pruneOrphanKeys removes keyring entries for tombstoned tribe', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const r = await A.use('tribes').createTribe('Z', '', null, '', [], true, 'strict', null, 'OPEN', '');
    ok(A.tribeCrypto.getKey(r.key), 'key present before delete');
    await A.use('tribes').publishTombstone(r.key);
    const removed = await A.use('tribes').pruneOrphanKeys();
    eq(removed, 1);
    eq(A.tribeCrypto.getKey(r.key), null, 'key gone after prune');
    notOk(A.tribeCrypto.getAllRootIds().includes(r.key), 'rootId no longer in keyring');
  });

  t('pruneOrphanKeys cascades to sub-tribe keyring entries', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const p = await A.use('tribes').createTribe('P', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const s = await A.use('tribes').createTribe('S', '', null, '', [], true, 'strict', p.key, 'OPEN', '');
    eq(A.tribeCrypto.getAllRootIds().length, 2, 'two keys before delete');
    await A.use('tribes').publishTombstone(p.key);
    const removed = await A.use('tribes').pruneOrphanKeys();
    eq(removed, 2, 'both parent and sub keys removed');
    eq(A.tribeCrypto.getKey(p.key), null);
    eq(A.tribeCrypto.getKey(s.key), null);
  });

  t('pruneOrphanKeys leaves active tribes untouched', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const r1 = await A.use('tribes').createTribe('Keep1', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const r2 = await A.use('tribes').createTribe('Keep2', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const removed = await A.use('tribes').pruneOrphanKeys();
    eq(removed, 0);
    ok(A.tribeCrypto.getKey(r1.key));
    ok(A.tribeCrypto.getKey(r2.key));
  });

  t('cycle in parentTribeId does not infinite-loop', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const a = await A.use('tribes').createTribe('A', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const b = await A.use('tribes').createTribe('B', '', null, '', [], true, 'strict', a.key, 'OPEN', '');
    await A.use('tribes').updateTribeById(a.key, { parentTribeId: b.key });
    const status = await A.use('tribes').getEffectiveStatus(b.key);
    ok(status);
  });

  t('three-level nesting: ancestry chain correct', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const gp = await A.use('tribes').createTribe('GP', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const p = await A.use('tribes').createTribe('P', '', null, '', [], true, 'strict', gp.key, 'OPEN', '');
    const s = await A.use('tribes').createTribe('S', '', null, '', [], true, 'strict', p.key, 'OPEN', '');
    deepEq(await A.use('tribes').getAncestryChain(s.key), [s.key, p.key, gp.key]);
  });
});
