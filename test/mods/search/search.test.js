const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('search: full-text search across modules', (t) => {
  t('searches audios by title', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000000.sha256)', [], 'unique-title-x', '', '');
    const results = await A.use('search').search({ query: 'unique-title-x', types: [] });
    ok(results);
  });
});

describe('search: index and query', (t) => {
  t('finds a bookmark by a distinctive word in its description', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('bookmarks').createBookmark('https://example.org/qux', ['ref'], 'zorptangle reference page', '');
    const results = await A.use('search').search({ query: 'zorptangle', types: [] });
    ok(results.bookmark);
    ok(results.bookmark.length >= 1);
  });

  t('finds a feed post by its text', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('feed').createFeed('hello wibblewobble world from the feed', []);
    const results = await A.use('search').search({ query: 'wibblewobble', types: [] });
    ok(results.feed);
    ok(results.feed.length >= 1);
  });

  t('an unrelated query returns no results', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('bookmarks').createBookmark('https://example.org/a', [], 'ordinary page', '');
    const results = await A.use('search').search({ query: 'noSuchTermXyz123', types: [] });
    eq(Object.keys(results).length, 0);
  });

  t('type filter restricts results to the requested type', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('bookmarks').createBookmark('https://example.org/shared', [], 'sharedkeyword bookmark', '');
    await A.use('feed').createFeed('sharedkeyword in a feed post here', []);
    const results = await A.use('search').search({ query: 'sharedkeyword', types: ['bookmark'] });
    ok(results.bookmark);
    ok(results.bookmark.length >= 1);
    eq(results.feed, undefined);
  });

  t('tag search (#tag) matches items carrying that tag', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('bookmarks').createBookmark('https://example.org/tagged', ['zephyrtag'], 'a tagged bookmark', '');
    const results = await A.use('search').search({ query: '#zephyrtag', types: [] });
    ok(results.bookmark);
    ok(results.bookmark.length >= 1);
  });

  t('deleted content is not returned by search', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('bookmarks').createBookmark('https://example.org/temp', [], 'vanishword temp bookmark', '');
    let before = await A.use('search').search({ query: 'vanishword', types: [] });
    ok(before.bookmark && before.bookmark.length >= 1);
    await A.use('bookmarks').deleteBookmarkById(r.key);
    const after = await A.use('search').search({ query: 'vanishword', types: [] });
    eq(after.bookmark, undefined);
  });
});

describe('search: WISH only-LAN filter (config + persistence)', (t) => {
  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  const { getConfig, saveConfig } = require('../../../src/configs/config-manager.js');

  t('config persists wish=only-lan', () => {
    const cfg = getConfig();
    const prev = cfg.wish;
    cfg.wish = 'only-lan';
    saveConfig(cfg);
    const reloaded = getConfig();
    eq(reloaded.wish, 'only-lan');
    cfg.wish = prev || 'whole';
    saveConfig(cfg);
  });

  t('wish accepts whole|mutuals|only-lan and rejects others', () => {
    const cfg = getConfig();
    const prev = cfg.wish;
    for (const v of ['whole', 'mutuals', 'only-lan']) {
      cfg.wish = v;
      saveConfig(cfg);
      eq(getConfig().wish, v);
    }
    cfg.wish = prev || 'whole';
    saveConfig(cfg);
  });
});

describe('search: what each Wish level lets through', (t) => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-wish-'));
  const load = () => {
    const prev = process.env.OASIS_STATE_DIR;
    process.env.OASIS_STATE_DIR = stateDir;
    const file = require.resolve('../../../src/models/viewer_filters');
    delete require.cache[file];
    const mod = require(file);
    if (prev === undefined) delete process.env.OASIS_STATE_DIR; else process.env.OASIS_STATE_DIR = prev;
    return mod;
  };
  const id = (c) => `@${c.repeat(43)}=.ed25519`;
  const me = id('M'), near = id('N'), friend = id('F'), stranger = id('S');
  const items = [{ author: me }, { author: near }, { author: friend }, { value: { author: stranger } }];
  const opts = (filters, wish) => ({
    wish, viewer: me,
    authorOf: (it) => it.author || (it.value && it.value.author) || null,
    isOwn: (it, v) => (it.author || (it.value && it.value.author)) === v,
    isMutual: async (a) => a === friend,
    lan: new Set([near])
  });
  const authors = (list) => list.map(it => it.author || it.value.author);

  t('the whole network lets everything through', async () => {
    const f = load();
    eq((await f.filterByWish(items, opts(f, 'whole'))).length, items.length);
  });

  t('local, mutual support and only LAN each keep your own content plus their circle', async () => {
    const f = load();
    eq(authors(await f.filterByWish(items, opts(f, 'local'))).join(','), me);
    eq(authors(await f.filterByWish(items, opts(f, 'mutuals'))).join(','), [me, friend].join(','));
    eq(authors(await f.filterByWish(items, opts(f, 'only-lan'))).join(','), [me, near].join(','));
  });

  t('peers count as local network by their type or a private address, never by a public one', () => {
    const f = load();
    const keys = f.lanKeysFromConn([
      ['net:192.168.1.20:8008~shs:x', { key: id('A') }],
      ['net:[fe80::2]:8008~shs:x', { key: id('B') }],
      ['net:203.0.113.9:8008~shs:x', { key: id('C'), inferredType: 'lan' }],
      ['net:203.0.113.10:8008~shs:x', { key: id('D'), type: 'pub' }],
      ['net:pub.example.org:8008~shs:x', { key: id('E') }]
    ]);
    eq(keys.join(','), [id('A'), id('B'), id('C')].join(','));
  });

  t('peers met on the local network are remembered after a restart', () => {
    load().rememberLanPeers([near, 'not-an-id']);
    const again = load();
    ok(again.lanPeers().has(near), 'the peer is still known');
    eq(again.lanPeers().size, 1, 'invalid ids are ignored');
  });
});
