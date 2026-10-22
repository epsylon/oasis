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

  t('a blog can be scheduled: it stays private until its time, then it is published', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const blogs = A.use('blogs');
    const publishAt = new Date(Date.now() + 3600000).toISOString();
    const scheduled = await blogs.scheduleBlog({ text: 'later', subject: 'soon', publishAt });
    ok(blogs.isScheduledId(scheduled.id), 'it gets a scheduled id, not a message');
    eq(scheduled.scheduledAt, publishAt, 'it remembers when to publish');
    eq((await blogs.listAll('ALL')).map(b => b.scheduledAt).join(), publishAt, 'the author sees it in the list with its date');
    eq((await blogs.listAll('MINE')).map(b => b.scheduledAt).join(), publishAt, 'and in MINE');
    eq((await makePeer(net).use('blogs').listAll('ALL')).length, 0, 'nobody else does');
    eq((await blogs.getBlogById(scheduled.id)).subject, 'soon', 'and can open it');
    eq((await blogs.publishDue()).length, 0, 'nothing is published before its time');
    const published = await blogs.publishDue(Date.now() + 3600001);
    eq(published.length, 1, 'once the time comes it is published');
    eq((await blogs.getBlogById(published[0].msg.key)).text, 'later', 'as a normal blog');
    eq((await blogs.listAll('MINE')).filter(b => b.scheduledAt).length, 0, 'and leaves the schedule');
    let threw = false;
    try { await blogs.scheduleBlog({ text: 'past', publishAt: new Date(Date.now() - 1000).toISOString() }); } catch (_) { threw = true; }
    ok(threw, 'a date in the past is refused');
  });

  t('a scheduled blog can be cancelled by its author only', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const blogs = A.use('blogs');
    const scheduled = await blogs.scheduleBlog({ text: 'maybe', publishAt: new Date(Date.now() + 3600000).toISOString() });
    let threw = false;
    try { await B.use('blogs').cancelScheduled(scheduled.id); } catch (_) { threw = true; }
    ok(threw, 'someone else cannot cancel it');
    const later = new Date(Date.now() + 7200000).toISOString();
    const edited = await blogs.updateScheduled(scheduled.id, { text: 'maybe not', publishAt: later });
    eq(edited.text, 'maybe not', 'the author can change the text');
    eq(edited.scheduledAt, later, 'and the date');
    await blogs.cancelScheduled(scheduled.id);
    eq((await blogs.listAll('MINE')).length, 0, 'the author can');
  });

  t('the author can update a blog: readers see the new version, comments and opinions stay with it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const blogs = A.use('blogs');
    const created = await blogs.createBlog({ text: 'first words', subject: 'v1', tags: ['a'] });
    B.setActor();
    await B.use('blogs').createOpinion(created.key, 'interesting');
    A.setActor();
    const updated = await blogs.updateBlog(created.key, { text: 'second words', subject: 'v2' });
    eq(updated.rootId, created.key, 'the blog keeps its id');
    const list = await blogs.listAll('ALL');
    eq(list.length, 1, 'only one blog is listed');
    eq(list[0].id, created.key, 'under the original id');
    eq(list[0].text, 'second words', 'with the new text');
    eq(list[0].subject, 'v2', 'and the new subject');
    eq(list[0].tags.join(), 'a', 'what was not changed is kept');
    eq(list[0].tipId, updated.key, 'and points to its latest version');
    eq(list[0].opinions.interesting, 1, 'opinions given before the change still count');
    eq((await blogs.getBlogById(updated.key)).id, created.key, 'opening the latest version opens the blog');
    await blogs.updateBlog(created.key, { tags: ['b', 'c'], allowComments: false });
    const again = await blogs.getBlogById(created.key);
    eq(again.tags.join(), 'b,c', 'the tags can be changed');
    notOk(again.allowComments, 'and comments can be closed');
    eq(again.text, 'second words', 'without touching the text');
    await blogs.updateBlog(created.key, { tags: [], allowComments: true });
    const open = await blogs.getBlogById(created.key);
    eq(open.tags.length, 0, 'tags can be removed altogether');
    ok(open.allowComments, 'and comments reopened');
    B.setActor();
    let threw = false;
    try { await B.use('blogs').updateBlog(created.key, { text: 'hijack' }); } catch (_) { threw = true; }
    ok(threw, 'nobody else can change it');
    A.setActor();
    await blogs.deleteBlogById(created.key);
    eq((await blogs.listAll('ALL')).length, 0, 'deleting an edited blog removes it');
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


describe('blogs: preview before publishing', (t) => {
  t('the form offers a preview that does not publish, and a separate publish', async () => {
    const { blogView } = require('../../../src/views/blog_view');
    const form = String(await blogView([], 'CREATE', {}));
    ok(form.includes('formaction="/blogs/preview"'), 'preview goes to its own route');
    ok(form.includes('action="/blogs/create"'), 'publishing goes to create');
  });

  t('a preview shows the draft rendered and keeps it in the form', async () => {
    const { blogView } = require('../../../src/views/blog_view');
    const draft = { subject: 'my subject', text: 'a **bold** body', allowComments: false };
    const html = String(await blogView([], 'CREATE', { draft }));
    ok(html.includes('my subject'), 'the subject is shown');
    ok(html.includes('<strong>bold</strong>'), 'the body is rendered, not raw markdown');
    ok(html.includes('value="my subject"'), 'and the subject stays in the field');
    ok(html.includes('a **bold** body'), 'and the body stays in the textarea');
    notOk(/name="allowComments" value="1"[^>]*checked/.test(html), 'the comment choice is kept as well');
  });
});
