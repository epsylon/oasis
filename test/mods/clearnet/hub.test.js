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
