const fs = require('fs');
const path = require('path');
const { getConfig } = require('../configs/config-manager.js');

const ROOT = path.resolve(__dirname, '..', '..');

const ALLOWED_ROOTS = ['src', 'docs', 'scripts', 'test'];
const ALLOWED_ROOT_FILES = ['README.md', 'LICENSE', 'install.sh', 'oasis.sh'];
const DENIED_SEGMENTS = new Set(['node_modules', '.git', '.ssb', 'packages', 'configs', 'embeddings', 'tiles', 'cache', 'results']);
const DENIED_NAMES = new Set(['secret', '.env', '.npmrc', 'package-lock.json']);
const DENIED_EXTENSIONS = new Set(['.gguf', '.jks', '.keystore', '.enc', '.pem', '.key', '.p12', '.crt']);
const VIEWABLE_EXTENSIONS = new Set(['.js', '.mjs', '.json', '.css', '.md', '.sh', '.html', '.txt', '.yml', '.yaml']);

const STATS_TTL = 60 * 1000;
let statsCache = null;
let statsCacheAt = 0;

const MAX_VIEW_BYTES = 2 * 1024 * 1024;
const PAGE_LINES = 500;
const SEARCH_MAX = 200;
const SEARCH_SNIPPET = 200;

const extOf = (name) => {
  const i = String(name || '').lastIndexOf('.');
  return i > 0 ? String(name).slice(i).toLowerCase() : '';
};

const isDeniedEntry = (name) => {
  const n = String(name || '');
  if (!n || n === '.' || n === '..') return true;
  if (n.toLowerCase().startsWith('.git')) return true;
  if (DENIED_SEGMENTS.has(n)) return true;
  if (DENIED_NAMES.has(n)) return true;
  if (DENIED_EXTENSIONS.has(extOf(n))) return true;
  return false;
};

const PLAIN_TEXT_NAME = /^[A-Z][A-Z0-9_-]*$/;

const isViewable = (name) => (VIEWABLE_EXTENSIONS.has(extOf(name)) || PLAIN_TEXT_NAME.test(String(name || ''))) && !isDeniedEntry(name);

function realRoot() {
  try { return fs.realpathSync(ROOT); } catch (_) { return ROOT; }
}

function splitPath(rel) {
  const raw = String(rel || '');
  for (let i = 0; i < raw.length; i++) { if (raw.charCodeAt(i) < 32) throw new Error('Invalid path'); }
  return raw.replace(/^[/\\]+/, '').split(/[/\\]+/).filter(s => s && s !== '.');
}

function resolveSafe(rel) {
  const segments = splitPath(rel);
  if (segments.some(s => s === '..')) throw new Error('Invalid path');
  if (segments.some(isDeniedEntry)) throw new Error('Path not available');
  if (segments.length) {
    const head = segments[0];
    const isRootFile = segments.length === 1 && ALLOWED_ROOT_FILES.includes(head);
    if (!ALLOWED_ROOTS.includes(head) && !isRootFile) throw new Error('Path not available');
  }
  const target = path.resolve(ROOT, segments.join(path.sep));
  let real;
  try { real = fs.realpathSync(target); } catch (_) { throw new Error('Not found'); }
  const base = realRoot();
  if (real !== base && !real.startsWith(base + path.sep)) throw new Error('Path not available');
  return { abs: real, rel: segments.join('/'), segments };
}

function parentsOf(segments) {
  const out = [];
  let acc = '';
  for (const s of segments) {
    acc = acc ? `${acc}/${s}` : s;
    out.push({ name: s, path: acc });
  }
  return out;
}

function rootListing() {
  const dirs = [];
  const files = [];
  for (const name of ALLOWED_ROOTS) {
    const abs = path.join(ROOT, name);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) dirs.push({ name, path: name });
  }
  for (const name of ALLOWED_ROOT_FILES) {
    const abs = path.join(ROOT, name);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    files.push({ name, path: name, size: fs.statSync(abs).size, ext: extOf(name), viewable: isViewable(name) });
  }
  return { path: '', parents: [], dirs, files, hidden: 0 };
}

function walkFiles(relDir, onFile) {
  let entries;
  try { entries = fs.readdirSync(path.resolve(ROOT, relDir), { withFileTypes: true }); } catch (_) { return true; }
  for (const e of entries) {
    if (isDeniedEntry(e.name)) continue;
    const rel = relDir ? `${relDir}/${e.name}` : e.name;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) { if (walkFiles(rel, onFile) === false) return false; continue; }
    if (!e.isFile()) continue;
    if (onFile(rel, e.name) === false) return false;
  }
  return true;
}

const MODULE_ALIASES = {
  ai: { model: 'src/AI/ai_service.mjs', view: 'src/views/AI_view.js' },
  aiNav: { model: 'src/AI/routes_index.js', view: 'src/views/AI_view.js', paths: ['/ai/ask'] },
  docs: { paths: ['/documents'] },
  blogs: { model: 'src/models/blog_model.js', view: 'src/views/blog_view.js', paths: ['/blogs'] },
  polls: { model: 'src/models/polls_model.js', view: 'src/views/polls_view.js', paths: ['/polls'] },
  data: { model: 'src/models/data_model.js', view: 'src/views/data_view.js', paths: ['/data'] },
  invites: { model: 'src/models/main_models.js', view: 'src/views/invites_view.js' },
  graphos: { model: 'src/models/main_models.js', view: 'src/views/graphos_view.js' }
};

const GROUPS = {
  translations: ['src/client/assets/translations'],
  styles: ['src/client/assets/styles', 'src/client/assets/themes'],
  tests: ['test']
};

module.exports = {
  ROOT,
  PAGE_LINES,
  GROUPS,

  listGroup(key) {
    const roots = GROUPS[String(key || '')];
    if (!roots) throw new Error('Not found');
    const dirs = [];
    const files = [];
    for (const rel of roots) {
      let listing;
      try { listing = module.exports.listTree(rel); } catch (_) { continue; }
      dirs.push(...listing.dirs);
      files.push(...listing.files);
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return { group: String(key), path: '', parents: [], dirs, files, hidden: 0 };
  },

  listTree(relPath) {
    const segments = splitPath(relPath);
    if (!segments.length) return rootListing();
    const target = resolveSafe(relPath);
    const stat = fs.statSync(target.abs);
    if (!stat.isDirectory()) throw new Error('Not a directory');
    const entries = fs.readdirSync(target.abs, { withFileTypes: true });
    const dirs = [];
    const files = [];
    let hidden = 0;
    for (const e of entries) {
      if (isDeniedEntry(e.name) || e.isSymbolicLink()) { hidden++; continue; }
      const rel = `${target.rel}/${e.name}`;
      if (e.isDirectory()) { dirs.push({ name: e.name, path: rel }); continue; }
      if (!e.isFile()) { hidden++; continue; }
      let size = 0;
      try { size = fs.statSync(path.join(target.abs, e.name)).size; } catch (_) { size = 0; }
      files.push({ name: e.name, path: rel, size, ext: extOf(e.name), viewable: isViewable(e.name) });
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return { path: target.rel, parents: parentsOf(target.segments), dirs, files, hidden };
  },

  readFile(relPath, opts = {}) {
    const target = resolveSafe(relPath);
    const stat = fs.statSync(target.abs);
    if (!stat.isFile()) throw new Error('Not a file');
    if (!isViewable(path.basename(target.abs))) throw new Error('This file type cannot be displayed');
    if (stat.size > MAX_VIEW_BYTES) throw new Error('This file is too large to be displayed');
    const all = fs.readFileSync(target.abs, 'utf8').split('\n');
    const totalLines = all.length;
    const requested = parseInt(opts.from, 10);
    const from = Math.min(Math.max(Number.isFinite(requested) ? requested : 1, 1), Math.max(1, totalLines));
    const to = Math.min(from + PAGE_LINES - 1, totalLines);
    const lines = [];
    for (let n = from; n <= to; n++) lines.push({ n, text: all[n - 1] });
    return {
      path: target.rel,
      parents: parentsOf(target.segments),
      name: path.basename(target.abs),
      size: stat.size,
      totalLines,
      from,
      to,
      pageLines: PAGE_LINES,
      hasPrev: from > 1,
      hasNext: to < totalLines,
      lines
    };
  },

  rawFile(relPath) {
    const target = resolveSafe(relPath);
    const stat = fs.statSync(target.abs);
    if (!stat.isFile()) throw new Error('Not a file');
    if (!isViewable(path.basename(target.abs))) throw new Error('This file type cannot be displayed');
    if (stat.size > MAX_VIEW_BYTES) throw new Error('This file is too large to be displayed');
    return { name: path.basename(target.abs), content: fs.readFileSync(target.abs, 'utf8') };
  },

  searchCode(query, opts = {}) {
    const q = String(query || '').trim();
    if (q.length < 2) return { query: q, results: [], truncated: false, scanned: 0 };
    const wanted = String(opts.ext || '').trim().toLowerCase();
    const max = Math.min(Math.max(parseInt(opts.max, 10) || SEARCH_MAX, 1), SEARCH_MAX);
    const needle = q.toLowerCase();
    const results = [];
    let scanned = 0;
    let truncated = false;
    for (const root of ALLOWED_ROOTS) {
      if (truncated) break;
      walkFiles(root, (rel, name) => {
        if (!isViewable(name)) return true;
        if (wanted && extOf(name) !== wanted) return true;
        let stat;
        try { stat = fs.statSync(path.resolve(ROOT, rel)); } catch (_) { return true; }
        if (stat.size > MAX_VIEW_BYTES) return true;
        scanned++;
        let content;
        try { content = fs.readFileSync(path.resolve(ROOT, rel), 'utf8'); } catch (_) { return true; }
        if (content.toLowerCase().indexOf(needle) < 0) return true;
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().indexOf(needle) < 0) continue;
          results.push({ path: rel, line: i + 1, text: lines[i].trim().slice(0, SEARCH_SNIPPET) });
          if (results.length >= max) { truncated = true; return false; }
        }
        return true;
      });
    }
    return { query: q, results, truncated, scanned };
  },

  moduleMap() {
    const cfg = getConfig();
    const mods = Object.keys((cfg && cfg.modules) || {}).map(k => k.replace(/Mod$/, '')).sort();
    let backend = '';
    try { backend = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'backend.js'), 'utf8'); } catch (_) { backend = ''; }
    const modelFiles = fs.existsSync(path.join(ROOT, 'src', 'models')) ? fs.readdirSync(path.join(ROOT, 'src', 'models')) : [];
    const viewFiles = fs.existsSync(path.join(ROOT, 'src', 'views')) ? fs.readdirSync(path.join(ROOT, 'src', 'views')) : [];
    const stem = (s) => String(s || '').toLowerCase().replace(/s$/, '');
    const pick = (files, name, suffixes) => {
      for (const suf of suffixes) {
        const exact = files.find(f => f.toLowerCase() === `${name.toLowerCase()}${suf}`);
        if (exact) return exact;
      }
      const singular = name.replace(/s$/, '');
      for (const suf of suffixes) {
        const short = files.find(f => f.toLowerCase() === `${singular.toLowerCase()}${suf}`);
        if (short) return short;
      }
      const target = stem(name);
      return files.find(f => {
        const suf = suffixes.find(x => f.toLowerCase().endsWith(x));
        if (!suf) return false;
        const base = stem(f.slice(0, f.length - suf.length));
        return base.startsWith(target) || target.startsWith(base);
      }) || null;
    };
    const testsIndex = new Map();
    const modsDir = path.join(ROOT, 'test', 'mods');
    const indexTests = (dir, prefix) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const rel = `${prefix}/${e.name}`;
        if (!testsIndex.has(e.name)) testsIndex.set(e.name, rel);
        indexTests(path.join(dir, e.name), rel);
      }
    };
    indexTests(modsDir, 'test/mods');
    return mods.map(name => {
      const alias = MODULE_ALIASES[name] || {};
      const routePaths = Array.isArray(alias.paths) && alias.paths.length ? alias.paths : [`/${name}`];
      let routes = 0;
      for (const routePath of routePaths) {
        const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\.(get|post)\\(\\s*["'\`]${escaped}(?=["'/?])`, 'g');
        routes += backend ? (backend.match(re) || []).length : 0;
      }
      const model = alias.model !== undefined ? alias.model : (pick(modelFiles, name, ['_model.js', '_models.js']) ? `src/models/${pick(modelFiles, name, ['_model.js', '_models.js'])}` : null);
      const view = alias.view !== undefined ? alias.view : (pick(viewFiles, name, ['_view.js', '_views.js']) ? `src/views/${pick(viewFiles, name, ['_view.js', '_views.js'])}` : null);
      return {
        name,
        enabled: (cfg.modules || {})[`${name}Mod`] !== 'off',
        model,
        view,
        routes,
        tests: testsIndex.get(name) || testsIndex.get(name.replace(/s$/, '')) || (() => {
          const target = stem(name);
          for (const [dir, rel] of testsIndex) {
            const base = stem(dir);
            if (base.startsWith(target) || target.startsWith(base)) return rel;
          }
          return null;
        })()
      };
    });
  },

  projectStats() {
    const now = Date.now();
    if (statsCache && now - statsCacheAt < STATS_TTL) return statsCache;
    let files = 0;
    let lines = 0;
    let bytes = 0;
    for (const root of ALLOWED_ROOTS) {
      walkFiles(root, (rel, name) => {
        if (!isViewable(name)) return true;
        try {
          const abs = path.resolve(ROOT, rel);
          const stat = fs.statSync(abs);
          if (stat.size > MAX_VIEW_BYTES) return true;
          files++;
          bytes += stat.size;
          lines += fs.readFileSync(abs, 'utf8').split('\n').length;
        } catch (_) {}
        return true;
      });
    }
    const cfg = getConfig();
    const modules = Object.keys((cfg && cfg.modules) || {}).length;
    const translations = path.join(ROOT, 'src', 'client', 'assets', 'translations');
    const languages = fs.existsSync(translations) ? fs.readdirSync(translations).filter(f => /^oasis_[a-z]{2}\.js$/.test(f)).length : 0;
    const testsDir = path.join(ROOT, 'test', 'mods');
    const testMods = fs.existsSync(testsDir) ? fs.readdirSync(testsDir).length : 0;
    let version = '';
    try { version = String(JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'server', 'package.json'), 'utf8')).version || ''); } catch (_) { version = ''; }
    statsCache = { files, lines, bytes, modules, languages, testMods, version, node: process.version };
    statsCacheAt = now;
    return statsCache;
  }
};
