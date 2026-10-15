const fs = require('fs');
const path = require('path');
const { statePath } = require('../configs/state-manager');

const ACCOUNT_PATH = statePath('nextcloud-account.json');
const CHUNK_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15000;
const CHUNK_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_FOLDER = 'Oasis';

const readAccount = () => {
  try {
    const a = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));
    return a && a.server && a.user && a.password ? a : null;
  } catch (_) { return null; }
};
const writeAccount = (a) => {
  fs.mkdirSync(path.dirname(ACCOUNT_PATH), { recursive: true });
  fs.writeFileSync(ACCOUNT_PATH, JSON.stringify(a), { mode: 0o600 });
};
const normalizeServer = (v) => {
  let s = String(v || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return '';
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  } catch (_) { return ''; }
};
const cleanFolder = (v) => String(v || '').trim().replace(/^\/+|\/+$/g, '').split('/').map(s => s.trim()).filter(Boolean).join('/') || DEFAULT_FOLDER;
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
const safeName = (v) => String(v || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 120) || 'file';
const pad = (n) => String(n).padStart(15, '0');
const readRange = async (file, start, end) => {
  const fh = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.alloc(end - start);
    let got = 0;
    while (got < buf.length) {
      const { bytesRead } = await fh.read(buf, got, buf.length - got, start + got);
      if (!bytesRead) break;
      got += bytesRead;
    }
    return got === buf.length ? buf : buf.subarray(0, got);
  } finally { await fh.close(); }
};

module.exports = ({ isPublic = false } = {}) => {
  const auth = (a) => 'Basic ' + Buffer.from(`${a.user}:${a.password}`).toString('base64');
  const call = async (a, method, url, { headers = {}, body, timeout = REQUEST_TIMEOUT_MS } = {}) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      return await fetch(url, { method, headers: { Authorization: auth(a), 'OCS-APIRequest': 'true', ...headers }, body, signal: ctl.signal, redirect: 'manual' });
    } finally { clearTimeout(t); }
  };
  const davFiles = (a) => `${a.server}/remote.php/dav/files/${encodeURIComponent(a.user)}`;
  const davUploads = (a) => `${a.server}/remote.php/dav/uploads/${encodeURIComponent(a.user)}`;
  const targetUrl = (a, name) => `${davFiles(a)}/${encPath(a.folder)}/${encodeURIComponent(name)}`;
  const whoami = async (a) => {
    let res;
    try { res = await call(a, 'GET', `${a.server}/ocs/v1.php/cloud/user?format=json`); } catch (_) { throw new Error('nextcloudErrConnect'); }
    if (!res.ok) throw new Error('nextcloudErrConnect');
    let data = null;
    try { data = await res.json(); } catch (_) {}
    const d = data && data.ocs && data.ocs.data;
    if (!d || !d.id) throw new Error('nextcloudErrConnect');
    return { id: String(d.id), displayName: String(d['display-name'] || d.displayname || d.id) };
  };
  const mkcol = async (a, url) => {
    const res = await call(a, 'MKCOL', url);
    if (!(res.ok || res.status === 405)) throw new Error('nextcloudErrUpload');
  };
  const ensureFolder = async (a) => {
    let cur = davFiles(a);
    for (const seg of a.folder.split('/')) { cur += `/${encodeURIComponent(seg)}`; await mkcol(a, cur); }
  };
  const exists = async (a, url) => {
    const res = await call(a, 'PROPFIND', url, { headers: { Depth: '0' } });
    return res.status === 207 || res.status === 200;
  };
  const freeName = async (a, name) => {
    if (!(await exists(a, targetUrl(a, name)))) return name;
    const dot = name.lastIndexOf('.');
    const stamp = Date.now().toString(36);
    return dot > 0 ? `${name.slice(0, dot)}-${stamp}${name.slice(dot)}` : `${name}-${stamp}`;
  };
  const putWhole = async (a, filePath, size, name) => {
    const res = await call(a, 'PUT', targetUrl(a, name), { body: await readRange(filePath, 0, size), headers: { 'Content-Type': 'application/octet-stream' }, timeout: CHUNK_TIMEOUT_MS });
    if (!res.ok) throw new Error('nextcloudErrUpload');
  };
  const putChunked = async (a, filePath, size, name) => {
    const base = `${davUploads(a)}/oasis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await mkcol(a, base);
    for (let start = 0; start < size; start += CHUNK_BYTES) {
      const end = Math.min(size, start + CHUNK_BYTES);
      const res = await call(a, 'PUT', `${base}/${pad(start)}-${pad(end - 1)}`, { body: await readRange(filePath, start, end), headers: { 'Content-Type': 'application/octet-stream' }, timeout: CHUNK_TIMEOUT_MS });
      if (!res.ok) throw new Error('nextcloudErrUpload');
    }
    const res = await call(a, 'MOVE', `${base}/.file`, { headers: { Destination: targetUrl(a, name), 'OC-Total-Length': String(size) }, timeout: CHUNK_TIMEOUT_MS });
    if (!res.ok) throw new Error('nextcloudErrUpload');
  };
  const share = async (a, name) => {
    const body = new URLSearchParams({ path: `/${a.folder}/${name}`, shareType: '3' });
    const res = await call(a, 'POST', `${a.server}/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json`, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    if (!res.ok) throw new Error('nextcloudErrShare');
    let data = null;
    try { data = await res.json(); } catch (_) {}
    const url = data && data.ocs && data.ocs.data && data.ocs.data.url;
    if (!url || !/^https?:\/\//i.test(String(url))) throw new Error('nextcloudErrShare');
    return String(url);
  };

  return {
    getAccount() {
      const a = readAccount();
      return a ? { server: a.server, user: a.user, folder: a.folder, displayName: a.displayName || a.user } : null;
    },

    async connect({ server, user, password, folder } = {}) {
      if (isPublic) throw new Error('nextcloudErrConnect');
      const a = { server: normalizeServer(server), user: String(user || '').trim(), password: String(password || ''), folder: cleanFolder(folder) };
      if (!a.server || !a.user || !a.password) throw new Error('nextcloudErrConnect');
      const me = await whoami(a);
      a.displayName = me.displayName;
      await ensureFolder(a);
      writeAccount(a);
      return this.getAccount();
    },

    disconnect() {
      try { fs.unlinkSync(ACCOUNT_PATH); } catch (_) {}
    },

    async upload({ filePath, size, name } = {}) {
      if (isPublic) throw new Error('nextcloudErrUpload');
      const a = readAccount();
      if (!a) throw new Error('nextcloudErrConnect');
      const bytes = Number(size) || 0;
      if (!filePath || !(bytes > 0)) throw new Error('nextcloudErrUpload');
      const final = await freeName(a, safeName(name));
      if (bytes <= CHUNK_BYTES) await putWhole(a, filePath, bytes, final);
      else await putChunked(a, filePath, bytes, final);
      const url = await share(a, final);
      return { url, name: final, size: bytes };
    }
  };
};

module.exports.CHUNK_BYTES = CHUNK_BYTES;
