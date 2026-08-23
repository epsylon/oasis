const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('feed: create + refeed + comment', (t) => {
  t('A creates a feed', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('feed').createFeed('hello world #public', []);
    ok(r);
    const list = await A.use('feed').listFeeds('all');
    ok(Array.isArray(list));
    ok(list.length >= 1);
  });

  t('B refeeds A feed', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const r = await A.use('feed').createFeed('original', []);
    B.setActor();
    await B.use('feed').createRefeed(r.key);
  });

  t('B comments on A feed', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const r = await A.use('feed').createFeed('post', []);
    B.setActor();
    await B.use('feed').addComment(r.key, 'nice!');
    const comments = await B.use('feed').getComments(r.key);
    ok(Array.isArray(comments));
  });

  t('A casts opinion on feed', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('feed').createFeed('post', []);
    await A.use('feed').addOpinion(r.key, 'interesting');
  });
});

describe('feed: own feed survives cross-author duplicate merge', (t) => {
  t('viewer own feed wins over an older same-text copy by another author', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const ssbB = await B.cooler.open();
    await new Promise((res, rej) => ssbB.publish({ type: 'feed', text: 'shared idea text', author: ssbB.id, createdAt: new Date(Date.now() - 86400000).toISOString() }, e => e ? rej(e) : res()));
    A.setActor();
    await A.use('feed').createFeed('shared idea text', []);
    const feeds = await A.use('feed').listFeeds('ALL');
    const matches = feeds.filter(m => (m.value?.content?.text || '') === 'shared idea text');
    eq(matches.length, 1, 'duplicates merged into a single card');
    eq(matches[0].value.author, A.keypair.id, 'the viewer own feed is the survivor');
  });
});

describe('feed: microblogging workspace mode', (t) => {
  t('workspace layout renders side boxes, plain mode does not', async () => {
    const { feedView } = require('../../../src/views/feed_view');
    const feed = { key: '%f.sha256', value: { author: '@a.ed25519', timestamp: Date.now(), content: { type: 'feed', text: 'hola mundo', opinions: {}, refeeds: 0 } } };
    const ws = String(feedView([feed], {
      filter: 'ALL', workspace: true,
      trendingTags: [{ name: 'solarpunk' }, { name: 'p2p' }],
      activeUsers: [{ id: '@a.ed25519', avatarUrl: '/assets/images/default-avatar.png' }]
    }));
    ok(ws.includes('feed-workspace'), 'workspace grid present');
    ok(ws.includes('#solarpunk'), 'trending tag rendered');
    ok(ws.includes('/feed?tag=solarpunk'), 'tag links filter the timeline');
    ok(ws.includes('feed-side-avatar'), 'active user avatar rendered');
    ok(ws.includes('hola mundo'), 'timeline still renders');
    const plain = String(feedView([feed], { filter: 'ALL' }));
    ok(!plain.includes('feed-workspace'), 'no workspace outside the mode');
  });
});
