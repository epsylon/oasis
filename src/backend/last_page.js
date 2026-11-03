const fs = require('fs');
const path = require('path');

const WRITE_DELAY_MS = 1500;
const MAX_URL = 2000;
const SKIP_RE = /^\/(?:assets|blob|image|avatar|qr|qr-invite|c|pdf\/page|pdf\/embed|player|phone\/video|robots\.txt)(?:\/|$)/;
const DROP_PARAMS = ['layout', 'error', 'errsig', 'keep'];

const keepable = (pathname) => {
  const p = String(pathname || '');
  return p.startsWith('/') && !p.startsWith('//') && p !== '/' && !SKIP_RE.test(p);
};

const urlOf = (pathname, querystring) => {
  const q = new URLSearchParams(String(querystring || ''));
  for (const k of DROP_PARAMS) q.delete(k);
  const s = q.toString();
  return `${pathname}${s ? `?${s}` : ''}`;
};

module.exports = ({ file }) => {
  const read = () => {
    try {
      const v = JSON.parse(fs.readFileSync(file, 'utf8'));
      const url = v && typeof v.url === 'string' ? v.url : '';
      return keepable(url.split('?')[0]) && url.length <= MAX_URL ? url : null;
    } catch (_) { return null; }
  };
  let last = read();
  let pending = last;
  let timer = null;
  const write = () => {
    timer = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ url: last, at: Date.now() }));
    } catch (_) {}
  };
  return {
    record(pathname, querystring) {
      if (!keepable(pathname)) return;
      const url = urlOf(pathname, querystring);
      if (url.length > MAX_URL) return;
      pending = null;
      if (url === last) return;
      last = url;
      if (!timer) { timer = setTimeout(write, WRITE_DELAY_MS); if (timer.unref) timer.unref(); }
    },
    takeRestore() {
      const url = pending;
      pending = null;
      return url;
    },
    flush() {
      if (timer) { clearTimeout(timer); write(); }
    }
  };
};
module.exports.keepable = keepable;
module.exports.urlOf = urlOf;
