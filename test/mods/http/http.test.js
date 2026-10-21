const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { eq, ok } = require('../../helpers/assert');

const ROOT = path.join(__dirname, '..', '..', '..');
const BOOT_MS = 180000;
const REQUEST_MS = 30000;
const LINKED_MAX = 1500;
const FOLLOW_MS = 10000;
const SKIP = /download=1|\/phone\/video|\/c\/rooms\/[^/]+\/[^/?]+|\/rooms\/recordings\/|\/export|\/backup|\/logout|\/qr|\/wallet|\/c\/rss|\/rss|\/blob\/|\/c\/blob\/|\/maptiles|\/assets\/|\/games\/[a-z0-9]+\/?$|\/game-assets|\/settings\/|\/welcome|\/inbox|\/peers|\/invites|\/multiverse|\/ai\b/;
const port = () => 30000 + Math.floor(Math.random() * 20000);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const bootApp = async (prepare = () => {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-http-'));
  prepare(dir);
  const web = port();
  const base = `http://localhost:${web}`;
  const env = { PATH: process.env.PATH, LANG: process.env.LANG || 'C.UTF-8', HOME: dir, TMPDIR: os.tmpdir(), ssb_path: dir, ssb_port: String(port()), OASIS_AI_PORT: String(port()), OASIS_NETWORK_PAUSED: '1', NODE_NO_WARNINGS: '1' };
  const logFile = path.join(dir, 'app.log');
  const logFd = fs.openSync(logFile, 'a');
  const app = spawn(process.execPath, ['backend.js', `--port=${web}`, '--no-open'], { cwd: path.join(ROOT, 'src', 'backend'), env, detached: true, stdio: ['ignore', logFd, logFd] });
  const appLog = () => { try { return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).slice(-12).join(' | '); } catch (_) { return ''; } };
  const fetchStatus = async (p, opts = {}) => {
    try {
      const r = await fetch(base + p, { redirect: 'manual', signal: AbortSignal.timeout(REQUEST_MS), ...opts });
      if (opts.body !== undefined || opts.text === false) { await r.body?.cancel(); return { status: r.status, body: '' }; }
      return { status: r.status, body: await r.text() };
    } catch (e) { return { status: `${e.name}`, body: '' }; }
  };
  const post = (p, body, from) => fetchStatus(p, { method: 'POST', body, headers: { Origin: base, Referer: `${base}${from}` } });
  const stop = async () => {
    try { process.kill(-app.pid, 'SIGTERM'); } catch (_) {}
    await sleep(1500);
    try { process.kill(-app.pid, 'SIGKILL'); } catch (_) {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  };
  try {
    const t0 = Date.now();
    let up = false;
    while (Date.now() - t0 < BOOT_MS) { if ((await fetchStatus('/modules')).status === 200) { up = true; break; } await sleep(1000); }
    ok(up, `the app answers (its log: ${appLog()})`);
    let skipped = 0;
    while (Date.now() - t0 < BOOT_MS) { skipped = (await post('/welcome/dismiss', new URLSearchParams(), '/welcome')).status; if (skipped === 302) break; await sleep(1000); }
    eq(skipped, 302, 'the welcome can be skipped once the node is ready');
  } catch (e) { await stop(); throw e; }
  return { base, fetchStatus, post, stop };
};

describe('http: the running app', (t) => {
  t('serves every module page, the pages they link and the pictures they show', async () => {
    const { fetchStatus, post, stop } = await bootApp();
    try {
      const sharp = require('../../../src/server/node_modules/sharp');
      const jpeg = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: { r: 200, g: 80, b: 40 } } }).jpeg().toBuffer();
      const form = new FormData();
      form.append('title', 'A picture');
      form.append('description', 'x');
      form.append('image', new Blob([jpeg], { type: 'image/jpeg' }), 'a.jpg');
      const created = await post('/images/create', form, '/images?filter=create');
      eq(created.status, 302, 'an image can be published');
      const doc = new FormData();
      doc.append('title', 'A document');
      doc.append('description', 'x');
      doc.append('document', new Blob([require('../../../src/backend/pdf').buildDocumentPdf({ title: 'OASIS', sections: [{ kind: 'kv', label: 'Row', value: 'text' }] })], { type: 'application/pdf' }), 'a.pdf');
      eq((await post('/documents/create', doc, '/documents?filter=create')).status, 302, 'a PDF can be published');
      const results = new Map();
      const check = async (p, text = true) => { const r = await fetchStatus(p, { text }); results.set(p, r.status); return r.body; };
      const hrefs = (html) => [...html.matchAll(/href="(\/[^"#]*)"/g)].map(m => unescape(m[1]));
      const imgs = (html) => [...html.matchAll(/<img[^>]*src="(\/[^"]*)"/g)].map(m => unescape(m[1]));
      const frames = (html) => [...html.matchAll(/<(?:iframe[^>]*src|object[^>]*data)="(\/[^"]*)"/g)].map(m => unescape(m[1]));
      const modules = await check('/modules');
      const seeds = new Set(['/activity', '/trending', '/opinions', '/search', '/c', '/agenda', '/profile', '/inhabitants', '/stats', '/blockexplorer', '/mentions', '/images', '/images?filter=gallery', '/documents']);
      for (const h of hrefs(modules)) if (!SKIP.test(h) && h.split('?')[0].split('/').length === 2) seeds.add(h.split('?')[0]);
      const pages = [];
      for (const p of seeds) pages.push(await check(p));
      const linked = new Set();
      const pictures = new Set();
      const embedded = new Set();
      for (const html of pages) {
        for (const h of hrefs(html)) if (!SKIP.test(h) && !results.has(h)) linked.add(h);
        for (const s of imgs(html)) pictures.add(s);
        for (const f of frames(html)) embedded.add(f);
      }
      ok([...embedded].some(f => f.startsWith('/pdf/embed?')), 'a published PDF is shown in the viewer');
      for (const f of embedded) for (const s of imgs(await check(f))) pictures.add(s);
      ok([...pictures].some(p => p.startsWith('/pdf/page?')), 'the viewer shows the pages as pictures');
      for (const bad of ['/pdf/embed?src=%2Fetc%2Fpasswd', '/pdf/embed', '/pdf?src=nothing']) {
        const r = await fetchStatus(bad);
        eq(r.status, 200, `${bad} answers with a page of Oasis, never a browser error`);
        ok(r.body.includes('pdf-message'), `${bad} says why`);
      }
      for (const p of [...linked].slice(0, LINKED_MAX)) await check(p, false);
      for (const p of pictures) await check(p, false);
      ok([...pictures].some(p => /^\/image\/\d+\//.test(p)), 'the pages show resized pictures');
      const broken = [...results].filter(([, s]) => !(s === 200 || s === 301 || s === 302 || s === 303));
      eq(broken.length, 0, `broken: ${broken.slice(0, 15).map(([p, s]) => `${s} ${p}`).join(' | ')}`);
    } finally {
      await stop();
    }
  });
});

describe('http: PUBs', (t) => {
  t('a PUB taken out of the federation comes back at once, by following it or importing it', async () => {
    const keyOf = () => `@${require('crypto').randomBytes(32).toString('base64')}.ed25519`;
    const followed = { host: '192.0.2.1', port: 8008, key: keyOf() };
    const imported = { host: '192.0.2.2', port: 8008, key: keyOf() };
    const { fetchStatus, post, stop } = await bootApp((dir) => fs.writeFileSync(path.join(dir, 'gossip.json'), JSON.stringify([followed, imported])));
    try {
      const unfederated = async () => Number(((await fetchStatus('/invites')).body.match(/Unfederated \((\d+)\)/) || [])[1]);
      for (const pub of [followed, imported]) eq((await post('/settings/invite/unfollow', new URLSearchParams({ key: pub.key }), '/invites')).status, 302);
      eq(await unfederated(), 2, 'both are listed as unfederated');
      const t0 = Date.now();
      eq((await post('/settings/invite/follow', new URLSearchParams({ key: followed.key, host: followed.host, port: String(followed.port) }), '/invites')).status, 302, 'following one answers');
      ok(Date.now() - t0 < FOLLOW_MS, 'without waiting for a PUB that does not answer');
      eq(await unfederated(), 1, 'the followed one is federated again');
      const contacts = (await fetchStatus('/blockexplorer?filter=contact')).body;
      const latest = unescape((contacts.match(/href="(\/blockexplorer\/block\/[^"?]+)/) || [])[1] || '');
      const datagram = unescape((await fetchStatus(`${latest}?view=datagram`)).body).replace(/<[^>]+>/g, '').replace(/\s+/g, '');
      ok(datagram.includes('CONTENT:contact,following,blocking'), 'and a follow message is published for it');
      const line = `net:${imported.host}:${imported.port}~shs:${imported.key.slice(1, -8)}`;
      eq((await post('/peers/import', new URLSearchParams({ peerList: line }), '/peers?filter=connections')).status, 302, 'importing the other answers');
      eq(await unfederated(), 0, 'the imported one is federated again');
      ok((await fetchStatus('/peers?filter=connections')).body.includes(imported.host), 'and shows up among the connections');
    } finally {
      await stop();
    }
  });
});

describe('http: settings', (t) => {
  t('the simultaneous connections are saved within their limits', async () => {
    const { CONNECTIONS_MIN, CONNECTIONS_MAX, CONNECTIONS_DEFAULT } = require('../../../src/configs/config-manager');
    const { fetchStatus, post, stop } = await bootApp();
    try {
      const shown = async () => Number(((await fetchStatus('/settings')).body.match(/name="connections"[^>]*value="(\d+)"|value="(\d+)"[^>]*name="connections"/) || []).slice(1).find(Boolean));
      eq(await shown(), CONNECTIONS_DEFAULT, 'the default when nothing is chosen');
      for (const [asked, kept] of [[CONNECTIONS_MAX * 10, CONNECTIONS_MAX], [0, CONNECTIONS_MIN], [CONNECTIONS_MIN + 2, CONNECTIONS_MIN + 2]]) {
        eq((await post('/settings/connections', new URLSearchParams({ connections: String(asked) }), '/settings')).status, 302);
        eq(await shown(), kept, `${asked} is kept as ${kept}`);
      }
    } finally {
      await stop();
    }
  });
});
