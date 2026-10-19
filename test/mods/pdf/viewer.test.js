const { eq, ok, notOk } = require('../../helpers/assert');
const { buildDocumentPdf } = require('../../../src/backend/pdf');
const viewer = require('../../../src/backend/pdf_view');

const ROWS = 120;
const sample = () => {
  const sections = [];
  for (let i = 0; i < ROWS; i++) sections.push({ kind: 'kv', label: `Row ${i}`, value: 'lorem ipsum '.repeat(15) });
  return buildDocumentPdf({ title: 'OASIS', sections });
};
const refused = async (fn) => { try { await fn(); return ''; } catch (e) { return e.message; } };

describe('pdf: read on the node, without the browser', (t) => {
  t('pages, a picture of any page at the zoom asked for, turned when asked', async () => {
    const pdf = sample();
    const load = async () => pdf;
    const info = await viewer.info('test-doc', load);
    ok(info.pages > 1, 'a long document has several pages');
    const sharp = require('../../../src/server/node_modules/sharp');
    const width = viewer.widthOf(viewer.PDF_ZOOM_DEFAULT);
    const upright = await sharp((await viewer.page('test-doc', load, 1, width, 0)).body).metadata();
    eq(upright.width, width, 'the page is drawn at the width asked for');
    const turned = await sharp((await viewer.page('test-doc', load, 1, width, 90)).body).metadata();
    eq(turned.width, upright.height, 'a turned page swaps its sides');
    ok(/invalid page/i.test(await refused(() => viewer.page('test-doc', load, info.pages + 1, width, 0))), 'a page past the end is refused');
  });

  t('what is not a PDF, or has not arrived, is told apart', async () => {
    eq(await refused(() => viewer.info('not-a-pdf', async () => Buffer.from('<html>not a pdf</html>'))), 'NOT_PDF');
    eq(await refused(() => viewer.info('not-here', async () => null)), 'UNAVAILABLE');
  });

  t('pictures are only drawn at the zoom levels and turns the viewer offers', () => {
    for (const z of viewer.PDF_ZOOMS) ok(viewer.isPdfWidth(viewer.widthOf(z)), `${z}%`);
    notOk(viewer.isPdfWidth(12345), 'any other width is refused');
    eq(viewer.zoomOf('999'), viewer.PDF_ZOOM_DEFAULT, 'an unknown zoom falls back to the default');
    eq(viewer.rotationOf('45'), 0, 'an unknown turn falls back to upright');
  });
});

describe('pdf: the viewer pages', (t) => {
  const mv = require('../../../src/views/main_views');
  const state = { src: '/blob/%26abc%3D.sha256', fid: 'pdf-0123456789ab', pages: 5, page: 2, zoom: 100, rotation: 0, full: false };

  t('it turns pages, zooms, rotates, downloads and goes full screen with links only', () => {
    const html = mv.renderPdfViewer(state, { title: 'Doc', base: '/documents/x', keep: { filter: 'all' } }).outerHTML;
    notOk(/<script|<iframe|<object|<embed|<button/i.test(html), 'no script, no nested frame, no browser plugin');
    ok(html.includes('/pdf/page?src='), 'the page is a picture drawn by the node');
    const controls = [...html.matchAll(/<(?:a|span)[^>]*>(⬅️|➡️|🔍\+|🔍−|↻|⬇️|🔲)<\/(?:a|span)>/g)].map(m => m[1]);
    eq(controls.join(' '), '⬅️ ➡️ 🔍+ 🔍− ↻ ⬇️ 🔲', 'the same controls, in the same order, as always');
    ok(/href="\/documents\/x\?[^"]*filter=all/.test(html), 'they stay on the same page of Oasis and keep what it was showing');
    ok(/href="[^"]*r=90/.test(html), 'rotating turns the page a quarter');
    const framed = mv.renderPdfViewer(state, { title: 'Doc', base: '/pdf/embed', embed: true, back: '/activity' }).outerHTML;
    ok(framed.includes('href="/activity#pdf-0123456789ab" target="_top"'), 'full screen enlarges the viewer where it is, on the same page');
  });

  t('when it cannot show the PDF it says so', () => {
    const unavailable = mv.renderPdfViewer({ src: state.src, error: 'unavailable' }, { title: 'Doc' }).outerHTML;
    ok(unavailable.includes(mv.i18n.pdfUnavailable), 'not arrived yet');
    const missing = mv.renderPdfViewer({ src: '', error: 'missing' }, { title: 'Doc' }).outerHTML;
    ok(missing.includes(mv.i18n.pdfMissing), 'not available');
    notOk(missing.includes('download=1'), 'with nothing to download');
  });

  t('every PDF in a page is shown in the viewer', () => {
    const html = mv.renderPdfDocument('/blob/%26abc%3D.sha256', { title: 'Doc' }).outerHTML;
    ok(html.includes('data="/pdf/embed?') && !html.includes('<iframe'), 'the viewer is embedded where the PDF is, without a frame');
    ok(/<object id="(pdf-[0-9a-f]{12})"[^>]*fid=\1/.test(html.replace(/&amp;/g, '&')), 'and knows its place to go full screen there');
    ok(html.includes('class="pdf-unmax"'), 'with a way back');
  });

  t('on the clearnet the viewer stays inside /c', () => {
    const html = require('../../../src/views/clearnet_view').renderClearnetPdfEmbed({ ...state, src: '/c/blob/%26abc%3D.sha256' }, { title: 'Doc' });
    const urls = [...html.matchAll(/(?:href|src|action)="([^"]+)"/g)].map(m => m[1]).filter(u => u.startsWith('/'));
    ok(urls.length > 0);
    eq(urls.filter(u => !u.startsWith('/c/')).length, 0, `links leaving /c: ${urls.filter(u => !u.startsWith('/c/')).join(' ')}`);
  });
});
