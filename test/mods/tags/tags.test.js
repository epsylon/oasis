const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('tags: aggregate from content with tags', (t) => {
  t('listTags returns aggregated tags', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000000.sha256)', ['music', 'electronic'], 'X', '', '');
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000001.sha256)', ['music', 'jazz'], 'Y', '', '');
    const tagList = await A.use('tags').listTags('all');
    ok(Array.isArray(tagList));
  });
});
