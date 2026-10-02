#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'src', 'server');
const NM = path.join(SERVER, 'node_modules');
const BASE = path.join(ROOT, 'src', 'base', 'node_modules');
const AI_DIR = path.join(ROOT, 'src', 'AI');
const AI_NM = path.join(AI_DIR, 'node_modules');
const LLAMA_ROOTS = ['node-llama-cpp'];
const EMBED_ROOTS = ['@xenova/transformers', 'onnxruntime-node', 'onnxruntime-common', 'onnxruntime-web'];
const AI_ROOTS = [...LLAMA_ROOTS, ...EMBED_ROOTS];

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const LINK = args.includes('--link');
const PRUNE = args.includes('--prune');
if (args.includes('-h') || args.includes('--help')) {
  console.log(`Usage: node scripts/build-base.js [--dry] [--link]
Splits a full src/server/node_modules (as produced by "npm ci") into:
  src/base/node_modules/  the runtime core Oasis ships inside the repository
  src/AI/node_modules/ the AI stack (llama + embeddings), installed on demand
and writes the matching package-lock.json files. Dev-only and unused packages are left behind.
  --dry   only report what would happen
  --link  afterwards rename the leftovers to node_modules.full and link src/server/node_modules -> ../base/node_modules
  --prune work on the existing src/base/node_modules instead: drop every package no longer reachable from the
          dependencies declared in src/server/package.json and rewrite the lockfile (use after removing a root dependency)`);
  process.exit(0);
}

const log = (m) => console.log(`[base] ${m}`);
const mb = (b) => `${(b / 1048576).toFixed(0)} MB`;

const dirSize = (d) => {
  let s = 0;
  const walk = (p) => {
    let entries = [];
    try { entries = fs.readdirSync(p, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const f = path.join(p, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(f);
      else { try { s += fs.statSync(f).size; } catch (_) {} }
    }
  };
  walk(d);
  return s;
};

let nmStat = null;
try { nmStat = fs.lstatSync(NM); } catch (_) {}
if (!PRUNE && (!nmStat || nmStat.isSymbolicLink() || !nmStat.isDirectory())) {
  console.error('src/server/node_modules must be a real directory produced by "npm ci" (not a link).');
  process.exit(1);
}
const lockPath = path.join(SERVER, 'package-lock.json');
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
if (lock.lockfileVersion < 2 || !lock.packages) { console.error('package-lock.json v2/v3 required'); process.exit(1); }
const pkgs = lock.packages;
const root = pkgs[''];

const TREE = PRUNE ? path.join(BASE, '..') : SERVER;
const exists = (key) => { try { return fs.statSync(path.join(TREE, key)).isDirectory(); } catch (_) { return false; } };
const resolveDep = (fromKey, name) => {
  let base = fromKey;
  while (true) {
    const cand = base ? `${base}/node_modules/${name}` : `node_modules/${name}`;
    if (pkgs[cand] && exists(cand)) return cand;
    if (!base) return null;
    const i = base.lastIndexOf('/node_modules/');
    base = i === -1 ? '' : base.slice(0, i);
  }
};
const SKIP_OPTIONAL_OF = ['pdfjs-dist'];
const depsOf = (key) => {
  const p = pkgs[key] || {};
  const name = key.replace(/^.*node_modules\//, '');
  const meta = p.peerDependenciesMeta || {};
  const peers = Object.keys(p.peerDependencies || {}).filter(n => !(meta[n] && meta[n].optional));
  const names = new Set([
    ...Object.keys(p.dependencies || {}),
    ...(SKIP_OPTIONAL_OF.includes(name) ? [] : Object.keys(p.optionalDependencies || {})),
    ...peers
  ]);
  return [...names];
};
const closure = (rootNames) => {
  const seen = new Set();
  const queue = [];
  for (const n of rootNames) { const k = resolveDep('', n); if (k) queue.push(k); else log(`root ${n} is not installed, skipped`); }
  while (queue.length) {
    const k = queue.shift();
    if (seen.has(k)) continue;
    seen.add(k);
    for (const d of depsOf(k)) { const r = resolveDep(k, d); if (r && !seen.has(r)) queue.push(r); }
  }
  return seen;
};

if (PRUNE) {
  const declared = JSON.parse(fs.readFileSync(path.join(SERVER, 'package.json'), 'utf8'));
  const roots = [...Object.keys(declared.dependencies || {}), ...Object.keys(declared.optionalDependencies || {})].filter(n => !AI_ROOTS.includes(n));
  const keep = closure(roots);
  const present = Object.keys(pkgs).filter(k => k.startsWith('node_modules/') && exists(k));
  const drop = present.filter(k => !keep.has(k)).sort((a, b) => b.length - a.length);
  const dropTop = drop.filter(k => /^node_modules\/(@[^/]+\/)?[^/]+$/.test(k));
  log(`keeping ${keep.size} packages, dropping ${drop.length} (${dropTop.length} top-level, ${mb(dropTop.reduce((s, k) => s + dirSize(path.join(TREE, k)), 0))}): ${dropTop.map(k => k.replace('node_modules/', '')).join(', ') || 'nothing'}`);
  if (DRY) process.exit(0);
  for (const k of drop) fs.rmSync(path.join(TREE, k), { recursive: true, force: true });
  const newRoot = { ...root, dependencies: { ...(declared.dependencies || {}) } };
  if (declared.optionalDependencies && Object.keys(declared.optionalDependencies).length) newRoot.optionalDependencies = { ...declared.optionalDependencies }; else delete newRoot.optionalDependencies;
  if (declared.devDependencies) newRoot.devDependencies = { ...declared.devDependencies };
  const out = { ...lock, packages: { '': newRoot } };
  for (const k of Object.keys(pkgs).sort()) if (keep.has(k)) { const e = { ...pkgs[k] }; delete e.dev; delete e.extraneous; out.packages[k] = e; }
  fs.writeFileSync(lockPath, JSON.stringify(out, null, 2) + '\n');
  log(`src/base/node_modules: ${mb(dirSize(BASE))}; lockfile rewritten with ${keep.size} entries`);
  process.exit(0);
}

const rootProd = Object.keys(root.dependencies || {}).filter(n => !AI_ROOTS.includes(n));
const rootOptional = Object.keys(root.optionalDependencies || {}).filter(n => !AI_ROOTS.includes(n));
const core = closure([...rootProd, ...rootOptional]);
const ai = closure(AI_ROOTS);
const embed = closure(EMBED_ROOTS);
const shared = [...core].filter(k => ai.has(k));
const all = Object.keys(pkgs).filter(k => k.startsWith('node_modules/') && exists(k));
const leftover = all.filter(k => !core.has(k) && !ai.has(k));
const topOf = (k) => /^node_modules\/(@[^/]+\/)?[^/]+$/.test(k) ? k : null;
const topCore = [...core].filter(topOf);
const topAi = [...ai].filter(topOf);

const sumSize = (keys) => keys.reduce((s, k) => s + dirSize(path.join(SERVER, k)), 0);
log(`core: ${core.size} packages (${topCore.length} top-level), ${mb(sumSize(topCore))}`);
log(`ai: ${ai.size} packages (${topAi.length} top-level), ${mb(sumSize(topAi))}, of which shared with core: ${shared.length}`);
log(`left behind (dev tools, unused): ${leftover.filter(topOf).length} top-level packages, ${mb(sumSize(leftover.filter(topOf)))}`);
if (DRY) {
  log('largest in core: ' + topCore.map(k => [k, dirSize(path.join(SERVER, k))]).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, s]) => `${k.replace('node_modules/', '')} ${mb(s)}`).join(', '));
  log('dry run, nothing written. Largest left behind: ' + leftover.filter(topOf).map(k => [k, dirSize(path.join(SERVER, k))]).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, s]) => `${k.replace('node_modules/', '')} ${mb(s)}`).join(', '));
  process.exit(0);
}

const rel = (key) => key.replace(/^node_modules\//, '');
const copyDir = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.cpSync(src, dst, { recursive: true, verbatimSymlinks: true }); };
const moveDir = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); try { fs.renameSync(src, dst); } catch (_) { fs.cpSync(src, dst, { recursive: true, verbatimSymlinks: true }); fs.rmSync(src, { recursive: true, force: true }); } };
const pruneNested = (destRoot, topKey, keep) => {
  const walk = (dir, keyPrefix) => {
    const nm = path.join(dir, 'node_modules');
    let entries = [];
    try { entries = fs.readdirSync(nm, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (!e.isDirectory()) { if (e.name === '.bin' || e.name === '.package-lock.json') { try { fs.rmSync(path.join(nm, e.name), { recursive: true, force: true }); } catch (_) {} } continue; }
      const names = e.name.startsWith('@') ? fs.readdirSync(path.join(nm, e.name)).map(n => `${e.name}/${n}`) : [e.name];
      for (const name of names) {
        const key = `${keyPrefix}/node_modules/${name}`;
        const full = path.join(nm, name);
        if (!keep.has(key)) fs.rmSync(full, { recursive: true, force: true });
        else walk(full, key);
      }
    }
  };
  walk(destRoot, topKey);
};

for (const d of [BASE, AI_NM]) { if (fs.existsSync(d)) { console.error(`${d} already exists; remove it first.`); process.exit(1); } }
fs.mkdirSync(BASE, { recursive: true });
fs.mkdirSync(AI_NM, { recursive: true });

let moved = 0, copied = 0;
for (const key of topAi) {
  const src = path.join(SERVER, key);
  const dst = path.join(AI_NM, rel(key));
  if (core.has(key)) { copyDir(src, dst); copied++; } else { moveDir(src, dst); moved++; }
  pruneNested(dst, key, ai);
}
for (const key of topCore) {
  const src = path.join(SERVER, key);
  const dst = path.join(BASE, rel(key));
  moveDir(src, dst); moved++;
  pruneNested(dst, key, core);
}
log(`placed ${moved} moved + ${copied} copied top-level packages`);

const version = '1.0.0';
const pick = (keys, markOptional) => {
  const out = {};
  for (const k of [...keys].sort()) {
    const entry = { ...pkgs[k] };
    delete entry.dev;
    delete entry.extraneous;
    if (markOptional && markOptional.has(k)) entry.optional = true; else delete entry.optional;
    out[k] = entry;
  }
  return out;
};

const serverPkgPath = path.join(SERVER, 'package.json');
const serverPkg = JSON.parse(fs.readFileSync(serverPkgPath, 'utf8'));
const aiVersions = {};
for (const n of AI_ROOTS) {
  const v = (serverPkg.dependencies || {})[n] || (serverPkg.optionalDependencies || {})[n];
  if (v) aiVersions[n] = v;
  if (serverPkg.dependencies) delete serverPkg.dependencies[n];
  if (serverPkg.optionalDependencies) delete serverPkg.optionalDependencies[n];
}
fs.writeFileSync(serverPkgPath, JSON.stringify(serverPkg, null, 2) + '\n');

const serverRoot = { ...root };
serverRoot.dependencies = { ...(root.dependencies || {}) };
serverRoot.optionalDependencies = { ...(root.optionalDependencies || {}) };
for (const n of AI_ROOTS) { delete serverRoot.dependencies[n]; delete serverRoot.optionalDependencies[n]; }
if (!Object.keys(serverRoot.optionalDependencies).length) delete serverRoot.optionalDependencies;
const serverLock = { ...lock, packages: { '': serverRoot, ...pick(core) } };
delete serverLock.dependencies;
fs.writeFileSync(lockPath, JSON.stringify(serverLock, null, 2) + '\n');

const aiPkg = {
  name: '@krakenslab/oasis-ai',
  version,
  private: true,
  description: 'AI stack of Oasis (assistant and embeddings); installed only when AI features are enabled',
  dependencies: {},
  optionalDependencies: {}
};
for (const n of EMBED_ROOTS) if (aiVersions[n]) aiPkg.dependencies[n] = aiVersions[n];
for (const n of LLAMA_ROOTS) if (aiVersions[n]) aiPkg.optionalDependencies[n] = aiVersions[n];
const overrides = Object.fromEntries(Object.entries(serverPkg.overrides || {}).filter(([k]) => /^onnxruntime/.test(k)));
if (Object.keys(overrides).length) aiPkg.overrides = overrides;
fs.writeFileSync(path.join(AI_DIR, 'package.json'), JSON.stringify(aiPkg, null, 2) + '\n');
const llamaOnly = new Set([...ai].filter(k => !embed.has(k)));
const aiLock = {
  name: aiPkg.name,
  version,
  lockfileVersion: lock.lockfileVersion,
  requires: true,
  packages: { '': { name: aiPkg.name, version, dependencies: aiPkg.dependencies, optionalDependencies: aiPkg.optionalDependencies }, ...pick(ai, llamaOnly) }
};
fs.writeFileSync(path.join(AI_DIR, 'package-lock.json'), JSON.stringify(aiLock, null, 2) + '\n');
log(`wrote src/server/package-lock.json (${core.size} entries) and src/AI/package.json + package-lock.json (${ai.size} entries, ${llamaOnly.size} optional)`);
log(`src/base/node_modules: ${mb(dirSize(BASE))}; src/AI/node_modules: ${mb(dirSize(AI_NM))}`);

if (LINK) {
  const full = `${NM}.full`;
  fs.renameSync(NM, full);
  fs.symlinkSync(path.join('..', 'base', 'node_modules'), NM, 'dir');
  log(`linked src/server/node_modules -> ../base/node_modules; leftovers kept in ${path.relative(ROOT, full)} (safe to delete)`);
}
