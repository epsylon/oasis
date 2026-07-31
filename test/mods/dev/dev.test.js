const fs = require('fs');
const os = require('os');
const path = require('path');
const { eq, ok, notOk } = require('../../helpers/assert');

const dev = require('../../../src/models/dev_model');

const throwsWith = (fn, match, msg) => {
  try {
    fn();
  } catch (e) {
    if (match instanceof RegExp && !match.test(e.message)) throw new Error(`${msg || 'throwsWith'}: expected ${match}, got "${e.message}"`);
    return e;
  }
  throw new Error(`${msg || 'throwsWith'}: nothing thrown`);
};

describe('dev: file tree', (t) => {
  t('the root exposes only the browsable areas of the project', () => {
    const tree = dev.listTree('');
    const dirs = tree.dirs.map(d => d.name).sort();
    eq(dirs.join(','), 'docs,scripts,src,test');
    ok(tree.files.find(f => f.name === 'README.md'), 'README is reachable');
    notOk(tree.dirs.find(d => d.name === 'node_modules'), 'dependencies are not listed');
  });

  t('a folder lists its own files with size and viewability', () => {
    const tree = dev.listTree('src/models');
    eq(tree.path, 'src/models');
    const model = tree.files.find(f => f.name === 'industry_model.js');
    ok(model, 'industry_model.js is listed');
    ok(model.size > 0, 'size is reported');
    eq(model.viewable, true);
    eq(tree.parents.map(p => p.path).join(' > '), 'src > src/models', 'breadcrumb is built');
  });

  t('dependencies, local configuration and SSB data are never listed', () => {
    const src = dev.listTree('src');
    const names = src.dirs.map(d => d.name);
    notOk(names.includes('configs'), 'src/configs stays hidden');
    notOk(names.includes('node_modules'), 'node_modules stays hidden');
    const server = dev.listTree('src/server');
    notOk(server.dirs.find(d => d.name === 'node_modules'), 'nested node_modules stays hidden');
    ok(server.hidden > 0, 'the viewer reports that entries were withheld');
  });
});

describe('dev: path confinement', (t) => {
  t('escapes out of the project are rejected', () => {
    throwsWith(() => dev.listTree('../../etc'), /Invalid path/, 'parent traversal');
    throwsWith(() => dev.readFile('../../../etc/passwd'), /Invalid path/, 'deep traversal');
    throwsWith(() => dev.readFile('/etc/passwd'), /Path not available/, 'absolute path');
    throwsWith(() => dev.listTree('.ssb'), /Path not available/, 'ssb directory');
  });

  t('local configuration and credentials are unreachable by direct path', () => {
    throwsWith(() => dev.readFile('src/configs/fediverse-accounts.json'), /Path not available/);
    throwsWith(() => dev.readFile('src/configs/oasis-config.json'), /Path not available/);
    throwsWith(() => dev.listTree('src/server/node_modules'), /Path not available/);
  });

  t('a symlink pointing outside the project is not followed', () => {
    const link = path.join(dev.ROOT, 'test', 'mods', 'dev', 'escape-link');
    try { fs.unlinkSync(link); } catch (_) {}
    fs.symlinkSync(os.tmpdir(), link);
    try {
      throwsWith(() => dev.listTree('test/mods/dev/escape-link'), /Path not available/);
      const listing = dev.listTree('test/mods/dev');
      notOk(listing.dirs.find(d => d.name === 'escape-link'), 'the symlink is not listed either');
    } finally {
      try { fs.unlinkSync(link); } catch (_) {}
    }
  });
});

describe('dev: file viewer', (t) => {
  t('reads a page of lines with its navigation state', () => {
    const first = dev.readFile('src/models/industry_model.js');
    eq(first.from, 1);
    eq(first.lines.length, Math.min(dev.PAGE_LINES, first.totalLines));
    eq(first.lines[0].n, 1);
    eq(first.hasPrev, false);
    ok(first.totalLines > dev.PAGE_LINES, 'the model is longer than one page');
    ok(first.hasNext, 'a next page is offered');
    const second = dev.readFile('src/models/industry_model.js', { from: first.to + 1 });
    eq(second.from, first.to + 1);
    eq(second.hasPrev, true);
  });

  t('an out of range or invalid line lands inside the file', () => {
    const file = dev.readFile('oasis.sh', { from: 999999 });
    eq(file.from, file.totalLines);
    eq(dev.readFile('oasis.sh', { from: 'abc' }).from, 1);
    eq(dev.readFile('oasis.sh', { from: -5 }).from, 1);
  });

  t('binary and unknown file types are not served', () => {
    throwsWith(() => dev.readFile('src/AI/oasis-42-1-chat.Q4_K_M.gguf'), /Path not available/, 'the AI model file is denied by extension');
    const tree = dev.listTree('src/client/assets/images');
    ok(tree.files.every(f => !f.viewable), 'images are listed but not viewable');
    if (tree.files.length) throwsWith(() => dev.readFile(tree.files[0].path), /cannot be displayed/);
  });
});

describe('dev: code search', (t) => {
  t('finds a known string and points at its line', () => {
    const found = dev.searchCode('industryContribution', { ext: '.js' });
    ok(found.results.length > 0, 'there are matches');
    const hit = found.results.find(r => r.path === 'src/models/industry_model.js');
    ok(hit, 'the industry model is among them');
    ok(hit.line > 0, 'a line number is reported');
    const file = dev.readFile(hit.path, { from: hit.line });
    ok(file.lines[0].text.includes('industryContribution'), 'the reported line really contains the text');
  });

  t('short queries are ignored and the result count is capped', () => {
    eq(dev.searchCode('a').results.length, 0, 'one character is not searched');
    const capped = dev.searchCode('const', { max: 5 });
    eq(capped.results.length, 5);
    eq(capped.truncated, true);
  });

  t('the extension filter narrows the search', () => {
    const css = dev.searchCode('industry-card-wrap', { ext: '.css' });
    ok(css.results.length > 0, 'found in the stylesheet');
    ok(css.results.every(r => r.path.endsWith('.css')), 'only css files are returned');
  });
});

describe('dev: module map', (t) => {
  t('locates model, view, routes and tests of a real module', () => {
    const map = dev.moduleMap();
    const industry = map.find(m => m.name === 'industry');
    ok(industry, 'industry is in the map');
    eq(industry.model, 'src/models/industry_model.js');
    eq(industry.view, 'src/views/industry_view.js');
    eq(industry.tests, 'test/mods/industry');
    ok(industry.routes > 20, 'its routes are counted');
  });

  t('project stats describe the codebase', () => {
    const stats = dev.projectStats();
    ok(stats.files > 100, 'files are counted');
    ok(stats.lines > 10000, 'lines are counted');
    ok(stats.modules > 40, 'modules are counted');
    eq(stats.languages, 11, 'the eleven translations are counted');
  });
});

describe('dev: shortcut groups', (t) => {
  t('STYLES gathers both the stylesheets and the themes', () => {
    const group = dev.listGroup('styles');
    const names = group.files.map(f => f.name);
    ok(names.includes('style.css'), 'the main stylesheet is there');
    ok(names.includes('Dark-SNH.css'), 'the themes are there too');
    ok(group.files.every(f => f.viewable), 'every stylesheet can be opened');
    const themePath = group.files.find(f => f.name === 'Dark-SNH.css').path;
    eq(dev.readFile(themePath).path, 'src/client/assets/themes/Dark-SNH.css', 'entries keep their real path');
  });

  t('TRANSLATIONS lists the eleven languages and TESTS the suites', () => {
    const langs = dev.listGroup('translations').files.filter(f => /^oasis_[a-z]{2}\.js$/.test(f.name));
    eq(langs.length, 11);
    const tests = dev.listGroup('tests');
    ok(tests.dirs.find(d => d.name === 'mods'), 'the suites folder is listed');
    ok(tests.files.find(f => f.name === 'run.js'), 'the runner is listed');
  });

  t('an unknown group is rejected', () => {
    throwsWith(() => dev.listGroup('../../etc'), /Not found/);
    throwsWith(() => dev.listGroup('secrets'), /Not found/);
  });
});

describe('dev: plain text files without extension', (t) => {
  t('MANIFESTO and LICENSE can be opened', () => {
    const docs = dev.listTree('docs');
    const manifesto = docs.files.find(f => f.name === 'MANIFESTO');
    ok(manifesto, 'MANIFESTO is listed');
    eq(manifesto.viewable, true, 'and it can be opened');
    ok(dev.readFile('docs/MANIFESTO').totalLines > 0);
    ok(dev.readFile('LICENSE').totalLines > 0);
  });

  t('an extensionless name does not open binaries or hidden files', () => {
    throwsWith(() => dev.readFile('src/AI/oasis-42-1-chat.Q4_K_M.gguf'), /Path not available/);
    throwsWith(() => dev.readFile('.gitignore'), /Path not available/);
  });
});
