const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('trending: opinion + list', (t) => {
  t('listTrending returns array', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000000.sha256)', [], 'X', '', '');
    const list = await A.use('trending').listTrending({});
    ok(list);
  });

  t('A casts opinion on audio via trending model', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000001.sha256)', [], 'Y', '', '');
    await A.use('trending').createVote(r.key, 'interesting');
  });
});
