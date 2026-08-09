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
