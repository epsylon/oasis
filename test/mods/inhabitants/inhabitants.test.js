const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('inhabitants: list', (t) => {
  t('lists peers in the network', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); A.setActor();
    const list = await A.use('inhabitants').listInhabitants({ filter: 'all', includeInactive: true });
    ok(Array.isArray(list));
  });
});
