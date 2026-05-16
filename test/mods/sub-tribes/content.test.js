const { eq, ok, notOk, throwsAsync } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('sub-tribes: content publishing', (t) => {
  t('A publishes a feed inside a sub-tribe', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const p = await A.use('tribes').createTribe('P', '', null, '', [], false, true, 'strict', null, 'OPEN', '');
    const s = await A.use('tribes').createTribe('S', '', null, '', [], false, true, 'strict', p.key, 'OPEN', '');
    await A.use('tribesContent').create(s.key, 'feed', { description: 'feed in sub' });
    const items = await A.use('tribesContent').listByTribe(s.key, 'feed');
    eq(items.length, 1);
    eq(items[0].description, 'feed in sub');
  });

  t('content in sub-tribe is NOT visible to parent-only members', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const p = await A.use('tribes').createTribe('P', '', null, '', [], false, true, 'strict', null, 'OPEN', '');
    const s = await A.use('tribes').createTribe('S', '', null, '', [], false, true, 'strict', p.key, 'OPEN', '');
    const code = await A.use('tribes').generateInvite(p.key);
    B.setActor();
    await B.use('tribes').joinByInvite(code);
    A.setActor();
    await A.use('tribesContent').create(s.key, 'feed', { description: 'sub only' });
    B.setActor();
    const items = await B.use('tribesContent').listByTribe(s.key, 'feed');
    eq(items.length, 0, 'B (parent member, not sub member) cannot read sub content');
  });

  t('content in parent-tribe is NOT visible to sub-tribe-only members', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const p = await A.use('tribes').createTribe('P', '', null, '', [], false, true, 'strict', null, 'OPEN', '');
    const s = await A.use('tribes').createTribe('S', '', null, '', [], false, true, 'strict', p.key, 'OPEN', '');
    const code = await A.use('tribes').generateInvite(s.key);
    B.setActor();
    await B.use('tribes').joinByInvite(code);
    A.setActor();
    await A.use('tribesContent').create(p.key, 'feed', { description: 'parent only' });
    B.setActor();
    const items = await B.use('tribesContent').listByTribe(p.key, 'feed');
    eq(items.length, 0, 'B (sub member only) cannot read parent content');
  });

  t('event in sub-tribe with attendees', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const p = await A.use('tribes').createTribe('P', '', null, '', [], false, true, 'strict', null, 'OPEN', '');
    const s = await A.use('tribes').createTribe('S', '', null, '', [], false, true, 'strict', p.key, 'OPEN', '');
    const ev = await A.use('tribesContent').create(s.key, 'event', { title: 'sub party', description: 'd', date: '2030-12-01' });
    await A.use('tribesContent').toggleAttendee(ev.key);
    const items = await A.use('tribesContent').listByTribe(s.key, 'event');
    eq(items.length, 1);
    ok(items[0].attendees.includes(A.keypair.id));
  });

  t('votation in sub-tribe', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const p = await A.use('tribes').createTribe('P', '', null, '', [], false, true, 'strict', null, 'OPEN', '');
    const s = await A.use('tribes').createTribe('S', '', null, '', [], false, true, 'strict', p.key, 'OPEN', '');
    const v = await A.use('tribesContent').create(s.key, 'votation', { title: 'sub vote', options: ['yes', 'no'] });
    await A.use('tribesContent').castVote(v.key, 0);
    const items = await A.use('tribesContent').listByTribe(s.key, 'votation');
    eq(items.length, 1);
    eq(items[0].votes['0'].length, 1);
  });

  t('sub-tribe content uses sub-tribe key (different fp from parent)', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const p = await A.use('tribes').createTribe('P', '', null, '', [], false, true, 'strict', null, 'OPEN', '');
    const s = await A.use('tribes').createTribe('S', '', null, '', [], false, true, 'strict', p.key, 'OPEN', '');
    const pkey = A.tribeCrypto.getKey(p.key);
    const skey = A.tribeCrypto.getKey(s.key);
    notOk(pkey === skey, 'parent and sub have different keys');
    notOk(A.tribeCrypto.fingerprint(pkey) === A.tribeCrypto.fingerprint(skey));
  });

  t('parent member with both keys (added to sub manually) can see both', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const p = await A.use('tribes').createTribe('P', '', null, '', [], false, true, 'strict', null, 'OPEN', '');
    const s = await A.use('tribes').createTribe('S', '', null, '', [], false, true, 'strict', p.key, 'OPEN', '');
    const codeP = await A.use('tribes').generateInvite(p.key);
    const codeS = await A.use('tribes').generateInvite(s.key);
    B.setActor();
    await B.use('tribes').joinByInvite(codeP);
    await B.use('tribes').joinByInvite(codeS);
    A.setActor();
    await A.use('tribesContent').create(p.key, 'feed', { description: 'in P' });
    await A.use('tribesContent').create(s.key, 'feed', { description: 'in S' });
    B.setActor();
    const pItems = await B.use('tribesContent').listByTribe(p.key, 'feed');
    const sItems = await B.use('tribesContent').listByTribe(s.key, 'feed');
    eq(pItems.length, 1);
    eq(sItems.length, 1);
  });
});
