const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('stats: counts', (t) => {
  t('member sees their tribes counted in stats', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('tribes').createTribe('T', '', null, '', [], false, true, 'strict', null, 'OPEN', '');
    const stats = await A.use('stats').getStats('ALL');
    ok(stats.content.tribe >= 1);
  });

  t('non-member sees zero tribes (privacy preserved)', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    await A.use('tribes').createTribe('Secret', '', null, '', [], false, true, 'strict', null, 'OPEN', '');
    B.setActor();
    const stats = await B.use('stats').getStats('ALL');
    eq(stats.content.tribe || 0, 0);
  });

  t('counts other content types', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000000.sha256)', [], 'X', '', '');
    const stats = await A.use('stats').getStats('ALL');
    ok(stats.content.audio >= 1);
  });
});
