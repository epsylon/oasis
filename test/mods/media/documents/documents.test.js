const { eq, ok } = require('../../../helpers/assert');
const { makeNetwork, makePeer } = require('../../../helpers/setup');

const publishAs = async (peer, content) => {
  const ssb = await peer.cooler.open();
  return new Promise((res, rej) => ssb.publish(content, (err, msg) => err ? rej(err) : res(msg)));
};

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

describe('documents: versions republished by other inhabitants', (t) => {
  t('foreign versions in the chain do not duplicate the item and the author edit after them wins', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('documents').createDocument(BLOB, [], 'Original', '');
    const raw = net.log.find(m => m.key === r.key).value.content;
    const vB = await publishAs(B, { ...raw, replaces: r.key });
    const vC = await publishAs(C, { ...raw, replaces: vB.key });
    await publishAs(A, { ...raw, title: 'Edited', replaces: vC.key });
    const list = await A.use('documents').listAll('all');
    eq(list.length, 1);
    eq(list[0].author, A.keypair.id);
    eq(list[0].title, 'Edited');
    const viaC = await A.use('documents').getDocumentById(vC.key);
    eq(viaC.rootId, list[0].rootId);
    eq(viaC.title, 'Edited');
  });

  t('a foreign version with a changed title does not change the item', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('documents').createDocument(BLOB, [], 'Original', '');
    const raw = net.log.find(m => m.key === r.key).value.content;
    await publishAs(B, { ...raw, title: 'Hijacked', replaces: r.key });
    const list = await A.use('documents').listAll('all');
    eq(list.length, 1);
    eq(list[0].author, A.keypair.id);
    eq(list[0].title, 'Original');
  });
});
