const { eq, ok } = require('../../../helpers/assert');
const { makeNetwork, makePeer } = require('../../../helpers/setup');

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
