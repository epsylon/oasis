const { eq, ok } = require('../../../helpers/assert');
const { makeNetwork, makePeer } = require('../../../helpers/setup');

const publishAs = async (peer, content) => {
  const ssb = await peer.cooler.open();
  return new Promise((res, rej) => ssb.publish(content, (err, msg) => err ? rej(err) : res(msg)));
};

const BLOB = '[v](&video000000000000000000000000000000000000000000000.sha256)';

describe('videos: publish + list', (t) => {
  t('A creates video, lists it', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('videos').createVideo(BLOB, ['tag'], 'Vid', 'd', '');
    ok(r.key);
    const list = await A.use('videos').listAll('all');
    eq(list.length, 1);
    eq(list[0].title, 'Vid');
  });

  t('opinion on video', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('videos').createVideo(BLOB, [], 'V', '', '');
    await A.use('videos').createOpinion(r.key, 'inspiring');
    const list = await A.use('videos').listAll('all');
    ok(list[0].opinions.inspiring >= 1);
  });

  t('delete video', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('videos').createVideo(BLOB, [], 'V', '', '');
    await A.use('videos').deleteVideoById(r.key);
    eq((await A.use('videos').listAll('all')).length, 0);
  });
});

describe('videos: versions republished by other inhabitants', (t) => {
  t('foreign versions in the chain do not duplicate the item and the author edit after them wins', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('videos').createVideo(BLOB, [], 'Original', '', '');
    const raw = net.log.find(m => m.key === r.key).value.content;
    const vB = await publishAs(B, { ...raw, replaces: r.key });
    const vC = await publishAs(C, { ...raw, replaces: vB.key });
    await publishAs(A, { ...raw, title: 'Edited', replaces: vC.key });
    const list = await A.use('videos').listAll('all');
    eq(list.length, 1);
    eq(list[0].author, A.keypair.id);
    eq(list[0].title, 'Edited');
    const viaC = await A.use('videos').getVideoById(vC.key);
    eq(viaC.rootId, list[0].rootId);
    eq(viaC.title, 'Edited');
  });

  t('a foreign version with a changed title does not change the item', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('videos').createVideo(BLOB, [], 'Original', '', '');
    const raw = net.log.find(m => m.key === r.key).value.content;
    await publishAs(B, { ...raw, title: 'Hijacked', replaces: r.key });
    const list = await A.use('videos').listAll('all');
    eq(list.length, 1);
    eq(list[0].author, A.keypair.id);
    eq(list[0].title, 'Original');
  });
});
