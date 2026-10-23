const { eq, ok, notOk } = require('../../helpers/assert');

const html = (node) => (node == null ? '' : typeof node === 'string' ? node : node.outerHTML || String(node));

describe('views: the person is warned when their identity is used elsewhere', (t) => {
  const mv = require('../../../src/views/main_views');
  const i18n = require('../../../src/client/assets/translations/i18n');

  t('a device conflict shows the orange warning with a button to dismiss it', () => {
    const out = html(mv.renderFeedBanner({ kind: 'conflict', at: '2026-10-23T10:00:00.000Z' }));
    ok(out.includes('feed-banner-warn'));
    ok(out.includes(i18n[mv.getLanguage()].feedConflictBanner));
    ok(out.includes('action="/feed-status/seen"') && out.includes('value="2026-10-23T10:00:00.000Z"'), 'dismissing points at the right event');
    ok(out.includes(i18n[mv.getLanguage()].feedBannerDismiss));
  });

  t('a plain repair is silent, and nothing is shown once dismissed or without status', () => {
    eq(mv.renderFeedBanner({ kind: 'repaired', republished: 30 }), null);
    eq(mv.renderFeedBanner({ kind: 'conflict', seen: true }), null);
    eq(mv.renderFeedBanner(null), null);
  });

  t('every language has the warning and the button, and the warning is one short sentence', () => {
    const langs = Object.keys(i18n).filter(l => i18n[l] && typeof i18n[l] === 'object' && typeof i18n[l].feedConflictBanner === 'string');
    eq(langs.length, 13);
    for (const lang of langs) {
      ok(i18n[lang].feedConflictBanner.length > 0 && i18n[lang].feedConflictBanner.length <= 80, `${lang}: short`);
      ok(typeof i18n[lang].feedBannerDismiss === 'string' && i18n[lang].feedBannerDismiss.length > 0, `${lang}: button`);
      notOk('feedRepairedBanner' in i18n[lang], `${lang}: no repaired text`);
    }
  });
});
