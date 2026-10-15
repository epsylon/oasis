const http = require('http');

const startFakeNextcloud = ({ port = 0, user = 'demo', password = 'secret', host = '127.0.0.1' } = {}) => new Promise((resolve) => {
  const files = new Map();
  const chunks = new Map();
  const shares = [];
  const log = [];
  const authOk = (req) => req.headers.authorization === 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
  const body = (req) => new Promise((done) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => done(Buffer.concat(parts))); });
  const server = http.createServer(async (req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    log.push(`${req.method} ${url}`);
    const send = (code, text = '', headers = {}) => { res.writeHead(code, headers); res.end(text); };
    if (url.startsWith('/s/')) {
      const share = shares.find(s => s.token === url.slice(3));
      return share ? send(200, files.get(share.path), { 'Content-Type': 'application/octet-stream' }) : send(404);
    }
    if (!authOk(req)) return send(401);
    if (req.method === 'GET' && url === '/ocs/v1.php/cloud/user') return send(200, JSON.stringify({ ocs: { meta: { status: 'ok' }, data: { id: user, 'display-name': 'Demo Inhabitant' } } }), { 'Content-Type': 'application/json' });
    if (req.method === 'MKCOL') return send(files.has(url) ? 405 : 201);
    if (req.method === 'PROPFIND') return send(files.has(url) ? 207 : 404);
    if (req.method === 'PUT') {
      const data = await body(req);
      if (url.startsWith(`/remote.php/dav/uploads/${user}/`)) {
        const [, dir, name] = url.match(/^(.*)\/([^/]+)$/);
        if (!chunks.has(dir)) chunks.set(dir, []);
        chunks.get(dir).push({ name, data });
        return send(201);
      }
      files.set(url, data);
      return send(201);
    }
    if (req.method === 'MOVE') {
      const dir = url.replace(/\/\.file$/, '');
      const dest = decodeURIComponent(new URL(req.headers.destination).pathname);
      const parts = (chunks.get(dir) || []).sort((a, b) => a.name.localeCompare(b.name));
      const whole = Buffer.concat(parts.map(p => p.data));
      if (String(req.headers['oc-total-length']) !== String(whole.length)) return send(400);
      files.set(dest, whole);
      chunks.delete(dir);
      return send(201);
    }
    if (req.method === 'POST' && url === '/ocs/v2.php/apps/files_sharing/api/v1/shares') {
      const form = new URLSearchParams((await body(req)).toString());
      const path = `/remote.php/dav/files/${user}${form.get('path')}`;
      if (!files.has(path) || form.get('shareType') !== '3') return send(404);
      const token = `tok${shares.length + 1}`;
      shares.push({ token, path });
      return send(200, JSON.stringify({ ocs: { meta: { status: 'ok' }, data: { url: `http://${host}:${server.address().port}/s/${token}` } } }), { 'Content-Type': 'application/json' });
    }
    send(404);
  });
  server.listen(port, host, () => resolve({
    server,
    port: server.address().port,
    url: `http://${host}:${server.address().port}`,
    user,
    password,
    files,
    shares,
    log,
    close: () => new Promise((done) => server.close(() => done()))
  }));
});

module.exports = { startFakeNextcloud };

if (require.main === module) {
  startFakeNextcloud({ port: Number(process.argv[2]) || 8099 }).then((f) => { console.log(`fake nextcloud ${f.url} user=${f.user} password=${f.password}`); });
}
