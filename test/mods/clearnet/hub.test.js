const { ok, eq } = require('../../helpers/assert');

describe('clearnet: public hub', (t) => {
  t('the hub lists public items of every inhabitant and filters by type and by query', async () => {
    const { clearnetHubView } = require('../../../src/views/main_views');
    const A = '@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=.ed25519';
    const B = '@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb=.ed25519';
    const items = {
      podcasts: [{ id: '%p1.sha256', title: 'Night talks', snippet: 'radio', meta: '2026-09-01', author: A, authorName: 'Alice' }],
      shops: [{ id: '%s1.sha256', title: 'Seeds', snippet: 'organic seeds', meta: 'Valencia', author: B, authorName: 'Bob' }]
    };
    const authors = [{ feedId: A, name: 'Alice', count: 1 }, { feedId: B, name: 'Bob', count: 1 }];
    const all = String(await clearnetHubView({ authors, items }));
    ok(all.includes('/c/podcasts/%25p1.sha256') && all.includes('/c/shops/%25s1.sha256'), 'both items are linked');
    const onlyShops = String(await clearnetHubView({ authors, items, filterType: 'shops' }));
    ok(onlyShops.includes('/c/shops/%25s1.sha256') && !onlyShops.includes('/c/podcasts/%25p1.sha256'), 'the type filter narrows the grid');
    const searched = String(await clearnetHubView({ authors, items, query: 'radio' }));
    ok(searched.includes('/c/podcasts/%25p1.sha256') && !searched.includes('/c/shops/%25s1.sha256'), 'the search narrows the grid');
    const empty = String(await clearnetHubView({ authors: [], items: {} }));
    ok(empty.includes('No public content'), 'an empty network says so');
    eq((all.match(/<form[^>]*method="POST"/g) || []).length, 0, 'the hub is read-only');
  });
});
