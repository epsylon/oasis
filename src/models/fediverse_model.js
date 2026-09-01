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


const TG_TIMEOUT_MS = 20000;
const TG_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
const TG_MEDIA_CACHE_MAX = 60;
const TG_LOGIN_TTL_MS = 10 * 60 * 1000;
let gram = null;
const loadGram = () => {
  if (gram) return gram;
  const { TelegramClient, Api } = require('../server/node_modules/telegram');
  const { StringSession } = require('../server/node_modules/telegram/sessions');
  const { Logger, LogLevel } = require('../server/node_modules/telegram/extensions/Logger');
  gram = { TelegramClient, Api, StringSession, Logger, LogLevel };
  return gram;
};
const withTimeout = (promise, ms = TG_TIMEOUT_MS) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('telegramErrTimeout')), ms);
  Promise.resolve(promise).then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});
const tgDisplayName = (u) => {
  if (!u) return '';
  if (u.title) return String(u.title);
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return full || (u.username ? `@${u.username}` : '');
};
const tgErrCode = (err) => {
  const m = String((err && (err.errorMessage || err.message)) || '').toUpperCase();
  if (m.includes('PHONE_CODE_INVALID') || m.includes('PHONE_CODE_EMPTY')) return 'telegramErrCode';
  if (m.includes('PHONE_CODE_EXPIRED')) return 'telegramErrCodeExpired';
  if (m.includes('PASSWORD_HASH_INVALID')) return 'telegramErrPassword';
  if (m.includes('PHONE_NUMBER_INVALID') || m.includes('PHONE_NUMBER_BANNED')) return 'telegramErrPhone';
  if (m.includes('API_ID_INVALID') || m.includes('API_ID_PUBLISHED_FLOOD')) return 'telegramErrApi';
  if (m.includes('FLOOD')) return 'telegramErrFlood';
  if (m.includes('TELEGRAMERRTIMEOUT')) return 'telegramErrTimeout';
  if (m.includes('AUTH_KEY') || m.includes('SESSION_REVOKED') || m.includes('USER_DEACTIVATED') || m.includes('AUTH_USER_CANCEL')) return 'telegramErrAuth';
  return 'telegramErrConnect';
};
const tgHardError = (code) => code === 'telegramErrPhone' || code === 'telegramErrApi' || code === 'telegramErrFlood' || code === 'telegramErrAuth' || code === 'telegramErrConnect' || code === 'telegramErrTimeout';

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

    telegram: (() => {
      const getTg = () => readStore().telegram || null;
      let client = null;
      let pending = null;
      const entities = new Map();
      const messages = new Map();
      const mediaCache = new Map();
      const avatarCache = new Map();
      const dialogCache = { ts: 0, value: null };

      const killClient = async (c) => {
        if (!c) return;
        try { await withTimeout(c.destroy(), 8000); } catch (_) { try { await c.disconnect(); } catch (__) {} }
      };
      const newClient = (sessionStr, apiId, apiHash) => {
        const { TelegramClient, StringSession, Logger, LogLevel } = loadGram();
        return new TelegramClient(new StringSession(sessionStr || ''), Number(apiId), String(apiHash), {
          connectionRetries: 3,
          baseLogger: new Logger(LogLevel.NONE)
        });
      };
      const getClient = async () => {
        const t = getTg();
        if (!t || !t.session) throw new Error('telegramErrAuth');
        if (client && client.connected) return client;
        if (!client) client = newClient(t.session, t.apiId, t.apiHash);
        await withTimeout(client.connect());
        return client;
      };
      const rememberDialogs = (list) => {
        for (const d of list) if (d && d.entity) entities.set(String(d.id), d.entity);
      };
      const resolveEntity = async (c, id) => {
        const key = String(id);
        if (entities.has(key)) return entities.get(key);
        try { rememberDialogs(await withTimeout(c.getDialogs({ limit: TIMELINE_LIMIT }))); } catch (_) {}
        if (entities.has(key)) return entities.get(key);
        const ent = await withTimeout(c.getEntity(Number(key)));
        entities.set(key, ent);
        return ent;
      };
      const peerKind = (d) => (d.isUser ? 'user' : d.isChannel ? 'channel' : 'group');
      const kindOfEntity = (ent) => {
        const { Api } = loadGram();
        if (ent instanceof Api.User) return 'user';
        if (ent instanceof Api.Channel) return ent.megagroup ? 'group' : 'channel';
        return 'group';
      };
      const mediaInfo = (msg) => {
        const { Api } = loadGram();
        const m = msg && msg.media;
        if (!m) return null;
        if (m instanceof Api.MessageMediaPhoto) return { kind: 'photo', mime: 'image/jpeg', size: 0, name: '' };
        if (m instanceof Api.MessageMediaDocument && m.document && m.document.mimeType !== undefined) {
          const mime = String(m.document.mimeType || 'application/octet-stream');
          const size = Number(m.document.size || 0);
          const kind = mime.startsWith('image/') ? 'photo' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file';
          let name = '';
          for (const attr of (m.document.attributes || [])) if (attr && attr.fileName) name = String(attr.fileName);
          return { kind, mime, size, name };
        }
        return { kind: 'other', mime: '', size: 0, name: '' };
      };
      const toIso = (unix) => (unix ? new Date(Number(unix) * 1000).toISOString() : '');
      const mapMessage = (msg, chatId, senderNames) => {
        const info = mediaInfo(msg);
        const sid = msg.senderId ? String(msg.senderId) : '';
        return {
          id: Number(msg.id),
          chatId: String(chatId),
          text: String(msg.message || ''),
          date: toIso(msg.date),
          out: msg.out === true,
          senderId: sid,
          senderName: senderNames.get(sid) || '',
          media: info && info.kind !== 'other' && info.size <= TG_MEDIA_MAX_BYTES
            ? { ...info, url: `/fediverse/telegram/media/${encodeURIComponent(String(chatId))}/${encodeURIComponent(String(msg.id))}` }
            : null
        };
      };
      const trimCache = (map) => {
        while (map.size > TG_MEDIA_CACHE_MAX) map.delete(map.keys().next().value);
      };
      const dropPending = async () => {
        if (pending && pending.client && pending.client !== client) await killClient(pending.client);
        pending = null;
      };
      const waitStep = async (p, prevStep, ms = 25000) => {
        const started = Date.now();
        while (Date.now() - started < ms) {
          if (p.done || p.error || p.step !== prevStep || p.awaiting) return;
          await sleep(200);
        }
      };

      return {
        hasAccount() { return !!(getTg() && getTg().session); },
        getAccount() {
          const t = getTg();
          if (!t || !t.session) return null;
          return {
            network: 'telegram',
            username: t.username || '',
            displayName: t.displayName || t.username || t.phone || '',
            phone: t.phone || '',
            avatar: '/fediverse/telegram/avatar/me'
          };
        },
        async getAccountStats() {
          if (!this.hasAccount()) return null;
          const data = await this.getDialogs();
          if (!data || data.error) return null;
          return {
            chats: data.dialogs.length,
            unread: data.dialogs.reduce((sum, d) => sum + (Number(d.unread) || 0), 0)
          };
        },
        loginState() {
          if (!pending) return null;
          if (Date.now() - pending.startedAt > TG_LOGIN_TTL_MS && !pending.done) { dropPending(); return null; }
          return { step: pending.step, error: pending.error || '', done: pending.done === true };
        },
        async beginLogin({ apiId, apiHash, phone }) {
          if (isPublic) throw new Error('fediverseErrPublic');
          const id = Number(String(apiId || '').trim());
          const hash = String(apiHash || '').trim();
          const ph = String(phone || '').trim();
          if (!id || !hash || !ph) throw new Error('telegramErrMissing');
          await dropPending();
          const c = newClient('', id, hash);
          try { await withTimeout(c.connect()); } catch (err) { throw new Error(tgErrCode(err)); }
          const p = { client: c, apiId: id, apiHash: hash, phone: ph, step: 'sending', error: '', done: false, awaiting: false, startedAt: Date.now(), resolveCode: null, resolvePassword: null };
          pending = p;
          p.promise = c.start({
            phoneNumber: async () => ph,
            phoneCode: async () => new Promise((resolve) => { p.step = 'code'; p.awaiting = true; p.resolveCode = resolve; }),
            password: async () => new Promise((resolve) => { p.step = 'password'; p.awaiting = true; p.resolvePassword = resolve; }),
            onError: (err) => {
              const code = tgErrCode(err);
              p.error = code;
              return tgHardError(code);
            }
          }).then(async () => {
            const me = await withTimeout(c.getMe());
            const store = readStore();
            store.telegram = {
              apiId: id,
              apiHash: hash,
              phone: ph,
              session: c.session.save(),
              userId: String(me.id || ''),
              username: me.username || '',
              displayName: tgDisplayName(me)
            };
            writeStore(store);
            if (client && client !== c) await killClient(client);
            client = c;
            entities.clear(); dialogCache.value = null;
            p.done = true; p.step = 'done'; p.error = '';
            pending = null;
            setModuleFlag('on');
          }).catch(async (err) => {
            if (!p.error) p.error = tgErrCode(err);
            p.done = true; p.step = 'error';
            await killClient(c);
          });
          await waitStep(p, 'sending', 12000);
          return this.loginState();
        },
        async submitCode(code) {
          const p = pending;
          if (!p || p.done || typeof p.resolveCode !== 'function') throw new Error('telegramErrNoLogin');
          const value = String(code || '').replace(/\s+/g, '');
          if (!value) throw new Error('telegramErrCode');
          const resolve = p.resolveCode;
          p.resolveCode = null; p.awaiting = false; p.error = '';
          resolve(value);
          await waitStep(p, 'code');
          return this.loginState();
        },
        async submitPassword(password) {
          const p = pending;
          if (!p || p.done || typeof p.resolvePassword !== 'function') throw new Error('telegramErrNoLogin');
          const value = String(password || '');
          if (!value) throw new Error('telegramErrPassword');
          const resolve = p.resolvePassword;
          p.resolvePassword = null; p.awaiting = false; p.error = '';
          resolve(value);
          await waitStep(p, 'password');
          return this.loginState();
        },
        async cancelLogin() { await dropPending(); },
        async disconnect() {
          const { Api } = loadGram();
          try {
            const c = await getClient();
            await withTimeout(c.invoke(new Api.auth.LogOut()), 8000);
          } catch (_) {}
          await killClient(client);
          client = null;
          const store = readStore();
          delete store.telegram;
          writeStore(store);
          entities.clear(); messages.clear(); mediaCache.clear(); avatarCache.clear(); dialogCache.value = null;
          return true;
        },
        invalidateCache() { dialogCache.value = null; },
        async getDialogs(force = false) {
          if (!this.hasAccount()) return { connected: false, dialogs: [] };
          const now = Date.now();
          if (!force && dialogCache.value && now - dialogCache.ts < TIMELINE_CACHE_MS) return dialogCache.value;
          let c;
          try { c = await getClient(); } catch (err) { return { connected: true, account: this.getAccount(), dialogs: [], error: tgErrCode(err) }; }
          let list;
          try { list = await withTimeout(c.getDialogs({ limit: TIMELINE_LIMIT })); } catch (err) { return { connected: true, account: this.getAccount(), dialogs: [], error: tgErrCode(err) }; }
          rememberDialogs(list);
          const dialogs = list.map((d) => {
            const id = String(d.id);
            const last = d.message || null;
            return {
              id,
              title: String(d.title || d.name || id),
              kind: peerKind(d),
              unread: Number(d.unreadCount || 0),
              date: toIso(d.date || (last && last.date)),
              last: last ? { text: String(last.message || ''), out: last.out === true, hasMedia: !!last.media } : null,
              avatar: `/fediverse/telegram/avatar/${encodeURIComponent(id)}`
            };
          });
          const value = { connected: true, account: this.getAccount(), dialogs };
          dialogCache.ts = now; dialogCache.value = value;
          return value;
        },
        async getChat(id) {
          const c = await getClient();
          const entity = await resolveEntity(c, id);
          const list = await withTimeout(c.getMessages(entity, { limit: TIMELINE_LIMIT }));
          const senderNames = new Map();
          for (const msg of list) {
            const sid = msg.senderId ? String(msg.senderId) : '';
            if (!sid || senderNames.has(sid)) continue;
            try { senderNames.set(sid, tgDisplayName(await withTimeout(msg.getSender(), 8000))); } catch (_) { senderNames.set(sid, ''); }
          }
          for (const msg of list) messages.set(`${id}:${msg.id}`, msg);
          trimCache(messages);
          try { await withTimeout(c.markAsRead(entity), 8000); } catch (_) {}
          dialogCache.value = null;
          return {
            id: String(id),
            title: tgDisplayName(entity) || String(id),
            kind: kindOfEntity(entity),
            messages: list.slice().reverse().map((msg) => mapMessage(msg, id, senderNames))
          };
        },
        async sendMessage(id, { text, file } = {}) {
          const c = await getClient();
          const entity = await resolveEntity(c, id);
          const msg = String(text || '').trim();
          if (file && file.filepath) {
            await withTimeout(c.sendFile(entity, { file: file.filepath, caption: msg, forceDocument: false }), 90000);
          } else {
            if (!msg) throw new Error('fediverseErrEmpty');
            await withTimeout(c.sendMessage(entity, { message: msg }));
          }
          dialogCache.value = null;
          return true;
        },
        async getMedia(chatId, msgId) {
          const key = `${chatId}:${msgId}`;
          if (mediaCache.has(key)) return mediaCache.get(key);
          const c = await getClient();
          let msg = messages.get(key) || null;
          if (!msg) {
            const entity = await resolveEntity(c, chatId);
            const arr = await withTimeout(c.getMessages(entity, { ids: [Number(msgId)] }));
            msg = arr && arr[0] ? arr[0] : null;
          }
          if (!msg || !msg.media) return null;
          const info = mediaInfo(msg);
          if (!info || info.kind === 'other' || info.size > TG_MEDIA_MAX_BYTES) return null;
          const buf = await withTimeout(c.downloadMedia(msg, {}), 90000);
          if (!buf || !buf.length) return null;
          const out = { contentType: info.mime || 'application/octet-stream', buffer: Buffer.from(buf), name: info.name };
          mediaCache.set(key, out);
          trimCache(mediaCache);
          return out;
        },
        async getAvatar(id) {
          const key = String(id);
          if (avatarCache.has(key)) return avatarCache.get(key);
          const c = await getClient();
          const entity = key === 'me' ? 'me' : await resolveEntity(c, key);
          let buf = null;
          try { buf = await withTimeout(c.downloadProfilePhoto(entity, { isBig: false }), 15000); } catch (_) { buf = null; }
          const out = buf && buf.length ? { contentType: 'image/jpeg', buffer: Buffer.from(buf) } : null;
          avatarCache.set(key, out);
          trimCache(avatarCache);
          return out;
        }
      };
    })(),

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
        let current = u, res = null;
        for (let hop = 0; hop < 5; hop++) {
          res = await fetch(current.href, { signal: controller.signal, redirect: 'manual', headers: spoofHeaders('image/avif,image/webp,*/*') });
          if (res.status < 300 || res.status >= 400) break;
          const loc = res.headers.get('location');
          if (!loc) return null;
          let next;
          try { next = new URL(loc, current); } catch (_) { return null; }
          if (next.protocol !== 'https:') return null;
          if (isPrivateHost(next.hostname)) return null;
          current = next;
        }
        if (!res || !res.ok) return null;
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
