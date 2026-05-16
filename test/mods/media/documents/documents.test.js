const { eq, ok } = require('../../../helpers/assert');
const { makeNetwork, makePeer } = require('../../../helpers/setup');

const BLOB = '[d](&doc00000000000000000000000000000000000000000000000.sha256)';

describe('documents: publish + list', (t) => {
  t('A creates document', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('documents').createDocument(BLOB, ['paper'], 'Doc', 'desc');
    ok(r.key);
    const list = await A.use('documents').listAll('all');
    ok(list.length >= 1);
  });

  t('A casts opinion', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('documents').createDocument(BLOB, [], 'D', '');
    await A.use('documents').createOpinion(r.key, 'interesting');
    const list = await A.use('documents').listAll('all');
    ok(list[0].opinions_inhabitants.includes(A.keypair.id));
  });
});
