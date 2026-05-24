const { eq, ok, notOk, deepEq, throwsAsync } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('tribes: create + list', (t) => {
  t('A creates private tribe, sees it in listAll', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const tm = A.use('tribes');
    const r = await tm.createTribe('Secret', 'd', null, '', [], true, 'strict', null, 'OPEN', '');
    const list = await tm.listAll();
    eq(list.length, 1);
    eq(list[0].title, 'Secret');
    eq(list[0].id, r.key);
  });

  t('A creates public tribe, outsider B sees it', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('tribes').createTribe('Public', '', null, '', [], false, 'strict', null, 'OPEN', '');
    B.setActor();
    const list = await B.use('tribes').listAll();
    eq(list.length, 1);
    eq(list[0].title, 'Public');
  });

  t('outsider B does NOT see private tribe', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('tribes').createTribe('Hidden', '', null, '', [], true, 'strict', null, 'OPEN', '');
    B.setActor();
    eq((await B.use('tribes').listAll()).length, 0);
  });

  t('private tribe envelope is opaque (no plaintext leak in log)', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    await A.use('tribes').createTribe('TopSecret', 'sensitive', null, '', ['x'], true, 'strict', null, 'OPEN', '');
    const wrapped = net.log.find(m => m.value.content && m.value.content.type === 'tribe-msg');
    ok(wrapped);
    notOk(net.log.find(m => {
      const c = m.value && m.value.content;
      return c && (c.title === 'TopSecret' || (c.type === 'tribe' && c.title));
    }));
  });
});

describe('tribes: invite + join', (t) => {
  t('A creates private tribe, generates invite, B joins → Members:2', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const tmA = A.use('tribes');
    const r = await tmA.createTribe('Club', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const code = await tmA.generateInvite(r.key);
    eq(typeof code, 'string'); eq(code.length, 32);
    B.setActor();
    const joined = await B.use('tribes').joinByInvite(code);
    eq(joined, r.key);
    const tribeB = await B.use('tribes').getTribeById(r.key);
    eq(tribeB.members.length, 2);
    A.setActor();
    const tribeA = await tmA.getTribeById(r.key);
    eq(tribeA.members.length, 2);
    ok(tribeA.members.includes(B.keypair.id));
  });

  t('B cannot join with wrong code', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('tribes').createTribe('X', '', null, '', [], true, 'strict', null, 'OPEN', '');
    await A.use('tribes').generateInvite(r.key);
    B.setActor();
    await throwsAsync(() => B.use('tribes').joinByInvite('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), 'Invalid');
  });

  t('outsider C cannot reuse invite after B consumed it', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('tribes').createTribe('X', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const code = await A.use('tribes').generateInvite(r.key);
    B.setActor();
    await B.use('tribes').joinByInvite(code);
    C.setActor();
    await throwsAsync(() => C.use('tribes').joinByInvite(code), 'Invalid');
  });
});

describe('tribes: content', (t) => {
  t('A publishes feed in tribe, B (member) reads it', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('tribes').createTribe('G', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const code = await A.use('tribes').generateInvite(r.key);
    B.setActor();
    await B.use('tribes').joinByInvite(code);
    A.setActor();
    await A.use('tribesContent').create(r.key, 'feed', { description: 'hi B' });
    B.setActor();
    const items = await B.use('tribesContent').listByTribe(r.key, 'feed');
    eq(items.length, 1);
    eq(items[0].description, 'hi B');
  });

  t('non-member sees no tribe-content', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('tribes').createTribe('G', '', null, '', [], true, 'strict', null, 'OPEN', '');
    await A.use('tribesContent').create(r.key, 'feed', { description: 'private' });
    C.setActor();
    eq((await C.use('tribesContent').listByTribe(r.key, 'feed')).length, 0);
  });
});

describe('tribes: invariants', (t) => {
  t('multiple updates resolve to single tribe with latest tip', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const r = await A.use('tribes').createTribe('X', '', null, '', [], true, 'strict', null, 'OPEN', '');
    await A.use('tribes').updateTribeById(r.key, { description: 'a' });
    await A.use('tribes').updateTribeById(r.key, { description: 'b' });
    const list = await A.use('tribes').listAll();
    eq(list.length, 1);
    eq(list[0].description, 'b');
  });

  t('getChainIds returns full chain', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const r = await A.use('tribes').createTribe('X', '', null, '', [], true, 'strict', null, 'OPEN', '');
    await A.use('tribes').updateTribeById(r.key, { description: '1' });
    await A.use('tribes').updateTribeById(r.key, { description: '2' });
    const chain = await A.use('tribes').getChainIds(r.key);
    eq(chain.length, 3);
    eq(chain[0], r.key);
  });
});
