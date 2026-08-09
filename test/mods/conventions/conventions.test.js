const fs = require('fs');
const path = require('path');
const { eq } = require('../../helpers/assert');

const VIEWS_DIR = path.join(__dirname, '..', '..', '..', 'src', 'views');
const SHARED = new Set(['comments_view.js']);
const viewFiles = () => fs.readdirSync(VIEWS_DIR).filter(f => f.endsWith('_view.js') && !SHARED.has(f));
const read = (f) => fs.readFileSync(path.join(VIEWS_DIR, f), 'utf8');
const renderers = (src) => src.split(/\n(?=const |exports\.)/);

describe('conventions: one implementation per shared piece', (t) => {
  t('nobody writes their own comments section', () => {
    const offenders = viewFiles().filter(f => {
      const src = read(f);
      const ownSection = /class: ["']vote-comments-section/.test(src);
      return ownSection && !src.includes('comments_view');
    });
    eq(offenders.length, 0, `these views build their own comments section: ${offenders.join(', ')}`);
  });

  t('no card shows the spread button twice', () => {
    const offenders = [];
    for (const f of viewFiles()) {
      for (const chunk of renderers(read(f))) {
        const inHeader = /renderContentActions\([^\n]*spread:/.test(chunk);
        const inBody = /renderSpreadButton\(/.test(chunk);
        if (inHeader && inBody) offenders.push(`${f}: ${chunk.split('\n')[0].slice(0, 60)}`);
      }
    }
    eq(offenders.length, 0, `spread rendered twice in: ${offenders.join(' | ')}`);
  });

  t('a view that puts the spread in its header never repeats it in the body', () => {
    const offenders = [];
    for (const f of viewFiles()) {
      const src = read(f);
      const headerSpread = /renderContentActions\([\s\S]{0,400}?spread:/.test(src);
      const bodySpread = /class: ["']card-spread-(?:centered|left)["']/.test(src);
      if (headerSpread && bodySpread) offenders.push(f);
    }
    eq(offenders.length, 0, `these views render the spread in the header and again in the body: ${offenders.join(', ')}`);
  });

  t('no listing renderer offers owner-only actions', () => {
    const offenders = [];
    for (const f of viewFiles()) {
      for (const chunk of renderers(read(f))) {
        const head = chunk.split('\n')[0];
        if (!/render[A-Za-z]*List|Card = |Item = /.test(head)) continue;
        if (/OwnerActions\(|FavoriteToggle\(/.test(chunk)) offenders.push(`${f}: ${head.slice(0, 60)}`);
      }
    }
    eq(offenders.length, 0, `owner actions inside a listing: ${offenders.join(' | ')}`);
  });

  t('every create or edit screen keeps the module header', () => {
    const offenders = [];
    for (const f of viewFiles()) {
      for (const chunk of renderers(read(f))) {
        if (!/template\(/.test(chunk)) continue;
        const isForm = /(view|filter|mode)\s*===\s*["'](create|edit|CREATE|EDIT)["']/.test(chunk)
          || /renderCreateForm|renderEditForm/.test(chunk);
        if (!isForm) continue;
        if (!/class: ["']tags-header["']/.test(chunk)) offenders.push(`${f}: ${chunk.split('\n')[0].slice(0, 50)}`);
      }
    }
    eq(offenders.length, 0, `a form screen without its module title: ${offenders.join(' | ')}`);
  });

  t('a label built on the fly either has keys or a fallback', () => {
    const en = require('../../../src/client/assets/translations/oasis_en.js');
    const dict = en.en || en.i18n || en;
    const offenders = [];
    for (const f of fs.readdirSync(VIEWS_DIR).filter(x => x.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(VIEWS_DIR, f), 'utf8');
      for (const m of src.matchAll(/i18n\[`([a-zA-Z]+)\$\{[^\n]*/g)) {
        const prefix = m[1];
        const hasKey = Object.keys(dict).some(k => k.startsWith(prefix));
        const hasFallback = /\|\|/.test(m[0]);
        if (!hasKey && !hasFallback) offenders.push(`${f}: i18n[\`${prefix}…\`]`);
      }
    }
    eq(offenders.length, 0, `these labels render empty: ${[...new Set(offenders)].join(', ')}`);
  });

  t('every render helper a view uses is imported or defined there', () => {
    const problems = [];
    for (const f of fs.readdirSync(VIEWS_DIR).filter(x => x.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(VIEWS_DIR, f), 'utf8');
      const used = new Set([...src.matchAll(/\b(render[A-Z][A-Za-z]*)\s*\(/g)].map(m => m[1]));
      const local = new Set([...src.matchAll(/(?:const|function)\s+(render[A-Z][A-Za-z]*)\b/g)].map(m => m[1]));
      const imported = new Set();
      for (const m of src.matchAll(/const \{([^}]*)\} = require\([^)]*\)/g)) {
        m[1].split(',').map(x => x.split(':').pop().trim()).forEach(x => imported.add(x));
      }
      for (const name of used) {
        if (!local.has(name) && !imported.has(name) && !src.includes(`exports.${name}`)) problems.push(`${f}: ${name}`);
      }
    }
    eq(problems.length, 0, `used but never imported: ${problems.join(', ')}`);
  });
});

describe('conventions: every detail view offers the content actions', (t) => {
  const DETAIL_RE = /^(exports\.single\w*View|const render\w*Detail)\b/;
  const PRIVATE_VIEWS = new Set(['logs_view.js']);

  t('a single-item view never leaves the reader without spread, pin or report', () => {
    const offenders = [];
    for (const f of viewFiles()) {
      if (PRIVATE_VIEWS.has(f)) continue;
      for (const chunk of renderers(read(f))) {
        if (!DETAIL_RE.test(chunk)) continue;
        if (chunk.includes('renderContentActions')) continue;
        offenders.push(`${f}: ${chunk.split('\n')[0].slice(0, 60)}`);
      }
    }
    eq(offenders.join(' | '), '', 'these detail views render no content actions');
  });
});
