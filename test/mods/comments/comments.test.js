const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const publish = (P, content) => new Promise((res, rej) => P.node.publish(content, (e, m) => e ? rej(e) : res(m)));

describe('comments: what a comment is', (t) => {
  t('a post pointing at any content is a comment, a post without root is a blog', async () => {
    const comments = require('../../../src/models/comments_model');
    const root = '%' + 'a'.repeat(43) + '=.sha256';
    ok(comments.isComment({ type: 'post', text: 'hi', root }));
    notOk(comments.isComment({ type: 'post', text: 'entry' }), 'a blog is not a comment');
    notOk(comments.isComment({ type: 'post', text: 'sub', root, fork: root }), 'a subtopic is not a comment');
    notOk(comments.isComment({ type: 'image', root }), 'only posts are comments');
    ok(comments.isBlogPost({ type: 'post', text: 'entry' }));
    notOk(comments.isBlogPost({ type: 'post', text: 'hi', root }));
  });
});

describe('comments: where a comment lives', (t) => {
  t('a comment is located on the content it comments, whatever its module', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const comments = A.use('comments');
    const blog = await publish(A, { type: 'post', text: 'an entry' });
    const doc = await publish(A, { type: 'document', title: 'manual', url: '&' + 'b'.repeat(43) + '=.sha256' });
    const onBlog = await comments.publish({ rootId: blog.key, text: 'nice entry' });
    const onDoc = await comments.publish({ rootId: doc.key, text: 'the pdf is broken' });
    eq((await comments.locate(onBlog.key)).rootType, 'post', 'a blog comment stays in the blog');
    const at = await comments.locate(onDoc.key);
    eq(at.rootType, 'document', 'a document comment lives in the document');
    eq(at.rootId, doc.key);
    eq(at.commentId, onDoc.key);
    eq((await comments.locate(doc.key)).rootType, 'document', 'the content itself is located too');
    const items = await comments.annotate([{ value: { content: { type: 'post', text: 'x', root: doc.key } } }, { value: { content: { type: 'post', text: 'entry' } } }]);
    eq(items[0].comment.rootType, 'document', 'listed comments know what they comment');
    notOk(items[1].comment, 'blogs are left as they are');
  });

  t('comments are listed and counted per content, oldest first', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const comments = A.use('comments');
    const img = await publish(A, { type: 'image', title: 'pic' });
    const other = await publish(A, { type: 'video', title: 'clip' });
    await comments.publish({ rootId: img.key, text: 'first' });
    B.setActor();
    await B.use('comments').publish({ rootId: img.key, text: 'second' });
    A.setActor();
    await comments.publish({ rootId: other.key, text: 'elsewhere' });
    const list = await comments.listFor(img.key);
    eq(list.map(m => m.value.content.text).join(','), 'first,second');
    const counts = await comments.countsFor([img.key, other.key]);
    eq(counts.get(img.key), 2);
    eq(counts.get(other.key), 1);
    let refused = false;
    try { await comments.publish({ rootId: 'not-a-message', text: 'x' }); } catch (_) { refused = true; }
    ok(refused, 'a comment needs a real content to point at');
  });
});

describe('comments: how lists show them', (t) => {
  const id = (c) => '%' + c.repeat(43) + '=.sha256';
  const commentAction = (key, root, rootType, author = '@x') =>
    ({ id: key, type: 'post', author, ts: Date.now(), content: { type: 'post', text: 'the pdf is broken', root }, comment: { rootId: root, rootType } });

  t('activity labels a comment by what it comments and opens it there', async () => {
    const { activityView } = require('../../../src/views/activity_view');
    const html = String(await activityView([commentAction(id('c'), id('d'), 'document')], 'all', '@me'));
    ok(/DOCUMENTS? · COMMENT/i.test(html), 'labelled as a comment on a document');
    ok(html.includes(`/documents/${encodeURIComponent(id('d'))}?comments=open#${encodeURIComponent(id('c'))}`), 'links to the comment inside the document');
    notOk(html.includes('/blogs/'), 'never sent to blogs');
  });

  t('activity filters put comments with their module, not with blogs', async () => {
    const { activityView } = require('../../../src/views/activity_view');
    const onImage = commentAction(id('e'), id('i'), 'image');
    const onBlog = commentAction(id('f'), id('b'), 'post');
    const blogHtml = String(await activityView([onImage, onBlog], 'post', '@me'));
    ok(blogHtml.includes(encodeURIComponent(id('b'))), 'a blog comment stays under BLOG');
    notOk(blogHtml.includes(encodeURIComponent(id('i'))), 'an image comment is not a blog');
    const imageHtml = String(await activityView([onImage, onBlog], 'image', '@me'));
    ok(imageHtml.includes(encodeURIComponent(id('i'))), 'an image comment is listed with images');
  });

  t('a comment whose content is unknown is resolved by the server', async () => {
    const { commentHref } = require('../../../src/views/activity_view');
    eq(commentHref({ rootId: id('r'), rootType: null }, id('k')), `/thread/${encodeURIComponent(id('k'))}`);
  });

  t('own comments can be deleted as comments and are not offered as blog favourites', async () => {
    const { activityView } = require('../../../src/views/activity_view');
    const html = String(await activityView([commentAction(id('g'), id('v'), 'video', '@me')], 'all', '@me'));
    ok(html.includes(`/comments/delete/${encodeURIComponent(id('g'))}`));
    notOk(html.includes('favKind') || html.includes('value="blogs"'), 'no blog favourite for a comment');
  });

  t('the block explorer counts comments apart from blogs', () => {
    const { computeStats } = require('../../../src/views/blockchain_view');
    const s = computeStats([
      { type: 'post', author: '@a', content: { text: 'entry' } },
      { type: 'post', author: '@a', content: { text: 'reply', root: id('z') } },
      { type: 'post', author: '@b', content: { text: 'reply', root: id('z') } }
    ]);
    eq(s.typeBreakdown.find(x => x.type === 'comment').count, 2);
    eq(s.typeBreakdown.find(x => x.type === 'post').count, 1);
  });
});

describe('comments: what a comment is worth', (t) => {
  t('commenting earns less karma than publishing, wherever the comment is', () => {
    const karma = require('../../../src/models/karma_model')({});
    const root = '%' + 'q'.repeat(43) + '=.sha256';
    const blog = karma.basePointsFor({ type: 'post', content: { type: 'post', text: 'an entry' } });
    const comment = karma.basePointsFor({ type: 'post', content: { type: 'post', text: 'a reply', root } });
    ok(comment > 0, 'a comment still counts');
    ok(comment < blog, 'but less than a blog');
  });
});

describe('comments: more places to talk', (t) => {
  const id = (c) => '%' + c.repeat(43) + '=.sha256';
  const comment = (root, text) => ({ key: id(text[0]), value: { author: '@x', timestamp: Date.now(), content: { type: 'post', text, root } } });

  t('comments of several contents are read at once, each with its own', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const comments = A.use('comments');
    const one = await publish(A, { type: 'wikiPage', title: 'one' });
    const two = await publish(A, { type: 'map', title: 'two' });
    await comments.publish({ rootId: one.key, text: 'about one' });
    await comments.publish({ rootId: two.key, text: 'about two' });
    await comments.publish({ rootId: two.key, text: 'more on two' });
    const many = await comments.listForMany([one.key, two.key]);
    eq(many.get(one.key).length, 1);
    eq(many.get(two.key).map(m => m.value.content.text).join(','), 'about two,more on two');
  });

  t('public pages show the shared comment section', async () => {
    const list = [comment(id('w'), 'wiki talk')];
    const { wikiPageView } = require('../../../src/views/wiki_view');
    const wiki = String(await wikiPageView({ id: id('w'), title: 'Page', body: 'text', versions: [], linkedPages: [], tags: [], author: '@x', createdAt: new Date().toISOString() }, { comments: list }));
    ok(wiki.includes(`/wiki/${encodeURIComponent(id('w'))}/comments`) && wiki.includes('wiki talk'), 'wiki');
    const noComments = String(await wikiPageView({ id: id('w'), title: 'Page', body: 'text', versions: [], linkedPages: [], tags: [], author: '@x', createdAt: new Date().toISOString() }, {}));
    notOk(noComments.includes('/comments"'), 'no section where comments are not allowed');
  });
});
