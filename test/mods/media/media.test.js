const { ok, eq, notOk } = require('../../helpers/assert');

const LISTINGS = [
  ['image_view', 'imageView', 'images'],
  ['audio_view', 'audioView', 'audios'],
  ['video_view', 'videoView', 'videos'],
  ['document_view', 'documentView', 'documents'],
  ['bookmark_view', 'bookmarkView', 'bookmarks']
];

const item = () => ({
  key: '%m.sha256', id: '%m.sha256', rootId: '%m.sha256', author: '@a.ed25519',
  title: 'a thing', url: 'https://example.org', tags: [], opinions: {}, opinions_inhabitants: [],
  createdAt: new Date().toISOString(), commentCount: 0
});

describe('media: a listing card carries no action of its own', (t) => {
  t('no favourite, no update, no delete, no message button', async () => {
    for (const [file, viewName] of LISTINGS) {
      const view = require(`../../../src/views/${file}`)[viewName];
      if (typeof view !== 'function') continue;
      const html = String(await view([item()], 'all', null, {}));

      notOk(/class="[^"]*update-btn/.test(html), `${file}: no update button in the listing`);
      notOk(/class="[^"]*delete-btn/.test(html), `${file}: no delete button in the listing`);
      const favForms = html.match(/\/favorites\/(add|remove)\//g) || [];
      eq(favForms.length, 1, `${file}: the only favourite control is the pin in the header`);
      notOk(/action="\/pm"/.test(html), `${file}: no message-the-author form in the listing`);
    }
  });

  t('but every card keeps the shared action row', async () => {
    for (const [file, viewName] of LISTINGS) {
      const view = require(`../../../src/views/${file}`)[viewName];
      if (typeof view !== 'function') continue;
      const html = String(await view([item()], 'all', null, {}));
      ok(html.includes('content-actions'), `${file}: the card header is there`);
      ok(html.includes('btn-singleview'), `${file}: with the usual round buttons`);
    }
  });
});

describe('media: the detail view has the same header as everywhere else', (t) => {
  const DETAILS = [
    ['image_view', 'singleImageView', 'images'],
    ['audio_view', 'singleAudioView', 'audios'],
    ['video_view', 'singleVideoView', 'videos'],
    ['document_view', 'singleDocumentView', 'documents'],
    ['bookmark_view', 'singleBookmarkView', 'bookmarks'],
    ['torrents_view', 'singleTorrentView', 'torrents']
  ];

  t('pin, report, blockexplorer and the rest live in the card header', async () => {
    for (const [file, viewName, kind] of DETAILS) {
      const view = require(`../../../src/views/${file}`)[viewName];
      const html = String(await view(item(), 'all', [], {}));
      ok(html.includes('content-actions'), `${file}: the shared action row is there`);
      ok(html.includes(`/${kind}/favorites/add/`), `${file}: pinning is done from the header`);
      ok(html.includes('/reports?filter=create'), `${file}: reporting is offered from the header`);
      ok(html.includes('/blockexplorer/block/'), `${file}: and so is the blockexplorer`);
    }
  });

  t('and the old favourite button is gone for good', async () => {
    const i18n = require('../../../src/views/main_views').i18n;
    for (const [file, viewName] of DETAILS) {
      const view = require(`../../../src/views/${file}`)[viewName];
      const html = String(await view(item(), 'all', [], {}));
      const favForms = html.match(/\/favorites\/(add|remove)\//g) || [];
      eq(favForms.length, 1, `${file}: one way to pin, not two`);
    }
  });
});
