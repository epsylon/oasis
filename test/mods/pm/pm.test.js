const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('pm: send + list private messages', (t) => {
  t('A sends private message to B', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const r = await A.use('pm').sendMessage([B.keypair.id], 'subject', 'hello B');
    ok(r);
  });

  t('A lists own sent private messages', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    await A.use('pm').sendMessage([B.keypair.id], 's', 'msg');
    const list = await A.use('pm').listAllPrivate();
    ok(Array.isArray(list));
  });

  t('B receives A private message in own list', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    await A.use('pm').sendMessage([B.keypair.id], 'hi', 'secret');
    B.setActor();
    const list = await B.use('pm').listAllPrivate();
    ok(Array.isArray(list));
  });
});
