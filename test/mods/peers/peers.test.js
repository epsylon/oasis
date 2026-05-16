const { eq, ok } = require('../../helpers/assert');

const mainViewsPath = require.resolve('../../../src/views/main_views');
const peersViewPath = require.resolve('../../../src/views/peers_view');

describe('peers: view module loads cleanly', (t) => {
  t('peers_view requires without throwing', () => {
    delete require.cache[peersViewPath];
    const mod = require('../../../src/views/peers_view');
    ok(typeof mod.peersView === 'function', 'exports peersView');
  });

  t('main_views exports template + i18n needed by peersView', () => {
    delete require.cache[mainViewsPath];
    const mod = require('../../../src/views/main_views');
    ok(typeof mod.template === 'function');
    ok(mod.i18n && typeof mod.i18n === 'object');
  });
});

describe('peers: i18n keys present for source chips and LAN status', (t) => {
  const i18nBase = require('../../../src/client/assets/translations/i18n');
  const langs = ['en', 'es', 'de', 'fr', 'it', 'pt', 'ru', 'zh', 'ar', 'hi', 'eu'];
  const required = [
    'lanBroadcastLabel',
    'lanBroadcastActive',
    'lanBroadcastDisabled',
    'peerSourceRpc',
    'peerSourceGossip',
    'peerSourceEbt',
    'peerSourceRecent',
    'peerSourceLan'
  ];
  for (const lang of langs) {
    t(`${lang} has all required keys`, () => {
      const dict = i18nBase[lang];
      ok(dict, `dict for ${lang} loaded`);
      for (const k of required) ok(typeof dict[k] === 'string' && dict[k].length > 0, `${lang}.${k}`);
    });
  }
});

describe('peers: deduplication invariant', (t) => {
  const dedup = (peers) => {
    const seen = new Set();
    return peers.filter(p => {
      const key = p[1]?.key;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  t('removes duplicate keys', () => {
    const dup = [
      ['addr1', { key: '@A.ed25519', name: 'A' }],
      ['addr2', { key: '@A.ed25519', name: 'A-again' }],
      ['addr3', { key: '@B.ed25519', name: 'B' }]
    ];
    const out = dedup(dup);
    eq(out.length, 2);
    eq(out[0][1].key, '@A.ed25519');
    eq(out[1][1].key, '@B.ed25519');
  });

  t('drops entries with missing key', () => {
    const malformed = [
      ['addr1', { key: null }],
      ['addr2', {}],
      ['addr3', { key: '@C.ed25519' }]
    ];
    const out = dedup(malformed);
    eq(out.length, 1);
    eq(out[0][1].key, '@C.ed25519');
  });
});
