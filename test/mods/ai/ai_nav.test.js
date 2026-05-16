const fs = require('fs');
const path = require('path');
const { eq, ok } = require('../../helpers/assert');

const CACHE_FILE = path.join(__dirname, '..', '..', '..', 'src', 'AI', 'embeddings', 'routes_cache.json');
const removeCache = () => { try { if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE); } catch (_) {} };
removeCache();
process.on('exit', removeCache);
const routesIndexPath = require.resolve('../../../src/AI/routes_index');
delete require.cache[routesIndexPath];
const routesIndex = require('../../../src/AI/routes_index');

const fakeEmbed = async (text) => {
  const t = String(text || '').toLowerCase();
  return [
    /(market|shop|buy|sell|product|store|vendor)/.test(t) ? 1 : 0,
    /(tribe|group|community|room|sub-tribe)/.test(t) ? 1 : 0,
    /(chat|message|messaging|pm|encrypted)/.test(t) ? 1 : 0,
    /(transfer|payment|wallet|money|eco|banking)/.test(t) ? 1 : 0,
    /(video|audio|image|document|file)/.test(t) ? 1 : 0
  ];
};

describe('ai: routes_index.resolveTopK', (t) => {
  t('returns an array sorted by descending score, capped at K', async () => {
    const q = await fakeEmbed('I want to buy something at a shop');
    const top = await routesIndex.resolveTopK(q, { embed: fakeEmbed, threshold: 0 }, 3);
    ok(Array.isArray(top));
    ok(top.length <= 3);
    ok(top.length > 0);
    for (let i = 1; i < top.length; i++) ok(top[i].score <= top[i - 1].score, 'descending');
  });

  t('items expose path, score, description, mod', async () => {
    const q = await fakeEmbed('buy shop product');
    const top = await routesIndex.resolveTopK(q, { embed: fakeEmbed, threshold: 0 }, 5);
    ok(top.length > 0);
    const it = top[0];
    ok(typeof it.path === 'string' && it.path.startsWith('/'));
    ok(typeof it.score === 'number');
    ok(typeof it.description === 'string' && it.description.length > 0);
    ok('mod' in it, 'mod key present (may be null)');
  });

  t('isModuleEnabled filter excludes disabled mods', async () => {
    const q = await fakeEmbed('shop store vendor');
    const allEnabled = await routesIndex.resolveTopK(q, { embed: fakeEmbed, threshold: 0, isModuleEnabled: () => true }, 60);
    ok(allEnabled.find(r => r.path === '/shops'));
    const shopsDisabled = await routesIndex.resolveTopK(q, { embed: fakeEmbed, threshold: 0, isModuleEnabled: (m) => m !== 'shopMod' }, 60);
    ok(!shopsDisabled.find(r => r.path === '/shops'));
  });

  t('threshold filters out low scores', async () => {
    const q = await fakeEmbed('zzz nonsensical query no matches');
    const top = await routesIndex.resolveTopK(q, { embed: fakeEmbed, threshold: 0.5 }, 10);
    for (const r of top) ok(r.score >= 0.5, `score ${r.score} >= 0.5`);
  });

  t('K=0 returns at least 1 entry (lower-bounded to 1)', async () => {
    const q = await fakeEmbed('shop');
    const top = await routesIndex.resolveTopK(q, { embed: fakeEmbed, threshold: 0 }, 0);
    ok(top.length <= 1);
  });

  t('shop-related query ranks /shops or /market near the top', async () => {
    const q = await fakeEmbed('I want to buy a product');
    const top = await routesIndex.resolveTopK(q, { embed: fakeEmbed, threshold: 0 }, 5);
    const paths = top.map(r => r.path);
    ok(paths.includes('/shops') || paths.includes('/market'), `expected /shops or /market in top 5, got ${paths.join(',')}`);
  });
});

describe('ai: routes_index.resolveBest backward compat', (t) => {
  t('returns single best entry above threshold', async () => {
    const q = await fakeEmbed('encrypted chat room');
    const best = await routesIndex.resolveBest(q, { embed: fakeEmbed, threshold: 0 });
    ok(best);
    ok(typeof best.path === 'string' && best.path.startsWith('/'));
    ok(typeof best.score === 'number');
  });

  t('returns null when no entry meets threshold', async () => {
    const q = await fakeEmbed('zzz nonsensical query no matches');
    const best = await routesIndex.resolveBest(q, { embed: fakeEmbed, threshold: 0.99 });
    eq(best, null);
  });
});
