const fs = require('fs');
const path = require('path');
const { eq, ok, notOk } = require('../../helpers/assert');
const lastPageOf = require('../../../src/backend/last_page');
const { keepable, urlOf } = lastPageOf;

const fileFor = (name) => path.join(process.env.ssb_path, `last-page-${name}-${process.pid}.json`);
const clean = (f) => { try { fs.unlinkSync(f); } catch (_) {} };

describe('resume: Oasis opens again where it was left', (t) => {
  t('only pages are kept, never files, pictures, public pages or the home itself', () => {
    for (const p of ['/activity', '/forum/%25abc', '/pdf', '/settings']) ok(keepable(p), p);
    for (const p of ['/', '//evil', '/assets/x.css', '/blob/%26x', '/image/64/x', '/avatar/x', '/c/blog', '/pdf/page', '/pdf/embed', '/player/video', 'activity']) notOk(keepable(p), p);
  });

  t('the view switch and error notes are not replayed', () => {
    eq(urlOf('/documents', 'layout=list&filter=mine&error=x'), '/documents?filter=mine');
    eq(urlOf('/activity', ''), '/activity');
  });

  t('after a restart the first visit to the home goes back to the last page, only once', () => {
    const f = fileFor('restart'); clean(f);
    const before = lastPageOf({ file: f });
    eq(before.takeRestore(), null);
    before.record('/forum', 'filter=top');
    before.record('/tribes', '');
    before.flush();
    const after = lastPageOf({ file: f });
    eq(after.takeRestore(), '/tribes');
    eq(after.takeRestore(), null);
    clean(f);
  });

  t('opening another page first cancels the jump, a picture or a file does not', () => {
    const f = fileFor('cancel'); clean(f);
    fs.writeFileSync(f, JSON.stringify({ url: '/wiki' }));
    const a = lastPageOf({ file: f });
    a.record('/blob/%26x', '');
    eq(a.takeRestore(), '/wiki');
    const b = lastPageOf({ file: f });
    b.record('/activity', '');
    eq(b.takeRestore(), null);
    clean(f);
  });

  t('a damaged or foreign file is ignored', () => {
    const f = fileFor('bad'); clean(f);
    fs.writeFileSync(f, '{not json');
    eq(lastPageOf({ file: f }).takeRestore(), null);
    fs.writeFileSync(f, JSON.stringify({ url: '//elsewhere.example/x' }));
    eq(lastPageOf({ file: f }).takeRestore(), null);
    clean(f);
  });
});
