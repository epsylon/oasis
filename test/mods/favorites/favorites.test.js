const fs = require('fs');
const path = require('path');
const { eq, ok, notOk, throwsAsync } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');
const contentFavorites = require('../../../src/backend/content_favorites');

const FILE = contentFavorites.storePath();

const withCleanStore = async (fn) => {
  const backup = fs.existsSync(FILE) ? fs.readFileSync(FILE) : null;
  try {
    fs.writeFileSync(FILE, '{}');
    return await fn();
  } finally {
    if (backup === null) { try { fs.unlinkSync(FILE); } catch (_) {} }
    else fs.writeFileSync(FILE, backup);
  }
};

describe('favorites: list', (t) => {
  t('listAll returns favorites map', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const list = await A.use('favorites').listAll({ kind: 'audios' });
    ok(list);
  });

  t('a favorited bookmark is hydrated into the kind-filtered list', async () => {
    await withCleanStore(async () => {
      const net = makeNetwork(); const A = makePeer(net); A.setActor();
      const bm = await A.use('bookmarks').createBookmark('https://fav.test/one', [], 'one', '');
      await contentFavorites.addFavorite('bookmarks', bm.key);
      const { items, counts } = await A.use('favorites').listAll({ filter: 'bookmarks' });
      const item = items.find(i => i.favId === bm.key);
      ok(item, 'favorited bookmark hydrated');
      eq(item.kind, 'bookmarks', 'tagged with its kind');
      ok(item.viewHref.includes(encodeURIComponent(bm.key)), 'view link points at the item');
      eq(counts.bookmarks, 1, 'bookmark count is one');
    });
  });

  t('the default (all) list groups favorites and reports an overall count', async () => {
    await withCleanStore(async () => {
      const net = makeNetwork(); const A = makePeer(net); A.setActor();
      const one = await A.use('bookmarks').createBookmark('https://fav.test/a', [], 'a', '');
      const two = await A.use('bookmarks').createBookmark('https://fav.test/b', [], 'b', '');
      await contentFavorites.addFavorite('bookmarks', one.key);
      await contentFavorites.addFavorite('bookmarks', two.key);
      const { items, counts } = await A.use('favorites').listAll({});
      eq(counts.bookmarks, 2, 'two bookmarks favorited');
      eq(counts.all, 2, 'overall count aggregates every kind');
      ok(items.find(i => i.favId === one.key) && items.find(i => i.favId === two.key), 'both present');
    });
  });

  t('recent filter returns a flat hydrated list', async () => {
    await withCleanStore(async () => {
      const net = makeNetwork(); const A = makePeer(net); A.setActor();
      const one = await A.use('bookmarks').createBookmark('https://fav.test/r1', [], 'r1', '');
      const two = await A.use('bookmarks').createBookmark('https://fav.test/r2', [], 'r2', '');
      await contentFavorites.addFavorite('bookmarks', one.key);
      await contentFavorites.addFavorite('bookmarks', two.key);
      const { items } = await A.use('favorites').listAll({ filter: 'recent' });
      ok(Array.isArray(items) && items.length === 2, 'flat list of two');
    });
  });

  t('removeFavorite drops an item from the list', async () => {
    await withCleanStore(async () => {
      const net = makeNetwork(); const A = makePeer(net); A.setActor();
      const bm = await A.use('bookmarks').createBookmark('https://fav.test/rm', [], 'rm', '');
      await contentFavorites.addFavorite('bookmarks', bm.key);
      const before = await A.use('favorites').listAll({ filter: 'bookmarks' });
      ok(before.items.find(i => i.favId === bm.key), 'present before removal');
      await A.use('favorites').removeFavorite('bookmarks', bm.key);
      const after = await A.use('favorites').listAll({ filter: 'bookmarks' });
      notOk(after.items.find(i => i.favId === bm.key), 'gone after removal');
    });
  });

  t('content that was never favorited does not appear', async () => {
    await withCleanStore(async () => {
      const net = makeNetwork(); const A = makePeer(net); A.setActor();
      const bm = await A.use('bookmarks').createBookmark('https://fav.test/nope', [], 'nope', '');
      const { items } = await A.use('favorites').listAll({ filter: 'bookmarks' });
      notOk(items.find(i => i.favId === bm.key), 'unfavorited bookmark absent');
    });
  });

  t('a favorited event is hydrated like any media kind', async () => {
    await withCleanStore(async () => {
      const net = makeNetwork(); const A = makePeer(net); A.setActor();
      const ev = await A.use('events').createEvent('Pinned meetup', 'desc', '2030-12-01T20:00:00Z', 'plaza', 0, '', [], [], 'public', '');
      const evId = ev.key || ev.id || ev;
      await contentFavorites.addFavorite('events', evId);
      const { items, counts } = await A.use('favorites').listAll({ filter: 'events' });
      const item = items.find(i => i.favId === evId);
      ok(item, 'favorited event hydrated');
      eq(item.kind, 'events', 'tagged with its kind');
      ok(item.viewHref.startsWith('/events/'), 'view link points at the event page');
      eq(counts.events, 1, 'event count is one');
    });
  });

  t('removeFavorite with an unknown kind is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await throwsAsync(() => A.use('favorites').removeFavorite('notakind', '%x.sha256'), /Invalid favorites kind/);
  });
});

describe('favorites: pinning a transfer', (t) => {
  t('a pinned transfer is stored and listed back', async () => {
    await withCleanStore(async () => {
      const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
      A.setActor();
      const tr = await A.use('transfers').createTransfer(B.keypair.id, 'seed concept', '5', new Date(Date.now() + 86400000).toISOString(), ['demo'], 'ECONOMIC');
      ok(tr && tr.key, 'transfer created');

      await contentFavorites.addFavorite('transfers', tr.key);
      const set = await contentFavorites.getFavoriteSet('transfers');
      ok(set.has(tr.key), 'stored in the favorites file');

      const { items, counts } = await A.use('favorites').listAll({ filter: 'transfers' });
      const item = items.find(i => i.favId === tr.key);
      ok(item, 'the transfer is hydrated into /favorites');
      eq(item.kind, 'transfers', 'tagged with its kind');
      eq(counts.transfers, 1, 'and counted');
    });
  });
});

describe('favorites: every pinnable kind is wired end to end', (t) => {
  const readSrc = (rel) => fs.readFileSync(path.join(__dirname, '../../../src', rel), 'utf8');

  t('a kind offered in the views can be stored, routed and listed back', () => {
    const viewsDir = path.join(__dirname, '../../../src/views');
    const kinds = new Set();
    for (const f of fs.readdirSync(viewsDir).filter(x => x.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(viewsDir, f), 'utf8');
      for (const m of src.matchAll(/favKind:\s*'([^']+)'/g)) kinds.add(m[1]);
    }
    ok(kinds.size > 0, 'the views offer some pinnable kind');

    const backend = readSrc('backend/backend.js');
    const store = readSrc('backend/content_favorites.js');
    const model = readSrc('models/favorites_model.js');
    const resolvers = backend.match(/const contentResolvers = \{([\s\S]*?)\n\};/)[1];
    const modCheck = backend.match(/const contentModCheck = \{([\s\S]*?)\};/)[1];
    const defaults = store.match(/const DEFAULT = \{([\s\S]*?)\n\};/)[1];
    const kindOrder = model.match(/const kindOrder = \[([\s\S]*?)\]/)[1];

    const broken = [];
    for (const k of [...kinds].sort()) {
      const missing = [];
      if (!new RegExp(`^\\s{2}${k}:`, 'm').test(resolvers)) missing.push('resolver');
      if (!new RegExp(`\\b${k}:\\s*'\\w+Mod'`).test(modCheck)) missing.push('modCheck');
      if (!new RegExp(`\\.post\\(["']/${k}/favorites/add`).test(backend)) missing.push('add route');
      if (!new RegExp(`\\.post\\(["']/${k}/favorites/remove`).test(backend)) missing.push('remove route');
      if (!new RegExp(`^\\s{2}${k}:\\s*\\[\\]`, 'm').test(defaults)) missing.push('store kind');
      if (!new RegExp(`^\\s{4}${k}:\\s*\\{`, 'm').test(model)) missing.push('kindConfig');
      if (!new RegExp(`"${k}"`).test(kindOrder)) missing.push('kindOrder');
      if (missing.length) broken.push(`${k} (${missing.join(', ')})`);
    }
    eq(broken.join(' | '), '', 'these kinds can be pinned but never come back');
  });
});
