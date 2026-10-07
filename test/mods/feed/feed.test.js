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
describe('feed: author can delete own feeds', (t) => {
  t('a deleted feed disappears and strangers cannot delete', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('feed').createFeed('codigo caducado #oasis', []);
    B.setActor();
    let denied = false;
    try { await B.use('feed').deleteFeedById(r.key); } catch (_) { denied = true; }
    ok(denied, 'a stranger cannot delete');
    A.setActor();
    await A.use('feed').deleteFeedById(r.key);
    const feeds = await A.use('feed').listFeeds('ALL');
    ok(!feeds.find(m => (m.value?.content?.text || '') === 'codigo caducado #oasis'), 'deleted feed no longer listed');
  });
});

describe('feed: deleted comments are not counted', (t) => {
  t('the comment counter drops when its author deletes a comment', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('feed').createFeed('feed con comentarios', []);
    B.setActor();
    await B.use('feed').addComment(r.key, 'primero');
    await B.use('feed').addComment(r.key, 'segundo');
    const before = await B.use('feed').getComments(r.key);
    eq(before.length, 2, 'two comments before');
    const ssbB = await B.cooler.open();
    const gone = before.find(c => c.value.content.text === 'segundo');
    await new Promise((res, rej) => ssbB.publish({ type: 'tombstone', target: gone.key, deletedAt: new Date().toISOString(), author: ssbB.id }, e => e ? rej(e) : res()));
    A.setActor();
    const feeds = await A.use('feed').listFeeds('ALL');
    const mine = feeds.find(m => (m.value?.content?.text || '') === 'feed con comentarios');
    eq(mine.value.content.commentCount, 1, 'the list counts only the remaining comment');
    const single = await A.use('feed').getFeedById(r.key);
    eq(single.value.content.commentCount, 1, 'the detail counts only the remaining comment');
    eq((await A.use('feed').getComments(r.key)).length, 1, 'only one comment is shown');
  });
});

describe('feed: content author can delete forged copies', (t) => {
  t('a tombstone from the declared content author hides a copy signed by someone else', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const ssbB = await B.cooler.open();
    await new Promise((res, rej) => ssbB.publish({ type: 'feed', text: 'forged legacy copy', author: A.keypair.id, opinions: { love: 1 }, createdAt: new Date().toISOString() }, e => e ? rej(e) : res()));
    A.setActor();
    let feeds = await A.use('feed').listFeeds('ALL');
    const copy = feeds.find(m => (m.value?.content?.text || '') === 'forged legacy copy');
    ok(copy, 'forged copy visible before delete');
    await A.use('feed').deleteFeedById(copy.key);
    feeds = await A.use('feed').listFeeds('ALL');
    ok(!feeds.find(m => (m.value?.content?.text || '') === 'forged legacy copy'), 'content author tombstone hides it');
  });

  t('a feed at the length limit with an attachment is still listed', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const text = 'x'.repeat(270) + ' #tag';
    const media = '![image:photo.jpg](&' + 'A'.repeat(43) + '=.sha256)';
    await A.use('feed').createFeed(text, [], media);
    const feeds = await A.use('feed').listFeeds('ALL');
    const mine = feeds.find(m => String(m.value?.content?.text || '').startsWith('x'.repeat(270)));
    ok(mine, 'the feed with an attachment shows up');
    ok(String(mine.value.content.text).includes('&' + 'A'.repeat(43)), 'the attachment travels with it');
  });
});
