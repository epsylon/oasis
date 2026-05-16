const { eq, ok } = require('../../../helpers/assert');
const { makeNetwork, makePeer } = require('../../../helpers/setup');

describe('bookmarks: publish + list', (t) => {
  t('A creates bookmark', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('bookmarks').createBookmark('https://example.com', ['ref'], 'desc', 'cat', '2026-01-01');
    ok(r);
    const list = await A.use('bookmarks').listAll('all');
    ok(list.length >= 1);
  });

  t('A casts opinion on bookmark', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('bookmarks').createBookmark('https://x.com', [], '', '', '2026-01-01');
    await A.use('bookmarks').createOpinion(r.key, 'interesting');
    const list = await A.use('bookmarks').listAll('all');
    ok(list[0].opinions_inhabitants.includes(A.keypair.id));
  });
});
