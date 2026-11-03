const { eq, ok, notOk } = require('../../../helpers/assert');
const { HAS_PENDING_RE, pendingIds, markMissing } = require('../../../../src/backend/pending_media');

const id = (c) => '&' + c.repeat(43) + '=.sha256';
const enc = (b) => encodeURIComponent(b);
const page = [
  `<img src="/image/640/${enc(id('i'))}?fit=inside" class="post-image">`,
  `<img src="/image/64/${enc(id('v'))}?fallback=avatar">`,
  `<video controls src="/blob/${enc(id('m'))}"></video>`,
  `<a href="/files/x/get" class="filter-btn" data-blob="${id('f').replace('&', '&amp;')}">⬇ LOCAL</a>`,
  `<a href="/blob/${enc(id('t'))}?name=a.torrent" class="filter-btn" data-blob="${id('t').replace('&', '&amp;')}">⬇ EXTERNAL</a>`,
  `<a href="/files/y/get" class="filter-btn" data-blob="${id('d').replace('&', '&amp;')}" data-blob-notice="1">⬇ LOCAL</a>`
].join('');

describe('content that has not arrived yet: pictures, players and download buttons', (t) => {
  t('every blob a page depends on is found, avatars aside', () => {
    ok(HAS_PENDING_RE.test(page));
    const ids = pendingIds(page);
    for (const c of ['i', 'm', 'f', 't', 'd']) ok(ids.includes(id(c)), c);
    notOk(ids.includes(id('v')), 'avatars have their own fallback');
  });

  t('missing files lose their download buttons, and the detail page says it has not arrived yet', () => {
    const html = markMissing(page, new Set([id('f'), id('d'), id('i')]), 'Not available yet');
    notOk(html.includes('href="/files/x/get"'), 'LOCAL of a missing file is not rendered');
    ok(html.includes('?name=a.torrent'), 'EXTERNAL whose torrent is here stays');
    notOk(html.includes('href="/files/y/get"'));
    eq((html.match(/<div class="pending-media" role="note">Not available yet<\/div>/g) || []).length, 1, 'the detail button becomes the notice');
    ok(html.includes('pending-media-picture'), 'a missing picture becomes the notice too');
    ok(html.includes(`<video controls src="/blob/${enc(id('m'))}"></video>`), 'what is here is left as it is');
  });

});
