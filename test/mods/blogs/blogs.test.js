const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('blogs: publish and list', (t) => {
  t('a published blog carries its subject, body and comment policy', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const blogs = A.use('blogs');
    const created = await blogs.createBlog({ text: 'the body', subject: 'the subject', allowComments: true });
    const blog = await blogs.getBlogById(created.key);
    eq(blog.subject, 'the subject', 'subject stored');
    eq(blog.text, 'the body', 'body stored');
    ok(blog.allowComments, 'comments open by default');
    eq(blog.commentCount, 0, 'no comments yet');
  });

  t('a blog with comments disabled says so', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const blogs = A.use('blogs');
    const created = await blogs.createBlog({ text: 'no replies please', allowComments: false });
    const blog = await blogs.getBlogById(created.key);
    notOk(blog.allowComments, 'comments closed');
  });

  t('an empty blog is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const blogs = A.use('blogs');
    let threw = false;
    try { await blogs.createBlog({ text: '   ' }); } catch (_) { threw = true; }
    ok(threw, 'blank text refused');
  });

  t('MINE lists only the viewer blogs, ALL lists everyone', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await A.use('blogs').createBlog({ text: 'from A' });
    B.setActor(); await B.use('blogs').createBlog({ text: 'from B' });

    B.setActor();
    const mine = await B.use('blogs').listAll('MINE');
    eq(mine.length, 1, 'one own blog');
    eq(mine[0].text, 'from B', 'the right one');
    const all = await B.use('blogs').listAll('ALL');
    eq(all.length, 2, 'both blogs listed');
  });

  t('the search box matches subject and body', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const blogs = A.use('blogs');
    await blogs.createBlog({ text: 'about beekeeping', subject: 'hives' });
    await blogs.createBlog({ text: 'about bicycles', subject: 'wheels' });
    eq((await blogs.listAll('ALL', { q: 'bee' })).length, 1, 'matches the body');
    eq((await blogs.listAll('ALL', { q: 'wheel' })).length, 1, 'matches the subject');
    eq((await blogs.listAll('ALL', { q: 'nothing' })).length, 0, 'no false positives');
  });

  t('comments and replies are not listed as blogs of their own', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const blogs = A.use('blogs');
    const created = await blogs.createBlog({ text: 'root entry' });
    await new Promise((res, rej) =>
      A.node.publish({ type: 'post', text: 'a reply', root: created.key }, (err) => err ? rej(err) : res()));
    const list = await blogs.listAll('ALL');
    eq(list.length, 1, 'only the root is a blog');
    eq(list[0].commentCount, 1, 'the reply counts as a comment');
  });

  t('an opinion is counted once per inhabitant', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const created = await A.use('blogs').createBlog({ text: 'rate me' });

    B.setActor();
    await B.use('blogs').createOpinion(created.key, 'interesting');
    let threw = false;
    try { await B.use('blogs').createOpinion(created.key, 'necessary'); } catch (_) { threw = true; }
    ok(threw, 'a second opinion from the same inhabitant is refused');

    A.setActor();
    const blog = await A.use('blogs').getBlogById(created.key);
    eq(blog.opinions.interesting, 1, 'one opinion counted');
    eq(blog.opinions_inhabitants.length, 1, 'one voter');
  });

  t('TOP ranks by opinions and comments, not by date', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const blogs = A.use('blogs');
    const quiet = await blogs.createBlog({ text: 'quiet one' });
    const loud = await blogs.createBlog({ text: 'loud one' });
    B.setActor();
    await B.use('blogs').createOpinion(loud.key, 'interesting');
    A.setActor();
    const top = await A.use('blogs').listAll('TOP');
    eq(top[0].id, loud.key, 'the one with an opinion comes first');
    eq(top[1].id, quiet.key, 'the quiet one second');
  });
});

describe('blogs: rendering', (t) => {
  t('the list, the create form and the detail page all render', async () => {
    const { blogView, singleBlogView } = require('../../../src/views/blog_view');
    const { mentionsView } = require('../../../src/views/mentions_view');

    const blog = {
      id: '%blog.sha256', author: '@someone.ed25519', subject: 'a subject',
      text: 'a body with a [link](https://example.org)', allowComments: true,
      createdAt: new Date().toISOString(), commentCount: 2,
      opinions: { interesting: 1 }, opinions_inhabitants: ['@x.ed25519']
    };

    const list = String(await blogView([blog], 'ALL', { spreadMap: new Map() }));
    ok(list.includes('a subject'), 'the subject is on the card');
    ok(list.includes('/blogs/'), 'the card links into the module');
    notOk(list.includes('>false<'), 'no falsy value leaked into the html');

    const form = String(await blogView([], 'CREATE', {}));
    ok(form.includes('/blogs/create'), 'the form posts to the module');
    ok(form.includes('allowComments'), 'the comment policy is part of the form');

    const detail = String(await singleBlogView(blog, [], {}));
    ok(detail.includes('/blogs/opinions/'), 'opinions are votable');
    ok(detail.includes('/comments'), 'the comment form is there');
    ok(detail.includes('comments-collapse'), 'and it is the same dropdown every module uses');
    ok(detail.includes(String(require('../../../src/views/main_views').i18n.blogTitle)), 'the detail says which module it belongs to');

    const closed = String(await singleBlogView({ ...blog, allowComments: false }, [], {}));
    notOk(closed.includes('/comments'), 'no comment form when the author closed them');

    const mentions = String(await mentionsView(
      [{ id: '%m.sha256', author: '@a.ed25519', type: 'event', title: 'a meetup', text: 'come', content: {}, createdAt: new Date().toISOString() }],
      'ALL',
      { counts: { event: 1 }, total: 1, q: '' }
    ));
    ok(mentions.includes('/events/'), 'a mention links to the content it lives in');
    notOk(mentions.includes('>false<'), 'no falsy value leaked into the html');
  });
});

describe('blogs: where a post link points', (t) => {
  t('a root post resolves to its blog page and a comment to its anchor', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const blogs = A.use('blogs');
    const root = await blogs.createBlog({ text: 'root entry' });
    const comment = await new Promise((res, rej) =>
      A.node.publish({ type: 'post', text: 'a reply', root: root.key }, (err, m) => err ? rej(err) : res(m)));

    eq(await blogs.blogHrefFor(root.key), `/blogs/${encodeURIComponent(root.key)}`, 'root goes to the blog page');
    eq(await blogs.blogHrefFor(comment.key),
      `/blogs/${encodeURIComponent(root.key)}#${encodeURIComponent(comment.key)}`,
      'a comment goes to its anchor inside the blog');
    eq(await blogs.resolveRootId(comment.key), root.key, 'a comment resolves to its root');
  });

  t('non-blog content keeps using the thread view', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const blogs = A.use('blogs');
    const about = await new Promise((res, rej) =>
      A.node.publish({ type: 'about', about: A.keypair.id, name: 'me' }, (err, m) => err ? rej(err) : res(m)));
    const priv = await new Promise((res, rej) =>
      A.node.publish({ type: 'post', text: 'secret', private: true }, (err, m) => err ? rej(err) : res(m)));
    eq(await blogs.blogHrefFor(about.key), null, 'an about message is not a blog');
    eq(await blogs.blogHrefFor(priv.key), null, 'a private post is not a blog');
  });
});
