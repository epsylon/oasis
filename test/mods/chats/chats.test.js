const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('chats: standalone create + list', (t) => {
  t('A creates standalone chat', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('chats').createChat('Lobby', 'general chat', null, 'general', 'OPEN', ['casual'], null);
    ok(r);
    const list = await A.use('chats').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(list.length >= 1);
    const my = list.find(c => c.title === 'Lobby');
    ok(my);
  });

  t('A creates closed chat', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('chats').createChat('Private', 'd', null, 'cat', 'CLOSED', [], null);
    ok(r);
    const t = await A.use('chats').getChatById(r.key);
    eq(t.status, 'CLOSED');
  });

  t('A closes chat after creation', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('chats').createChat('Open', '', null, '', 'OPEN', [], null);
    await A.use('chats').closeChatById(r.key);
    const t = await A.use('chats').getChatById(r.key);
    eq(t.status, 'CLOSED');
  });

  t('A deletes chat', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('chats').createChat('Tmp', '', null, '', 'OPEN', [], null);
    await A.use('chats').deleteChatById(r.key);
    const list = await A.use('chats').listAll({ filter: 'all', viewerId: A.keypair.id });
    const found = list.find(c => c.title === 'Tmp');
    ok(!found, 'chat removed from list after delete');
  });
});

describe('chats: open (multi-use) invitation', (t) => {
  t('open invitation is multi-use and only one at a time', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('chats').createChat('Club', 'd', null, '', 'INVITE-ONLY', [], null);
    const code = await A.use('chats').generateOpenInvite(r.key);
    ok(typeof code === 'string' && code.length > 0, 'open invite code generated');
    eq((await A.use('chats').getOpenInvite(r.key)).code, code, 'getOpenInvite returns the code');
    let dup = false;
    try { await A.use('chats').generateOpenInvite(r.key); } catch (_) { dup = true; }
    ok(dup, 'a second open invitation is rejected');
    B.setActor();
    ok(await B.use('chats').joinByInvite(code), 'B joins via open invite');
    C.setActor();
    ok(await C.use('chats').joinByInvite(code), 'C also joins via the same open invite (multi-use)');
  });

  t('author can remove the open invitation', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('chats').createChat('Club2', 'd', null, '', 'INVITE-ONLY', [], null);
    const code = await A.use('chats').generateOpenInvite(r.key);
    await A.use('chats').removeOpenInvite(r.key);
    eq(await A.use('chats').getOpenInvite(r.key), null, 'open invite removed');
    B.setActor();
    let threw = false;
    try { await B.use('chats').joinByInvite(code); } catch (_) { threw = true; }
    ok(threw, 'removed open invite no longer works');
  });
});
