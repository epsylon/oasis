const fs = require('fs');
const path = require('path');
const pull = require('../server/node_modules/pull-stream');
const sharedState = require('../configs/shared-state');
const { notify: desktopNotify, i18nNow, displayName } = require('../backend/desktopNotify');
const { statePath } = require('../configs/state-manager');

const HISTORY_MAX = 200;
const HEARD_MAX = 1000;
const LATEST_MAX = 5;
const PUBS_TTL_MS = 5 * 60 * 1000;
const RECOUNT_DELAY_MS = 500;
const FEED_ID = /^@[A-Za-z0-9+/]{43}=\.ed25519$/;

const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return fallback; } };
const writeJson = (p, data) => { try { fs.writeFileSync(p, JSON.stringify(data, null, 2)); } catch (_) {} };
const asP = (fn, ...args) => new Promise((resolve, reject) => fn(...args, (err, v) => err ? reject(err) : resolve(v)));
const rpcValue = (fn, ...args) => new Promise((resolve) => {
  try {
    const r = fn(...args, (err, v) => resolve(err ? null : v));
    if (r && typeof r.then === 'function') r.then(resolve, () => resolve(null));
    else if (r !== undefined) resolve(r);
  } catch (_) { resolve(null); }
});

module.exports = ({ cooler, pmModel, nameOf, isPublic, encryptFile, isAvailable, prefetch }) => {
  const historyFile = statePath('phone-history.json');
  const seenFile = statePath('phone-seen.json');
  let ssb = null;
  let subscribed = false;
  let pubsAt = 0;
  let pubsTimer = null;

  const open = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };
  const phone = async () => { const s = await open(); return s && s.phone ? s.phone : null; };
  const history = () => { const h = readJson(historyFile, []); return Array.isArray(h) ? h : []; };
  const seen = () => {
    const s = readJson(seenFile, {});
    return { missedSeenAt: Number(s.missedSeenAt) || 0, heard: Array.isArray(s.heard) ? s.heard : [] };
  };

  const refreshCount = async () => {
    let n = 0;
    const st = sharedState.getPhoneCall ? sharedState.getPhoneCall() : null;
    if (st && st.dir === 'in' && st.phase === 'incoming') n += 1;
    const sn = seen();
    n += history().filter(h => h && h.outcome === 'missed' && h.endedAt > sn.missedSeenAt).length;
    try {
      const me = (await open()).id;
      const heard = new Set(sn.heard);
      n += (await pmModel.listPams()).filter(m => m.value.author !== me && !heard.has(m.key)).length;
    } catch (_) {}
    sharedState.setPhoneCount(n);
    return n;
  };

  const notify = async (peer, callId) => {
    const i18n = i18nNow();
    let name = '';
    try { name = await nameOf(peer); } catch (_) {}
    desktopNotify(i18n.phoneTitle, `${displayName(peer, name)} ${i18n.phoneIsCalling}`, callId ? `call:${callId}` : null, {
      timeoutMs: require('../server/phone_module').RING_MS,
      actions: [{ key: 'answer', label: i18n.phoneAnswer }, { key: 'reject', label: i18n.phoneReject }],
      onAction: async (chosen) => {
        try {
          const ph = await phone();
          const st = ph ? await rpcValue(ph.state) : null;
          if (!st || st.id !== callId || st.phase !== 'incoming') return;
          await act(chosen === 'answer' ? 'accept' : 'reject');
        } catch (_) {}
      }
    });
  };

  const subscribe = async () => {
    if (subscribed) return;
    const ph = await phone();
    if (!ph || subscribed) return;
    subscribed = true;
    pull(ph.events(), pull.drain((ev) => {
      if (!ev) return;
      if (ev.type === 'state') {
        sharedState.setPhoneCall(ev.state || null);
        refreshCount();
      } else if (ev.type === 'room') {
        sharedState.setPhoneRoom(ev.room || null);
      } else if (ev.type === 'recordLimit') {
        finishPam().catch(() => {});
      } else if (ev.type === 'incoming') {
        notify(ev.peer, ev.id);
      } else if (ev.type === 'ended' && ev.call) {
        const h = history();
        h.unshift(ev.call);
        writeJson(historyFile, h.slice(0, HISTORY_MAX));
        refreshCount();
      }
    }, () => {
      subscribed = false;
      const retry = setTimeout(() => { subscribe().catch(() => {}); }, 5000);
      if (retry.unref) retry.unref();
    }));
    try { sharedState.setPhoneCall((await rpcValue(ph.state)) || null); } catch (_) {}
    try { if (typeof ph.roomState === 'function') sharedState.setPhoneRoom((await rpcValue(ph.roomState)) || null); } catch (_) {}
  };

  let arrivalsWatched = false;
  let recountTimer = null;
  const scheduleRecount = () => {
    if (recountTimer) return;
    recountTimer = setTimeout(() => { recountTimer = null; refreshCount().catch(() => {}); }, RECOUNT_DELAY_MS);
    if (recountTimer.unref) recountTimer.unref();
  };
  const watchArrivals = async () => {
    if (arrivalsWatched) return;
    const s = await open();
    if (!s || !s.db || typeof s.db.onMsgAdded !== 'function') return;
    arrivalsWatched = true;
    s.db.onMsgAdded((ev) => {
      const v = ev && ev.kvt && ev.kvt.value;
      if (!v || v.author === s.id || typeof v.content !== 'string') return;
      scheduleRecount();
    }, false);
  };

  const act = async (method, ...args) => {
    await subscribe();
    const ph = await phone();
    if (!ph) throw new Error('unavailable');
    return asP(ph[method], ...args);
  };

  const finishPam = async () => {
    const ph = await phone();
    if (!ph) return false;
    const out = await asP(ph.recordStop);
    if (!out || !out.file) return false;
    try {
      const enc = await encryptFile(out.file);
      await pmModel.sendPam(out.peer, enc.cipher, Number(out.durationMs) / 1000);
      return true;
    } finally {
      fs.unlink(out.file, () => {});
    }
  };

  const findPam = async (key) => (await pmModel.listPams()).find(m => m.key === key) || null;

  const byType = (s, type) => new Promise((resolve) => {
    if (!s || typeof s.messagesByType !== 'function') return resolve([]);
    try { pull(s.messagesByType({ type }), pull.collect((err, msgs) => resolve(err ? [] : msgs))); } catch (_) { resolve([]); }
  });
  const defaultPubId = () => {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'configs', 'snh-invite-code.json'), 'utf8'));
      const m = String(raw.code || '').match(/(@[A-Za-z0-9+/]{43}=\.ed25519)/);
      return m ? m[1] : '';
    } catch (_) { return ''; }
  };
  let announcedPubs = new Set();
  const refreshPubs = async (force = false) => {
    const ids = new Set();
    const add = (id) => { if (FEED_ID.test(String(id || ''))) ids.add(String(id)); };
    try {
      const s = await open();
      if (force || Date.now() - pubsAt >= PUBS_TTL_MS) {
        pubsAt = Date.now();
        const found = new Set();
        for (const m of await byType(s, 'pub')) { const k = m && m.value && m.value.content && m.value.content.address && m.value.content.address.key; if (FEED_ID.test(String(k || ''))) found.add(String(k)); }
        for (const m of await byType(s, 'pubAvailability')) { const k = m && m.value && m.value.author; if (FEED_ID.test(String(k || ''))) found.add(String(k)); }
        announcedPubs = found;
      }
      add(defaultPubId());
      for (const id of announcedPubs) add(id);
      try { const ph = s.phone; if (ph && typeof ph.pubs === 'function') for (const id of (await rpcValue(ph.pubs)) || []) add(id); } catch (_) {}
      ids.delete(s.id);
    } catch (_) { add(defaultPubId()); }
    sharedState.setPubIds(ids);
    return ids;
  };
  const isPub = (id) => sharedState.isPubId(id);

  return {
    async start() {
      await subscribe();
      await watchArrivals().catch(() => {});
      await refreshCount();
      await refreshPubs(true);
      if (!pubsTimer) { pubsTimer = setInterval(() => { refreshPubs(true).catch(() => {}); }, PUBS_TTL_MS); if (pubsTimer.unref) pubsTimer.unref(); }
    },
    refreshCount,
    refreshPubs,
    isPub,
    async available() {
      if (isPublic) return false;
      const ph = await phone();
      return !!(ph && await rpcValue(ph.available));
    },
    async state() {
      await subscribe();
      const ph = await phone();
      return ph ? rpcValue(ph.state) : null;
    },
    async call(to, opts = {}) {
      await refreshPubs();
      const list = Array.isArray(to) ? to : [to];
      if (list.some(isPub)) throw new Error('pub');
      return act('call', list.length === 1 ? list[0] : list, { legacy: Array.isArray(opts.legacy) ? opts.legacy : [] });
    },
    accept: () => act('accept'),
    reject: () => act('reject'),
    hangup: () => act('end'),
    mute: (flag) => act('mute', !!flag),
    silence: (id, flag) => act('silence', { id, on: !!flag }),
    dismiss: () => act('dismiss'),
    recordCancel: () => act('recordCancel'),
    async sendPam() { await subscribe(); return finishPam(); },
    history,
    async markAllHeard(keys) {
      const s = seen();
      const set = new Set(s.heard);
      for (const k of keys || []) if (typeof k === 'string' && k) set.add(k);
      s.heard = [...set].slice(-HEARD_MAX);
      writeJson(seenFile, s);
      refreshCount();
    },
    deleteHistory(ids) {
      const drop = new Set((ids || []).map(String));
      if (!drop.size) return;
      writeJson(historyFile, history().filter(h => !drop.has(String(h && h.id))));
    },
    latestCalls(items) {
      const me = ssb && ssb.id;
      const out = [];
      const seenPeers = new Set();
      for (const h of items || history()) {
        for (const peer of (Array.isArray(h.peers) && h.peers.length ? h.peers : [h.peer])) {
          if (!peer || peer === me || seenPeers.has(peer) || isPub(peer)) continue;
          seenPeers.add(peer);
          out.push({ id: peer, dir: h.dir, outcome: h.outcome, startedAt: h.startedAt });
          if (out.length >= LATEST_MAX) return out;
        }
      }
      return out;
    },
    async pams() {
      const me = (await open()).id;
      const heard = new Set(seen().heard);
      const list = (await pmModel.listPams())
        .filter(m => m.value.author !== me)
        .map(m => ({ key: m.key, from: m.value.author, sentAt: m.value.content.sentAt || new Date(m.timestamp || 0).toISOString(), durationSec: Number(m.value.content.durationSec) || 0, heard: heard.has(m.key), share: m.value.content.share, ready: true }))
        .sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
      if (typeof isAvailable === 'function') {
        for (const item of list) {
          item.ready = await isAvailable(item.share).catch(() => false);
          if (!item.ready && typeof prefetch === 'function') prefetch(item.share).catch(() => {});
        }
      }
      return list.map(({ share, ...rest }) => rest);
    },
    async pamCipher(key) {
      const m = await findPam(key);
      const share = m && m.value && m.value.content && m.value.content.share;
      if (!share || typeof share.key !== 'string' || typeof share.manifestBlobId !== 'string') return null;
      return share;
    },
    markHeard(key) {
      const s = seen();
      if (s.heard.includes(key)) return false;
      s.heard.push(key);
      s.heard = s.heard.slice(-HEARD_MAX);
      writeJson(seenFile, s);
      refreshCount();
      return true;
    },
    async deletePam(key) {
      const m = await findPam(key);
      if (!m) return null;
      return pmModel.deleteMessageById(key);
    },
    async knownFeeds() {
      const s = await open();
      await refreshPubs();
      const hops = await new Promise((resolve) => {
        try { s.friends.hops({ start: s.id, max: 2 }, (err, h) => resolve(err ? {} : (h || {}))); } catch (_) { resolve({}); }
      });
      const out = new Map();
      for (const [id, hop] of Object.entries(hops)) {
        if (id === s.id || isPub(id) || !(Number(hop) >= 0)) continue;
        out.set(id, Number(hop));
      }
      return out;
    },
    markMissedSeen() {
      const s = seen();
      s.missedSeenAt = Date.now();
      writeJson(seenFile, s);
      refreshCount();
    }
  };
};
