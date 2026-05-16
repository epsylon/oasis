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
