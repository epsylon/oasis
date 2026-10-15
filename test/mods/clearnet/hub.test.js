const { ok, eq } = require('../../helpers/assert');

describe('clearnet: public hub', (t) => {
  t('the hub lists public items of every inhabitant and filters by type and by query', async () => {
    const { clearnetHubView, clearnetSlugFor } = require('../../../src/views/main_views');
    const A = '@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=.ed25519';
    const B = '@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb=.ed25519';
    const items = {
      podcasts: [{ id: '%p1.sha256', title: 'Night talks', snippet: 'radio', meta: '2026-09-01', author: A, authorName: 'Alice' }],
      shops: [{ id: '%s1.sha256', title: 'Seeds', snippet: 'organic seeds', meta: 'Valencia', author: B, authorName: 'Bob' }]
    };
    const authors = [{ feedId: A, name: 'Alice', count: 1 }, { feedId: B, name: 'Bob', count: 1 }];
    const podcastHref = `/c/podcasts/${clearnetSlugFor('Night talks', '%p1.sha256')}`;
    const shopHref = `/c/shops/${clearnetSlugFor('Seeds', '%s1.sha256')}`;
    ok(/^\/c\/podcasts\/night-talks-[a-z0-9]+$/.test(podcastHref), 'the link is a readable slug, not a hash');
    const all = String(await clearnetHubView({ authors, items }));
    ok(all.includes(podcastHref) && all.includes(shopHref), 'both items are linked');
    const onlyShops = String(await clearnetHubView({ authors, items, filterType: 'shops' }));
    ok(onlyShops.includes(shopHref) && !onlyShops.includes(podcastHref), 'the type filter narrows the grid');
    const searched = String(await clearnetHubView({ authors, items, query: 'radio' }));
    ok(searched.includes(podcastHref) && !searched.includes(shopHref), 'the search narrows the grid');
    const empty = String(await clearnetHubView({ authors: [], items: {} }));
    ok(empty.includes('No public content'), 'an empty network says so');
    eq((all.match(/<form[^>]*method="POST"/g) || []).length, 0, 'the hub is read-only');
  });
});

describe('clearnet: two items with the same title never share a public link', (t) => {
  t('every module gets a title slug plus a unique hash, wikis included', async () => {
    const { clearnetHubView, clearnetSlugFor, clearnetItemHref } = require('../../../src/views/main_views');
    const A = '@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=.ed25519';
    const B = '@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb=.ed25519';
    const items = {
      wiki: [
        { id: '%w1abcdef.sha256', slug: 'solar-punk', title: 'Solar punk', snippet: 'a', author: A, authorName: 'Alice' },
        { id: '%w2ghijkl.sha256', slug: 'solar-punk', title: 'Solar punk', snippet: 'b', author: B, authorName: 'Bob' }
      ],
      events: [
        { id: '%e1mnopqr.sha256', title: 'Assembly', snippet: 'a', author: A },
        { id: '%e2stuvwx.sha256', title: 'Assembly', snippet: 'b', author: B }
      ]
    };
    const html = String(await clearnetHubView({ authors: [], items }));
    const links = html.match(/href="\/c\/(?:wiki|events)\/[^"]+"/g) || [];
    eq(new Set(links).size, 4, 'four distinct links for four items');
    ok(!links.some(l => l === 'href="/c/wiki/solar-punk"'), 'the bare title slug is never used, not even when the wiki has one');
    ok(links.every(l => /-[a-z0-9]{8}"$/.test(l)), 'every link ends with the short hash of the item');
    eq(clearnetItemHref('events', 'Assembly', '%e1mnopqr.sha256'), `/c/events/${clearnetSlugFor('Assembly', '%e1mnopqr.sha256')}`, 'the app chips build the very same link');
    ok(clearnetSlugFor('Assembly', '%e1mnopqr.sha256') !== clearnetSlugFor('Assembly', '%e2stuvwx.sha256'));
  });
});

describe('clearnet: a tribe page can be narrowed by kind and by author', (t) => {
  t('the kind and author filters combine and keep each other in their links', async () => {
    const { clearnetTribeView } = require('../../../src/views/tribes_view');
    const A = '@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=.ed25519';
    const B = '@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb=.ed25519';
    const items = [
      { id: '%f1.sha256', contentType: 'forum', title: 'Thread by Alice', author: A },
      { id: '%f2.sha256', contentType: 'forum', title: 'Thread by Bob', author: B },
      { id: '%e1.sha256', contentType: 'event', title: 'Picnic by Bob', author: B },
      { id: '%b1.sha256', contentType: 'blog', title: 'Blog by Alice', description: 'first lines', author: A, href: '/c/blog/blog-by-alice-b1' }
    ];
    const names = { [A]: 'Alice', [B]: 'Bob' };
    const render = (opts) => clearnetTribeView({ tribe: { title: 'Seeds' }, items, names, slug: 'seeds-abc', ...opts });
    const all = String(await render({}));
    ok(all.includes('Thread by Alice') && all.includes('Picnic by Bob'), 'everything is listed by default');
    ok(all.includes('href="/c/tribe/seeds-abc?type=forum"') && all.includes('href="/c/tribe/seeds-abc?type=blog"'), 'kinds are offered as links, blogs of the members among them');
    ok(all.includes('<a href="/c/blog/blog-by-alice-b1">Blog by Alice</a>'), 'a blog links to its own public page');
    const blogs = String(await render({ filterType: 'blog' }));
    ok(blogs.includes('Blog by Alice') && !blogs.includes('Thread by Alice'), 'the blog filter keeps only blogs');
    ok(all.includes(`?author=${encodeURIComponent(B)}`), 'authors are offered as links');
    const forum = String(await render({ filterType: 'forum' }));
    ok(forum.includes('Thread by Alice') && forum.includes('Thread by Bob') && !forum.includes('Picnic by Bob'), 'the kind filter keeps only that kind');
    ok(forum.includes('?type=forum&amp;author='), 'author links keep the chosen kind');
    const bob = String(await render({ filterAuthor: B }));
    ok(!bob.includes('Thread by Alice') && !bob.includes('Blog by Alice') && bob.includes('Thread by Bob') && bob.includes('Picnic by Bob'), 'the author filter keeps only that author');
    const bobForum = String(await render({ filterType: 'forum', filterAuthor: B }));
    ok(!bobForum.includes('Thread by Alice') && bobForum.includes('Thread by Bob') && !bobForum.includes('Picnic by Bob'), 'both filters combine');
    eq((all.match(/<form[^>]*method="POST"/g) || []).length, 0, 'the page stays read-only');
  });
});
