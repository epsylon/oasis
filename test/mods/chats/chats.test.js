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
