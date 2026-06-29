const { ok } = require('../../helpers/assert');
const fs = require('fs');
const path = require('path');

const TDIR = path.join(__dirname, '..', '..', '..', 'src', 'client', 'assets', 'translations');
const LANGS = fs.readdirSync(TDIR)
  .map(f => (f.match(/^oasis_([a-z]+)\.js$/) || [])[1])
  .filter(Boolean)
  .sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)));

const loadKeys = (lang) => {
  const mod = require(path.join(TDIR, `oasis_${lang}.js`));
  const obj = (mod && mod[lang]) || {};
  return new Set(Object.keys(obj));
};

const preview = (arr, n = 25) =>
  arr.slice(0, n).join(', ') + (arr.length > n ? `, …(+${arr.length - n})` : '');

describe('i18n: translation key consistency (English is the reference)', (t) => {
  const keys = {};
  for (const lang of LANGS) keys[lang] = loadKeys(lang);
  const ref = keys.en;

  for (const lang of LANGS) {
    if (lang === 'en') continue;
    t(`${lang} contains every English key`, () => {
      const missing = [...ref].filter(k => !keys[lang].has(k)).sort();
      ok(missing.length === 0, `${lang} is missing ${missing.length} key(s): ${preview(missing)}`);
    });
  }

  t('English (reference) is not missing keys that exist in other languages', () => {
    const union = new Set();
    for (const lang of LANGS) for (const k of keys[lang]) union.add(k);
    const enMissing = [...union].filter(k => !ref.has(k)).sort();
    ok(enMissing.length === 0, `en is missing ${enMissing.length} key(s) present in other languages: ${preview(enMissing)}`);
  });

  t('every i18n key referenced in the views exists in English', () => {
    const VIEWS = path.join(__dirname, '..', '..', '..', 'src', 'views');
    const referenced = new Set();
    const walk = (dir) => {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p);
        else if (f.endsWith('.js')) {
          const txt = fs.readFileSync(p, 'utf8');
          let m; const re = /i18n(?:Obj)?\.([A-Za-z0-9_]+)/g;
          while ((m = re.exec(txt))) referenced.add(m[1]);
        }
      }
    };
    walk(VIEWS);
    const undefinedKeys = [...referenced].filter(k => !ref.has(k)).sort();
    ok(undefinedKeys.length === 0, `${undefinedKeys.length} key(s) used in views are not defined in English (they fall back to hardcoded text): ${preview(undefinedKeys)}`);
  });
});
