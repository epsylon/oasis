const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('activity: feed', (t) => {
  t('A creates a public tribe → A sees it in activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('tribes').createTribe('Pub', '', null, '', [], false, false, 'strict', null, 'OPEN', '');
    const feed = await A.use('activity').listFeed('all');
    ok(Array.isArray(feed));
    const tribe = feed.find(a => a.type === 'tribe');
    ok(tribe);
  });

  t('A creates a private tribe → A (member) sees its create in activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('tribes').createTribe('Hidden', '', null, '', [], false, true, 'strict', null, 'OPEN', '');
    const feed = await A.use('activity').listFeed('all');
    const tribe = feed.find(a => a.type === 'tribe');
    ok(tribe, 'A as member sees own private tribe creation');
  });

  t('B (non-member) does NOT see private tribe creation in activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('tribes').createTribe('Secret', '', null, '', [], false, true, 'strict', null, 'OPEN', '');
    B.setActor();
    const feed = await B.use('activity').listFeed('all');
    const tribe = feed.find(a => a.type === 'tribe');
    ok(!tribe, 'B sees no private tribe activity');
  });
});
