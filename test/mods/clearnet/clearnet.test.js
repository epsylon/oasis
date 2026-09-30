const { ok, eq } = require('../../helpers/assert');

describe('clearnet: the visitor language', (t) => {
  t('every public page is rendered in the negotiated language and declares it', async () => {
    const mv = require('../../../src/views/main_views');
    const { renderClearnetPage, renderClearnetNotFound, renderClearnetMediaView, renderClearnetPodcastView, escapeHtml } = require('../../../src/views/clearnet_view');
    const i18n = require('../../../src/client/assets/translations/i18n');
    const before = mv.getLanguage();
    try {
      for (const lang of ['fr', 'ca', 'en']) {
        mv.setLanguage(lang);
        const page = String(renderClearnetPage({ title: 'x', body: '<p>x</p>' }));
        ok(page.includes(`<html lang="${lang}">`), `${lang}: the html declares the language`);
        ok(page.includes(i18n[lang].cnBrandSub), `${lang}: the header tagline is translated`);
        ok(page.includes(i18n[lang].cnSyncedPeers), `${lang}: the footer is translated`);
        ok(String(renderClearnetNotFound()).includes(escapeHtml(i18n[lang].cnNotAccessible)), `${lang}: the 404 is translated`);
        const media = String(renderClearnetMediaView({ kind: 'video', item: { url: null } }));
        ok(media.includes(`[${i18n[lang].cnKindVideo.toUpperCase()}]`), `${lang}: content kinds are translated`);
        ok(String(renderClearnetPodcastView({ channel: { episodes: [] } })).includes(escapeHtml(i18n[lang].cnUntitled)), `${lang}: the untitled fallback is translated`);
      }
      mv.setLanguage('es');
      const hub = String(await mv.clearnetHubView({ authors: [], items: {} }));
      ok(hub.includes(i18n.es.cnHubEmpty) && !hub.includes('No public content'), 'the hub speaks the visitor language, not the node language');
    } finally {
      mv.setLanguage(before);
    }
  });

  t('a visitor never falls back to English while their browser speaks a supported language', () => {
    const { browserLanguage } = require('../../../src/models/onboarding_model');
    const supported = Object.keys(require('../../../src/client/assets/translations/i18n'));
    eq(browserLanguage('gl-ES,gl;q=0.9,es;q=0.8', supported), 'gl');
    eq(browserLanguage('ja,ko;q=0.5', supported), '', 'an unsupported browser keeps the node default');
  });
});

describe('clearnet: choosing a language without cookies', (t) => {
  t('a lang chosen in the URL travels in every internal link and form, and never in a cookie', async () => {
    const { requestScope } = require('../../../src/models/typed_log');
    const mv = require('../../../src/views/main_views');
    const before = mv.getLanguage();
    try {
      const items = { jobs: [{ id: '%j1.sha256', title: 'Dev', snippet: 'x', meta: '2026', author: '@a' }] };
      const html = await requestScope.run({ capped: false, limit: 0, path: '/c', query: 'type=jobs', cnLang: 'it' }, async () => {
        mv.setLanguage('it');
        return String(await mv.clearnetHubView({ authors: [], items, filterType: 'jobs' }));
      });
      const page = html.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<div class="cn-lang" tabindex="0">[\s\S]*?<\/div><\/div>/, '');
      const internal = page.match(/href="\/c[^"]*"/g) || [];
      ok(internal.length > 2 && internal.every(h => /[?&]lang=it/.test(h)), 'every /c link keeps the chosen language');
      ok(/<form class="cn-search"[^>]*><input type="hidden" name="lang" value="it"\/>/.test(html), 'the search form keeps it too');
      ok(html.includes('<span class="cn-lang-current">IT</span>') && html.includes('href="/c?type=jobs&amp;lang=es"'), 'the listbox links to the same page in the other languages');
      const plain = await requestScope.run({ capped: false, limit: 0, path: '/c', query: '' }, async () => {
        mv.setLanguage('en');
        return String(await mv.clearnetHubView({ authors: [], items }));
      });
      const body = plain.replace(/<div class="cn-lang" tabindex="0">[\s\S]*?<\/div><\/div>/, '');
      ok(!/[?&]lang=/.test(body), 'with the browser language nothing is appended to the links');
    } finally {
      mv.setLanguage(before);
    }
  });
});
