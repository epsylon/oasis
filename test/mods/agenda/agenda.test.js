const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('agenda: list + discard', (t) => {
  t('listAgenda returns aggregated items', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('events').createEvent('Meet', 'd', '2030-12-01', '', 0, '', [], [], 'public', '');
    const list = await A.use('agenda').listAgenda('all');
    ok(list);
  });
});
