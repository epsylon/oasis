const fs = require('fs');
const path = require('path');
const { getConfig, saveConfig } = require('../configs/config-manager.js');

const ACCOUNTS_PATH = path.join(__dirname, '..', 'configs', 'fediverse-accounts.json');
const FETCH_TIMEOUT_MS = 8000;
const TIMELINE_CACHE_MS = 60 * 1000;
const TIMELINE_LIMIT = 40;
const MEDIA_PROCESS_TIMEOUT_MS = 60000;
const MEDIA_POLL_INTERVAL_MS = 1500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SPOOF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
const spoofHeaders = (accept) => ({
  'User-Agent': SPOOF_UA,
  'Accept': accept || '*/*',
  'Accept-Language': 'en-US,en;q=0.5',
  'DNT': '1'
});

const isPrivateHost = (hostname) => {
  const h = String(hostname || '').toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
};

module.exports = ({ isPublic } = {}) => {
  const cache = new Map();
  let mediaHosts = new Set();

  const readStore = () => {
    try {
      const obj = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, 'utf8'));
      return obj && typeof obj === 'object' ? obj : {};
    } catch (_) {
      return {};
    }
  };

  const writeStore = (obj) => {
    const tmp = ACCOUNTS_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, ACCOUNTS_PATH);
    try { fs.chmodSync(ACCOUNTS_PATH, 0o600); } catch (_) {}
  };

  const getMastodon = () => readStore().mastodon || null;

  const setModuleFlag = (value) => {
    try {
      const cfg = getConfig();
      if (cfg.modules && cfg.modules.fediverseMod !== value) {
        cfg.modules.fediverseMod = value;
        saveConfig(cfg);
      }
    } catch (_) {}
  };

  const normalizeInstance = (raw) => {
    let s = String(raw || '').trim();
    if (!s) throw new Error('fediverseErrInstance');
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    let u;
    try { u = new URL(s); } catch (_) { throw new Error('fediverseErrInstance'); }
    if (u.protocol !== 'https:') throw new Error('fediverseErrInstance');
    if (isPrivateHost(u.hostname)) throw new Error('fediverseErrInstance');
    return u.origin;
  };

  const apiFetch = async (instance, token, pathName, opts = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const headers = Object.assign(spoofHeaders('application/json'), { Authorization: `Bearer ${token}` }, opts.headers || {});
      const res = await fetch(`${instance}${pathName}`, { ...opts, headers, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(timer);
    }
  };

  const proxify = (remoteUrl) => {
    if (typeof remoteUrl !== 'string' || !remoteUrl) return '';
    try {
      const u = new URL(remoteUrl);
      if (u.protocol !== 'https:') return '';
      mediaHosts.add(u.host);
      return `/fediverse/media?u=${encodeURIComponent(remoteUrl)}`;
    } catch (_) {
      return '';
    }
  };

  const mapAccount = (acc = {}) => ({
    displayName: acc.display_name || acc.username || '',
    acct: acc.acct || acc.username || '',
    avatar: proxify(acc.avatar_static || acc.avatar || ''),
    url: typeof acc.url === 'string' ? acc.url : ''
  });

  const mapStatus = (st) => {
    if (!st || typeof st !== 'object') return null;
    const base = st.reblog && typeof st.reblog === 'object' ? st.reblog : st;
    const media = Array.isArray(base.media_attachments)
      ? base.media_attachments.map(m => ({
          type: m.type,
          url: proxify(m.url || m.remote_url || ''),
          description: typeof m.description === 'string' ? m.description : ''
        })).filter(m => m.url)
      : [];
    return {
      id: String(base.id || st.id || ''),
      url: typeof base.url === 'string' ? base.url : '',
      createdAt: base.created_at || st.created_at || '',
      account: mapAccount(base.account || {}),
      html: typeof base.content === 'string' ? base.content : '',
      media,
      boostedBy: st.reblog ? (st.account?.display_name || st.account?.acct || '') : '',
      inReplyToId: base.in_reply_to_id || null,
      favourited: base.favourited === true,
      reblogged: base.reblogged === true,
      counts: {
        replies: Number(base.replies_count || 0),
        reblogs: Number(base.reblogs_count || 0),
        favourites: Number(base.favourites_count || 0)
      }
    };
  };

  const invalidate = () => cache.clear();

  const api = {
    hasAccount() {
      return !!getMastodon();
    },

    invalidateCache() {
      invalidate();
    },

    getAccount() {
      const m = getMastodon();
      if (!m) return null;
      return {
        network: 'mastodon',
        instance: m.instance,
        acct: m.acct,
        displayName: m.displayName,
        avatar: m.avatar ? proxify(m.avatar) : ''
      };
    },

    async getAccountStats() {
      const m = getMastodon();
      if (!m) return null;
      let res;
      try {
        res = await apiFetch(m.instance, m.token, '/api/v1/accounts/verify_credentials');
      } catch (_) {
        return null;
      }
      if (!res.ok) return null;
      const acc = await res.json().catch(() => null);
      if (!acc) return null;
      return {
        followers: Number(acc.followers_count || 0),
        following: Number(acc.following_count || 0),
        posts: Number(acc.statuses_count || 0),
        createdAt: acc.created_at || '',
        bio: typeof acc.note === 'string' ? acc.note : '',
        fields: Array.isArray(acc.fields)
          ? acc.fields.map(f => ({ name: String(f && f.name || ''), value: String(f && f.value || ''), verified: !!(f && f.verified_at) })).filter(f => f.name || f.value)
          : []
      };
    },

    async connectMastodon({ instance, token }) {
      if (isPublic) throw new Error('fediverseErrPublic');
      const origin = normalizeInstance(instance);
      const tok = String(token || '').trim();
      if (!tok) throw new Error('fediverseErrToken');
      let res;
      try {
        res = await apiFetch(origin, tok, '/api/v1/accounts/verify_credentials');
      } catch (_) {
        throw new Error('fediverseErrConnect');
      }
      if (res.status === 401 || res.status === 403) throw new Error('fediverseErrAuth');
      if (!res.ok) throw new Error('fediverseErrConnect');
      const acc = await res.json().catch(() => ({}));
      const store = readStore();
      store.mastodon = {
        instance: origin,
        token: tok,
        id: String(acc.id || ''),
        acct: acc.acct || acc.username || '',
        displayName: acc.display_name || acc.username || '',
        avatar: acc.avatar_static || acc.avatar || ''
      };
      writeStore(store);
      invalidate();
      mediaHosts = new Set();
      try { mediaHosts.add(new URL(origin).host); } catch (_) {}
      setModuleFlag('on');
      return this.getAccount();
    },

    disconnect() {
      const store = readStore();
      delete store.mastodon;
      writeStore(store);
      invalidate();
      mediaHosts = new Set();
      return true;
    },

    async fetchStatuses(pathBase) {
      const m = getMastodon();
      const res = await apiFetch(m.instance, m.token, `${pathBase}?limit=${TIMELINE_LIMIT}`);
      if (res.status === 401 || res.status === 403) return { error: 'fediverseErrAuth' };
      if (!res.ok) return { error: 'fediverseErrFetch' };
      const arr = await res.json().catch(() => []);
      const list = Array.isArray(arr) ? arr : [];
      return { posts: list.map(mapStatus).filter(Boolean) };
    },

    async getTimeline() {
      const m = getMastodon();
      if (!m) return { connected: false, posts: [] };
      try { mediaHosts.add(new URL(m.instance).host); } catch (_) {}
      const key = 'home';
      const now = Date.now();
      const hit = cache.get(key);
      if (hit && now - hit.ts < TIMELINE_CACHE_MS) return hit.value;
      let result;
      try {
        result = await this.fetchStatuses('/api/v1/timelines/home');
      } catch (_) {
        return { connected: true, account: this.getAccount(), posts: [], error: 'fediverseErrFetch' };
      }
      if (result.error) return { connected: true, account: this.getAccount(), posts: [], error: result.error };
      if (!result.posts.length && m.id) {
        try {
          const own = await this.fetchStatuses(`/api/v1/accounts/${encodeURIComponent(m.id)}/statuses`);
          if (own && !own.error) result = own;
        } catch (_) {}
      }
      const value = { connected: true, account: this.getAccount(), posts: result.posts };
      if (result.posts.length) cache.set(key, { ts: now, value });
      return value;
    },

    async getThread(id) {
      const m = getMastodon();
      if (!m) return null;
      const sid = encodeURIComponent(String(id || ''));
      let statusRes, ctxRes;
      try {
        statusRes = await apiFetch(m.instance, m.token, `/api/v1/statuses/${sid}`);
        ctxRes = await apiFetch(m.instance, m.token, `/api/v1/statuses/${sid}/context`);
      } catch (_) {
        return { error: 'fediverseErrFetch' };
      }
      if (!statusRes.ok) return { error: 'fediverseErrFetch' };
      const status = mapStatus(await statusRes.json().catch(() => null));
      const context = ctxRes.ok ? await ctxRes.json().catch(() => ({})) : {};
      return {
        status,
        ancestors: (Array.isArray(context.ancestors) ? context.ancestors : []).map(mapStatus).filter(Boolean),
        descendants: (Array.isArray(context.descendants) ? context.descendants : []).map(mapStatus).filter(Boolean)
      };
    },

    async uploadMedia(file) {
      const m = getMastodon();
      if (!m) throw new Error('fediverseErrAuth');
      if (!file || !file.filepath) return null;
      let buf;
      try { buf = fs.readFileSync(file.filepath); } catch (_) { throw new Error('fediverseErrMedia'); }
      const fd = new FormData();
      fd.append('file', new Blob([buf], { type: file.mimetype || 'application/octet-stream' }), file.originalFilename || 'upload');
      let res;
      try {
        res = await apiFetch(m.instance, m.token, '/api/v2/media', { method: 'POST', body: fd });
      } catch (_) {
        throw new Error('fediverseErrMedia');
      }
      if (!res.ok && res.status !== 202) throw new Error('fediverseErrMedia');
      const data = await res.json().catch(() => ({}));
      if (!data || !data.id) return null;
      const id = String(data.id);
      if (res.status === 202) {
        const deadline = Date.now() + MEDIA_PROCESS_TIMEOUT_MS;
        while (Date.now() < deadline) {
          await sleep(MEDIA_POLL_INTERVAL_MS);
          let poll;
          try { poll = await apiFetch(m.instance, m.token, `/api/v1/media/${id}`); } catch (_) { break; }
          if (poll.status === 200) break;
          if (poll.status !== 206 && poll.status !== 202) break;
        }
      }
      return { id, preview: proxify(data.preview_url || data.url || ''), description: '' };
    },

    async postStatus({ text, inReplyToId, mediaIds, visibility } = {}) {
      const m = getMastodon();
      if (!m) throw new Error('fediverseErrAuth');
      const status = String(text || '').trim();
      const ids = Array.isArray(mediaIds) ? mediaIds.filter(Boolean) : [];
      if (!status && !ids.length) throw new Error('fediverseErrEmpty');
      const body = { status };
      if (inReplyToId) body.in_reply_to_id = String(inReplyToId);
      if (ids.length) body.media_ids = ids;
      if (visibility) body.visibility = String(visibility);
      let res;
      try {
        res = await apiFetch(m.instance, m.token, '/api/v1/statuses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      } catch (_) {
        throw new Error('fediverseErrPost');
      }
      if (res.status === 401 || res.status === 403) throw new Error('fediverseErrAuth');
      if (!res.ok) throw new Error('fediverseErrPost');
      invalidate();
      return true;
    },

    async action(id, verb) {
      const m = getMastodon();
      if (!m) throw new Error('fediverseErrAuth');
      const allowed = { reblog: 1, unreblog: 1, favourite: 1, unfavourite: 1 };
      if (!allowed[verb]) throw new Error('fediverseErrPost');
      const sid = encodeURIComponent(String(id || ''));
      let res;
      try {
        res = await apiFetch(m.instance, m.token, `/api/v1/statuses/${sid}/${verb}`, { method: 'POST' });
      } catch (_) {
        throw new Error('fediverseErrPost');
      }
      if (res.status === 401 || res.status === 403) throw new Error('fediverseErrAuth');
      if (!res.ok) throw new Error('fediverseErrPost');
      invalidate();
      return true;
    },

    reblog(id) { return this.action(id, 'reblog'); },
    unreblog(id) { return this.action(id, 'unreblog'); },
    favourite(id) { return this.action(id, 'favourite'); },
    unfavourite(id) { return this.action(id, 'unfavourite'); },

    isHostAllowed(host) {
      if (mediaHosts.has(host)) return true;
      const m = getMastodon();
      if (m) {
        try { if (new URL(m.instance).host === host) return true; } catch (_) {}
        try { if (m.avatar && new URL(m.avatar).host === host) return true; } catch (_) {}
      }
      return false;
    },

    async proxyMedia(remoteUrl) {
      let u;
      try { u = new URL(String(remoteUrl)); } catch (_) { return null; }
      if (u.protocol !== 'https:') return null;
      if (isPrivateHost(u.hostname)) return null;
      if (!this.isHostAllowed(u.host)) return null;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(u.href, { signal: controller.signal, redirect: 'follow', headers: spoofHeaders('image/avif,image/webp,*/*') });
        if (!res.ok) return null;
        const ct = res.headers.get('content-type') || 'application/octet-stream';
        if (!/^(image|video|audio)\//i.test(ct)) return null;
        const ab = await res.arrayBuffer();
        return { contentType: ct, buffer: Buffer.from(ab) };
      } catch (_) {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }
  };

  return api;
};
