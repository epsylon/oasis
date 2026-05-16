const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('opinions: cast + list', (t) => {
  t('A creates content (audio) then casts opinion via opinions model', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const audio = await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000000.sha256)', [], 'X', '', '');
    await A.use('opinions').createVote(audio.key, 'interesting');
    const list = await A.use('opinions').listOpinions('ALL', '');
    ok(Array.isArray(list));
  });
});
