const { eq, ok } = require('../../../helpers/assert');
const { makeNetwork, makePeer } = require('../../../helpers/setup');

const publishAs = async (peer, content) => {
  const ssb = await peer.cooler.open();
  return new Promise((res, rej) => ssb.publish(content, (err, msg) => err ? rej(err) : res(msg)));
};

describe('bookmarks: publish + list', (t) => {
  t('A creates bookmark', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('bookmarks').createBookmark('https://example.com', ['ref'], 'desc', '2026-01-01');
    ok(r);
    const list = await A.use('bookmarks').listAll('all');
    ok(list.length >= 1);
  });

  t('A casts opinion on bookmark', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('bookmarks').createBookmark('https://x.com', [], '', '2026-01-01');
    await A.use('bookmarks').createOpinion(r.key, 'interesting');
    const list = await A.use('bookmarks').listAll('all');
    ok(list[0].opinions_inhabitants.includes(A.keypair.id));
  });
});

describe('bookmarks: versions republished by other inhabitants', (t) => {
  t('foreign versions in the chain do not duplicate the item and the author edit after them wins', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('bookmarks').createBookmark('https://example.com', [], 'Original', '2026-01-01');
    const raw = net.log.find(m => m.key === r.key).value.content;
    const vB = await publishAs(B, { ...raw, replaces: r.key });
    const vC = await publishAs(C, { ...raw, replaces: vB.key });
    await publishAs(A, { ...raw, description: 'Edited', replaces: vC.key });
    const list = await A.use('bookmarks').listAll('all');
    eq(list.length, 1);
    eq(list[0].author, A.keypair.id);
    eq(list[0].description, 'Edited');
    const viaC = await A.use('bookmarks').getBookmarkById(vC.key);
    eq(viaC.rootId, list[0].rootId);
    eq(viaC.description, 'Edited');
  });

  t('a foreign version with a changed description does not change the item', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('bookmarks').createBookmark('https://example.com', [], 'Original', '2026-01-01');
    const raw = net.log.find(m => m.key === r.key).value.content;
    await publishAs(B, { ...raw, description: 'Hijacked', replaces: r.key });
    const list = await A.use('bookmarks').listAll('all');
    eq(list.length, 1);
    eq(list[0].author, A.keypair.id);
    eq(list[0].description, 'Original');
  });
});
