const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('favorites: list', (t) => {
  t('listAll returns favorites map', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const list = await A.use('favorites').listAll({ kind: 'audios' });
    ok(list);
  });
});
