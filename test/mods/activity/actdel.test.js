const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('activity: deleted feed disappears', (t) => {
  t('a tombstoned feed is not listed in activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('feed').createFeed('borrame #test', []);
    let acts = await A.use('activity').listFeed('all');
    ok(acts.find(a => a.type === 'feed' && (a.content?.text || '') === 'borrame #test'), 'feed visible before delete');
    await A.use('feed').deleteFeedById(r.key);
    try { A.use('activity').invalidateCache(); } catch (_) {}
    acts = await A.use('activity').listFeed('all');
    const still = acts.find(a => a.type === 'feed' && (a.content?.text || '') === 'borrame #test');
    ok(!still, 'feed gone from activity after delete');
  });
});
