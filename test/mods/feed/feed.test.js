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

describe('feed: versions republished by other inhabitants', (t) => {
  const pub = (P, content) => new Promise((res, rej) => P.node.publish(content, (e, m) => e ? rej(e) : res(m)));
  const raw = (net, key) => net.log.find(m => m.key === key).value.content;
  const textOf = (m) => m.value?.content?.text || '';

  t('a chain crossing other authors stays one post with the latest text of its author', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('feed').createFeed('river walk', []);
    const b = await pub(B, { ...raw(net, r.key), replaces: r.key });
    const c = await pub(C, { ...raw(net, b.key), replaces: b.key });
    await pub(A, { ...raw(net, c.key), text: 'river walk at dawn', replaces: c.key });
    const feeds = (await A.use('feed').listFeeds('ALL')).filter(m => textOf(m) === 'river walk' || textOf(m) === 'river walk at dawn');
    eq(feeds.length, 1);
    eq(feeds[0].value.author, A.keypair.id);
    eq(textOf(feeds[0]), 'river walk at dawn');
    const byCopy = await A.use('feed').getFeedById(c.key);
    eq(byCopy.key, feeds[0].key);
    B.setActor();
    const mine = (await B.use('feed').listFeeds('MINE')).filter(m => textOf(m).startsWith('river walk'));
    eq(mine.length, 0, 'the copy is not the copier own post');
    const seenByB = (await B.use('feed').listFeeds('ALL')).filter(m => textOf(m).startsWith('river walk'));
    eq(seenByB.length, 1);
    eq(seenByB[0].value.author, A.keypair.id);
  });

  t('a foreign version never changes the post', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('feed').createFeed('mountain view', []);
    await pub(B, { ...raw(net, r.key), text: 'mountain view by B', replaces: r.key });
    const feeds = (await A.use('feed').listFeeds('ALL')).filter(m => textOf(m).startsWith('mountain view'));
    eq(feeds.length, 1);
    eq(textOf(feeds[0]), 'mountain view');
    eq(feeds[0].value.author, A.keypair.id);
  });

  t('refeeds and opinions through a foreign version land on the post', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('feed').createFeed('lake swim', []);
    const b = await pub(B, { ...raw(net, r.key), replaces: r.key });
    C.setActor();
    await C.use('feed').createRefeed(b.key);
    await C.use('feed').addOpinion(b.key, 'interesting');
    A.setActor();
    const feeds = (await A.use('feed').listFeeds('ALL')).filter(m => textOf(m) === 'lake swim');
    eq(feeds.length, 1);
    eq(feeds[0].value.content.refeeds, 1);
    eq(feeds[0].value.content.opinions.interesting, 1);
  });
});

describe('feed: what a feed needs', (t) => {
  t('a feed can be just a picture, but not nothing at all', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const feed = A.use('feed');
    const picture = '![photo](&' + 'p'.repeat(43) + '=.sha256)';
    const r = await feed.createFeed('', [], picture);
    ok(r && r.key, 'a picture alone is published');
    const listed = await feed.listFeeds('all');
    ok(listed.some(f => String(f.value?.content?.text || f.content?.text || f.text || '').includes(picture)), 'and listed');
    let refused = false;
    try { await feed.createFeed('   ', [], null); } catch (e) { refused = /required/i.test(e.message); }
    ok(refused, 'an empty feed is refused');
  });
});
