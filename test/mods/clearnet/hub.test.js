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

describe('clearnet: long lists are served in pages', (t) => {
  const A = '@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=.ed25519';
  const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  const cards = (html) => (String(html).match(/class="cn-hub-card"/g) || []).length;
  const pager = (html) => String(html).match(/<div class="cn-pager">[\s\S]*?<\/div>/);

  t('the hub shows one page at a time, keeps the filters in the page links and clamps out-of-range pages', async () => {
    const { clearnetHubView } = require('../../../src/views/main_views');
    const { CLEARNET_PAGE_SIZE } = require('../../../src/views/clearnet_view');
    const items = { jobs: many(250, i => ({ id: `%j${i}.sha256`, title: `Job ${i}`, snippet: 'work', ts: i, author: A })) };
    const first = String(await clearnetHubView({ authors: [], items }));
    eq(cards(first), CLEARNET_PAGE_SIZE, 'the first page is capped');
    const p1 = pager(first);
    ok(p1 && !/page=1\b/.test(p1[0]) && /href="\/c\?page=2"/.test(p1[0]), 'page one offers next but no previous');
    const third = String(await clearnetHubView({ authors: [], items, page: 3 }));
    eq(cards(third), 50, 'the last page holds the remainder');
    const p3 = pager(third);
    ok(p3 && /href="\/c\?page=2"/.test(p3[0]) && !/page=4/.test(p3[0]), 'the last page offers previous but no next');
    eq(cards(String(await clearnetHubView({ authors: [], items, page: 99 }))), 50, 'an out-of-range page lands on the last one');
    eq(cards(String(await clearnetHubView({ authors: [], items, page: 'x' }))), CLEARNET_PAGE_SIZE, 'a bogus page lands on the first one');
    const filtered = String(await clearnetHubView({ authors: [], items, filterType: 'jobs', query: 'work' }));
    ok(/href="\/c\?type=jobs&amp;q=work&amp;page=2"/.test(filtered), 'the page links keep the type and the query');
    ok(!pager(String(await clearnetHubView({ authors: [], items: { jobs: items.jobs.slice(0, 5) } }))), 'a short list has no pager');
  });

  t('the inhabitant page and the public tribe page paginate the same way', async () => {
    const { clearnetInhabitantView } = require('../../../src/views/main_views');
    const { clearnetTribeView } = require('../../../src/views/tribes_view');
    const { CLEARNET_PAGE_SIZE } = require('../../../src/views/clearnet_view');
    const items = { events: many(250, i => ({ id: `%e${i}.sha256`, title: `Event ${i}`, snippet: 'x', ts: i, author: A })) };
    eq(cards(String(await clearnetInhabitantView({ feedId: A, name: 'Alice', items }))), CLEARNET_PAGE_SIZE);
    const third = String(await clearnetInhabitantView({ feedId: A, name: 'Alice', items, filterType: 'events', page: 3 }));
    eq(cards(third), 50);
    ok(new RegExp(`href="/c/inhabitant/${encodeURIComponent(A).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\?type=events&amp;page=2"`).test(third), 'the inhabitant page links keep the type');
    const tribeItems = many(250, i => ({ id: `%t${i}.sha256`, contentType: 'forum', title: `Topic ${i}`, description: 'x', author: A, createdAt: i }));
    const tribeCards = (html) => (String(html).match(/class="cn-tribe-item"/g) || []).length;
    eq(tribeCards(String(await clearnetTribeView({ tribe: { title: 'Seeds' }, items: tribeItems, slug: 'seeds-abc' }))), CLEARNET_PAGE_SIZE);
    const tribeThird = String(await clearnetTribeView({ tribe: { title: 'Seeds' }, items: tribeItems, slug: 'seeds-abc', page: 3 }));
    eq(tribeCards(tribeThird), 50);
    ok(/href="\/c\/tribe\/seeds-abc\?page=2"/.test(tribeThird), 'the tribe page links point back to the same tribe');
  });
});
