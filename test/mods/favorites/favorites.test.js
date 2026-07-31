const fs = require('fs');
const path = require('path');
const { eq, ok, notOk, throwsAsync } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');
const mediaFavorites = require('../../../src/backend/media-favorites');

const FILE = path.join(__dirname, '../../../src/configs/media-favorites.json');

const withCleanStore = async (fn) => {
  const backup = fs.existsSync(FILE) ? fs.readFileSync(FILE) : null;
  try {
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
      const bm = await A.use('bookmarks').createBookmark('https://fav.test/one', [], 'one', '', '');
      await mediaFavorites.addFavorite('bookmarks', bm.key);
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
      const one = await A.use('bookmarks').createBookmark('https://fav.test/a', [], 'a', '', '');
      const two = await A.use('bookmarks').createBookmark('https://fav.test/b', [], 'b', '', '');
      await mediaFavorites.addFavorite('bookmarks', one.key);
      await mediaFavorites.addFavorite('bookmarks', two.key);
      const { items, counts } = await A.use('favorites').listAll({});
      eq(counts.bookmarks, 2, 'two bookmarks favorited');
      eq(counts.all, 2, 'overall count aggregates every kind');
      ok(items.find(i => i.favId === one.key) && items.find(i => i.favId === two.key), 'both present');
    });
  });

  t('recent filter returns a flat hydrated list', async () => {
    await withCleanStore(async () => {
      const net = makeNetwork(); const A = makePeer(net); A.setActor();
      const one = await A.use('bookmarks').createBookmark('https://fav.test/r1', [], 'r1', '', '');
      const two = await A.use('bookmarks').createBookmark('https://fav.test/r2', [], 'r2', '', '');
      await mediaFavorites.addFavorite('bookmarks', one.key);
      await mediaFavorites.addFavorite('bookmarks', two.key);
      const { items } = await A.use('favorites').listAll({ filter: 'recent' });
      ok(Array.isArray(items) && items.length === 2, 'flat list of two');
    });
  });

  t('removeFavorite drops an item from the list', async () => {
    await withCleanStore(async () => {
      const net = makeNetwork(); const A = makePeer(net); A.setActor();
      const bm = await A.use('bookmarks').createBookmark('https://fav.test/rm', [], 'rm', '', '');
      await mediaFavorites.addFavorite('bookmarks', bm.key);
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
      const bm = await A.use('bookmarks').createBookmark('https://fav.test/nope', [], 'nope', '', '');
      const { items } = await A.use('favorites').listAll({ filter: 'bookmarks' });
      notOk(items.find(i => i.favId === bm.key), 'unfavorited bookmark absent');
    });
  });

  t('removeFavorite with an unknown kind is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await throwsAsync(() => A.use('favorites').removeFavorite('notakind', '%x.sha256'), /Invalid favorites kind/);
  });
});
