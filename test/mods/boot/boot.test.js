const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { eq, ok } = require('../../helpers/assert');

const ROOT = path.join(__dirname, '..', '..', '..');
const BOOT_MS = 120000;
const port = () => 30000 + Math.floor(Math.random() * 20000);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const EMPTY_NODE_ROUTES = ['/', '/activity', '/audios', '/agenda', '/banking', '/blockexplorer', '/blogs', '/bookmarks', '/c', '/c/rss', '/calendars', '/campaigns', '/chats', '/courts', '/cv', '/documents', '/emergencies', '/events', '/favorites', '/feed', '/files', '/forum', '/games', '/graphos', '/housing', '/images', '/industry', '/inhabitants', '/invites', '/jobs', '/larp', '/logs', '/maps', '/market', '/mentions', '/modules', '/multiverse', '/opinions', '/pads', '/parliament', '/peers', '/pixelia', '/podcasts', '/polls', '/profile', '/projects', '/publish', '/reports', '/rooms', '/school', '/search', '/settings', '/shops', '/stats', '/supporters', '/tags', '/torrents', '/transfers', '/trending', '/tribes', '/videos', '/votes', '/wallet', '/wiki'];

describe('boot: the app starts', (t) => {
  t('backend.js loads every model and route and answers on its port', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-boot-'));
    const web = port();
    const env = { PATH: process.env.PATH, LANG: process.env.LANG || 'C.UTF-8', HOME: dir, TMPDIR: os.tmpdir(), ssb_path: dir, ssb_port: String(port()), OASIS_AI_PORT: String(port()), OASIS_NETWORK_PAUSED: '1', NODE_NO_WARNINGS: '1' };
    const logFile = path.join(dir, 'app.log');
    const logFd = fs.openSync(logFile, 'a');
    const app = spawn(process.execPath, ['backend.js', `--port=${web}`, '--no-open'], { cwd: path.join(ROOT, 'src', 'backend'), env, detached: true, stdio: ['ignore', logFd, logFd] });
    let exited = null;
    app.on('exit', (code, signal) => { exited = `${code}/${signal}`; });
    const log = () => { try { return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).slice(-8).join(' | '); } catch (_) { return ''; } };
    try {
      const t0 = Date.now();
      let status = 0;
      while (Date.now() - t0 < BOOT_MS && exited === null) {
        try { const r = await fetch(`http://localhost:${web}/modules`, { signal: AbortSignal.timeout(5000) }); await r.body?.cancel(); status = r.status; if (status === 200) break; } catch (_) {}
        await sleep(1000);
      }
      eq(exited, null, `the process stays alive (log: ${log()})`);
      eq(status, 200, `the modules page answers (log: ${log()})`);
      const robots = await (await fetch(`http://localhost:${web}/robots.txt`, { signal: AbortSignal.timeout(5000) })).text();
      ok(robots.includes('Allow: /c/') && robots.includes('Disallow: /') && /Sitemap: https?:\/\/[^\n]+\/c\/sitemap\.xml/.test(robots), `robots.txt opens the clearnet and names the sitemap (${robots.replace(/\n/g, ' | ')})`);
      const sitemap = await fetch(`http://localhost:${web}/c/sitemap.xml`, { signal: AbortSignal.timeout(15000) });
      const xml = await sitemap.text();
      ok(sitemap.status === 200 && xml.includes('<urlset') && /<loc>https?:\/\/[^<]+\/c<\/loc>/.test(xml), 'the sitemap answers with the hub address');
      const broken = [];
      for (const route of EMPTY_NODE_ROUTES) {
        try {
          const r = await fetch(`http://localhost:${web}${route}`, { signal: AbortSignal.timeout(20000), redirect: 'manual' });
          await r.body?.cancel();
          if (r.status >= 500) broken.push(`${route}=${r.status}`);
        } catch (e) { broken.push(`${route}=${e && e.name === 'TimeoutError' ? 'timeout' : (e && e.message)}`); }
      }
      eq(broken.join(', '), '', `every page answers on a node without content (log: ${log()})`);
    } finally {
      try { process.kill(-app.pid, 'SIGTERM'); } catch (_) {}
      await sleep(1500);
      try { process.kill(-app.pid, 'SIGKILL'); } catch (_) {}
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
  });
});
