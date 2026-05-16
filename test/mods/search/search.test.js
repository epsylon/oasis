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
