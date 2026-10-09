const { ok, eq, notOk, arrEq } = require('../../helpers/assert');

const range = (n) => Array.from({ length: n }, (_, i) => i);
const scoped = (path, query, fn) => require('../../../src/models/typed_log').requestScope.run({ capped: false, limit: 0, path, query }, fn);
const links = (html) => (String(html).match(/href="[^"]*"/g) || []).map(h => h.slice(6, -1).replace(/&amp;/g, '&'));
const pageLinks = (html) => links(html).filter(h => /[?&](page|perPage)=/.test(h));

describe('pagination: slicing a list', (t) => {
  t('the default page holds the default size and every offered size can be chosen', () => {
    const { slicePage, LIST_PAGE_SIZE, LIST_PAGE_SIZES } = require('../../../src/views/main_views');
    const list = range(237);
    const first = slicePage(list, 1, String(LIST_PAGE_SIZE));
    eq(first.items.length, LIST_PAGE_SIZE, 'the first page is capped at the default size');
    eq(first.pages, Math.ceil(237 / LIST_PAGE_SIZE));
    eq(first.total, 237);
    for (const s of LIST_PAGE_SIZES) {
      const r = slicePage(list, 1, s);
      eq(r.items.length, s === 'all' ? 237 : Math.min(237, Number(s)), `size ${s}`);
      eq(r.pages, s === 'all' ? 1 : Math.ceil(237 / Number(s)), `pages for ${s}`);
    }
    const last = slicePage(list, 99, '10');
    eq(last.page, 24, 'an out-of-range page lands on the last one');
    arrEq(last.items, list.slice(230), 'the last page holds the remainder');
    eq(slicePage(list, 'x', '10').page, 1, 'a bogus page lands on the first one');
    eq(slicePage([], 3, '10').pages, 1, 'an empty list is a single empty page');
  });

  t('paged() takes the page and the size from the request being served', async () => {
    const { paged, LIST_PAGE_SIZE } = require('../../../src/views/main_views');
    const list = range(120);
    arrEq(await scoped('/images', 'filter=all&page=2&perPage=10', () => paged(list)), list.slice(10, 20), 'page two of ten');
    eq((await scoped('/images', 'perPage=999', () => paged(list))).length, LIST_PAGE_SIZE, 'an unknown size falls back to the default');
    eq((await scoped('/images', 'perPage=ALL', () => paged(list))).length, 120, 'all shows everything');
    eq(paged(list).length, LIST_PAGE_SIZE, 'outside a request the first page is served');
  });
});

describe('pagination: moving through a module list', (t) => {
  const tags = (n) => range(n).map(i => ({ name: `tag${String(i).padStart(3, '0')}`, count: n - i, mine: 0, lastTs: i }));
  const render = (n, query) => scoped('/tags', query, async () => String(await require('../../../src/views/tags_view').tagsView(tags(n), 'top', '')));
  const shown = (html) => links(html).filter(h => /^\/search\?query=%23tag\d{3}$/.test(h)).length;

  t('a list that fits in one page offers no pagination', async () => {
    const html = await render(30, 'filter=top');
    eq(shown(html), 30, 'everything is listed');
    eq(pageLinks(html).length, 0, 'no page or size links');
    eq(pageLinks(await render(8, 'filter=top&perPage=10')).length, 0, 'nothing to choose when the list is shorter than the smallest size');
  });

  t('a longer list is served one page at a time and the links keep the filter', async () => {
    const { LIST_PAGE_SIZE } = require('../../../src/views/main_views');
    const first = await render(120, 'filter=top');
    eq(shown(first), LIST_PAGE_SIZE, 'the first page holds the default size');
    const nav = pageLinks(first);
    ok(nav.includes('/tags?filter=top&page=2'), 'next keeps the filter');
    notOk(nav.some(h => /[?&]page=1(&|$)/.test(h)), 'there is no previous page on the first one');
    for (const s of ['10', '50', '100', 'all']) ok(nav.includes(`/tags?filter=top&perPage=${s}`), `the size ${s} is offered and starts from the first page`);
    const third = await render(120, 'filter=top&page=3');
    eq(shown(third), 120 - 2 * LIST_PAGE_SIZE, 'the last page holds the remainder');
    ok(pageLinks(third).includes('/tags?filter=top&page=2'), 'previous goes back');
    notOk(pageLinks(third).some(h => /[?&]page=4/.test(h)), 'there is no page after the last');
  });

  t('the chosen size is applied and travels with previous and next, without being stored', async () => {
    const second = await render(120, 'filter=top&perPage=10&page=2');
    eq(shown(second), 10, 'ten per page');
    const nav = pageLinks(second);
    ok(nav.includes('/tags?filter=top&perPage=10'), 'previous keeps the size');
    ok(nav.includes('/tags?filter=top&perPage=10&page=3'), 'next keeps the size');
    eq(shown(await render(120, 'filter=top&perPage=all')), 120, 'all lists everything');
    ok(pageLinks(await render(30, 'filter=top&perPage=10')).includes('/tags?filter=top&perPage=50'), 'a short list still lets the size go back once one was chosen');
    eq(shown(await render(120, 'filter=top')), 50, 'a new request without the size is back to the default');
  });
});

describe('pagination: the public clearnet pages', (t) => {
  const A = '@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=.ed25519';
  const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  const cards = (html) => (String(html).match(/class="cn-hub-card"/g) || []).length;

  t('the hub shows one page at a time, keeps the filters in the page links and clamps out-of-range pages', async () => {
    const { clearnetHubView, LIST_PAGE_SIZE } = require('../../../src/views/main_views');
    const total = 2 * LIST_PAGE_SIZE + 7;
    const items = { jobs: many(total, i => ({ id: `%j${i}.sha256`, title: `Job ${i}`, snippet: 'work', ts: i, author: A })) };
    const first = String(await clearnetHubView({ authors: [], items }));
    eq(cards(first), LIST_PAGE_SIZE, 'the first page is capped');
    ok(pageLinks(first).includes('/c?page=2') && !pageLinks(first).some(h => /[?&]page=1(&|$)/.test(h)), 'page one offers next but no previous');
    const third = String(await clearnetHubView({ authors: [], items, page: 3 }));
    eq(cards(third), 7, 'the last page holds the remainder');
    ok(pageLinks(third).includes('/c?page=2') && !pageLinks(third).some(h => /[?&]page=4/.test(h)), 'the last page offers previous but no next');
    eq(cards(String(await clearnetHubView({ authors: [], items, page: 99 }))), 7, 'an out-of-range page lands on the last one');
    eq(cards(String(await clearnetHubView({ authors: [], items, page: 'x' }))), LIST_PAGE_SIZE, 'a bogus page lands on the first one');
    ok(pageLinks(String(await clearnetHubView({ authors: [], items, filterType: 'jobs', query: 'work' }))).includes('/c?type=jobs&q=work&page=2'), 'the page links keep the type and the query');
    eq(pageLinks(String(await clearnetHubView({ authors: [], items: { jobs: items.jobs.slice(0, 5) } }))).length, 0, 'a short list has no pager');
  });

  t('the hub applies the chosen size and offers the same sizes as the app', async () => {
    const { clearnetHubView, LIST_PAGE_SIZE } = require('../../../src/views/main_views');
    const items = { jobs: many(2 * LIST_PAGE_SIZE + 7, i => ({ id: `%j${i}.sha256`, title: `Job ${i}`, snippet: 'work', ts: i, author: A })) };
    const html = await scoped('/c', 'perPage=10&page=2', async () => String(await clearnetHubView({ authors: [], items, page: 2 })));
    eq(cards(html), 10, 'ten per page');
    const nav = pageLinks(html);
    ok(nav.includes('/c?perPage=10') && nav.includes('/c?perPage=10&page=3'), 'previous and next keep the size');
    for (const s of ['10', '50', '100', 'all']) ok(nav.includes(`/c?perPage=${s}`), `the size ${s} is offered`);
    const all = await scoped('/c', 'perPage=all', async () => String(await clearnetHubView({ authors: [], items })));
    eq(cards(all), 2 * LIST_PAGE_SIZE + 7, 'all lists everything');
  });

  t('the inhabitant page and the public tribe page paginate the same way', async () => {
    const { clearnetInhabitantView, LIST_PAGE_SIZE } = require('../../../src/views/main_views');
    const { clearnetTribeView } = require('../../../src/views/tribes_view');
    const total = 2 * LIST_PAGE_SIZE + 7;
    const items = { events: many(total, i => ({ id: `%e${i}.sha256`, title: `Event ${i}`, snippet: 'x', ts: i, author: A })) };
    eq(cards(String(await clearnetInhabitantView({ feedId: A, name: 'Alice', items }))), LIST_PAGE_SIZE);
    const third = String(await clearnetInhabitantView({ feedId: A, name: 'Alice', items, filterType: 'events', page: 3 }));
    eq(cards(third), 7);
    ok(pageLinks(third).includes(`/c/inhabitant/${encodeURIComponent(A)}?type=events&page=2`), 'the inhabitant page links keep the type');
    const tribeItems = many(total, i => ({ id: `%t${i}.sha256`, contentType: 'forum', title: `Topic ${i}`, description: 'x', author: A, createdAt: i }));
    const tribeCards = (html) => (String(html).match(/class="cn-tribe-item"/g) || []).length;
    eq(tribeCards(String(await clearnetTribeView({ tribe: { title: 'Seeds' }, items: tribeItems, slug: 'seeds-abc' }))), LIST_PAGE_SIZE);
    const tribeThird = String(await clearnetTribeView({ tribe: { title: 'Seeds' }, items: tribeItems, slug: 'seeds-abc', page: 3 }));
    eq(tribeCards(tribeThird), 7);
    ok(pageLinks(tribeThird).includes('/c/tribe/seeds-abc?page=2'), 'the tribe page links point back to the same tribe');
  });
});
