const { ok, eq, notOk } = require('../../helpers/assert');

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

describe('licenses', (t) => {
  const { normalizeLicense, licenseInfo } = require('../../../src/views/clearnet_view');

  t('tribes in the hub are counted by what they publish and the busiest goes first', async () => {
    const mv = require('../../../src/views/main_views');
    const i18n = require('../../../src/client/assets/translations/i18n');
    const tribes = [{ id: '%aaa.sha256', title: 'Seeds', content: 3 }, { id: '%bbb.sha256', title: 'Roots', content: 7 }];
    const hub = String(await mv.clearnetHubView({ authors: [], items: {}, tribes }));
    ok(hub.includes(`${i18n.en.cnPublicContent}: 7`) && hub.includes(`${i18n.en.cnPublicContent}: 3`) && !hub.includes(i18n.en.tribeMembersCount), 'each card shows its published content, not its members');
    ok(hub.indexOf('Roots') < hub.indexOf('Seeds'), 'tribes are ordered by published content');
  });

  t('form values outside the list fall back to Public Domain', () => {
    eq(normalizeLicense('CC-BY-4.0'), 'CC-BY-4.0');
    eq(normalizeLicense(''), 'CC0-1.0');
    eq(normalizeLicense('CC-BY-NC-4.0'), 'CC0-1.0');
  });

  t('content without a license is Public Domain; a value nobody chose from the list is not credited to anyone', () => {
    eq(licenseInfo('').name, 'Public Domain');
    eq(licenseInfo(undefined).name, 'Public Domain');
    eq(licenseInfo('GFDL-1.3-or-later').name, 'GNU Free Documentation License 1.3');
    eq(licenseInfo('CC-BY-NC-4.0'), null);
  });
});

describe('clearnet: shops and courses read as they were written', (t) => {
  t('each product of a public shop opens its own page, with its picture, text and price', async () => {
    const v = require('../../../src/views/shops_view');
    const shop = { title: 'Quill', key: '%s1.sha256', rootId: '%s1.sha256', author: '@a', createdAt: new Date().toISOString() };
    const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
    const picture = crypto.randomBytes(32);
    const blobId = `&${picture.toString('base64')}.sha256`;
    const hex = picture.toString('hex');
    const blobFile = path.join(require('../../../src/server/ssb_config').path, 'blobs', 'sha256', hex.slice(0, 2), hex);
    fs.mkdirSync(path.dirname(blobFile), { recursive: true });
    fs.writeFileSync(blobFile, 'jpeg');
    const product = { key: '%p1.sha256', rootId: '%p1.sha256', shopId: '%s1.sha256', title: 'Pen', description: '**good** pen\nsecond line', image: blobId, price: '10', stock: 2 };
    const page = String(await v.clearnetShopView(shop, [product]));
    const link = (page.match(/class="cn-product-cover" href="([^"]+)"/) || [])[1] || '';
    ok(/^\/c\/shops\/[^/]+\/product\//.test(link), 'the whole card links to the product');
    const own = String(await v.clearnetProductView(shop, product));
    ok(own.includes('Pen') && own.includes('<strong>good</strong>') && own.includes('10.000000 ECO'), 'its page shows the product as written');
    ok(own.includes('/c/blob/'), 'and its picture, since the node has it');
    const later = String(await v.clearnetProductView(shop, { ...product, image: `&${crypto.randomBytes(32).toString('base64')}.sha256` }));
    notOk(later.includes('/c/blob/'), 'a picture the node does not have yet is simply not shown');
  });

  t('the lessons of a public course keep their line breaks and their format', async () => {
    const { clearnetCourseView } = require('../../../src/views/school_view');
    if (typeof clearnetCourseView !== 'function') return;
    const html = String(await clearnetCourseView({ id: '%c.sha256', title: 'Course', description: 'd', students: [], author: '@a' }, [{ title: 'One', text: 'first line\nsecond **line**' }]));
    ok(/first line<br\s*\/?>\s*second <strong>line<\/strong>/.test(html), 'breaks and bold survive');
  });
});

describe('clearnet: media that has not arrived', (t) => {
  t('a picture, a file or a PDF whose blob is not on the node is left out of the page, text and the rest stay', () => {
    const { ok, notOk } = require('../../helpers/assert');
    const { renderRichText, blobUrl, renderClearnetPdfFrame } = require('../../../src/views/clearnet_view');
    const missing = '&' + 'A'.repeat(43) + '=.sha256';
    ok(renderClearnetPdfFrame(blobUrl(missing), 'acta.pdf') === '', 'not even the PDF viewer is shown for a document whose blob has not arrived');
    const html = renderRichText(`Hola ![image:foto.jpg](${missing}) adiós [pdf:acta.pdf](${missing}) fin https://example.org`);
    ok(html.includes('Hola') && html.includes('adiós') && html.includes('fin'), 'the text is kept');
    notOk(/<img|<object|foto\.jpg|acta\.pdf/.test(html), 'the missing media and its names are not shown');
    ok(html.includes('example.org'), 'links are kept');
    notOk(blobUrl(missing), 'no clearnet address is given for a blob the node does not have');
  });
});

describe('clearnet: search engines', (t) => {
  t('every public page carries its canonical address and absolute Open Graph tags', () => {
    const { renderClearnetPage } = require('../../../src/views/clearnet_view');
    const { requestScope } = require('../../../src/models/typed_log');
    const render = (scope, opts) => requestScope.run({ capped: false, limit: 0, ...scope }, () => String(renderClearnetPage({ title: 'x', body: '<p>x</p>', ...opts })));
    const hub = render({ path: '/c', query: 'type=posts&lang=fr', cnBase: 'https://hub.example' }, {});
    ok(hub.includes('<link rel="canonical" href="https://hub.example/c?type=posts"/>'), 'the canonical keeps the filter and drops the language');
    ok(hub.includes('<meta property="og:url" content="https://hub.example/c?type=posts"/>'), 'og:url matches the canonical');
    ok(hub.includes('<meta property="og:type" content="website"/>') && hub.includes('<meta name="twitter:card" content="summary"/>'), 'default page type and card');
    const item = render({ path: '/c/audios/%25abc', query: '', cnBase: 'https://hub.example', cnCanonical: '/c/audios/my-song-abc' }, { ogImage: '/c/blob/%26x.sha256', ogType: 'article' });
    ok(item.includes('<link rel="canonical" href="https://hub.example/c/audios/my-song-abc"/>'), 'an item opened by id points at its slug address');
    ok(item.includes('<meta property="og:image" content="https://hub.example/c/blob/%26x.sha256"/>'), 'og:image is absolute');
    ok(item.includes('<meta property="og:type" content="article"/>') && item.includes('summary_large_image'), 'article type and large card with a picture');
    const local = render({ path: '/c', query: '' }, {});
    notOk(local.includes('rel="canonical"') || local.includes('og:url'), 'no canonical is invented when the public address is unknown');
  });
});
