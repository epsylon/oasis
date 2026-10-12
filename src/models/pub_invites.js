const ssbKeys = require('../server/node_modules/ssb-keys');
const { readTyped } = require('./typed_log');

const ANNOUNCE_TYPE = 'pub-invites';
const MAX_CODES = 40;
const FEED_ID = /@[A-Za-z0-9+/]{43}=\.ed25519/;
const SHS_KEY = /~shs:([A-Za-z0-9+/]{43}=)/;

const LEGACY_ADDRESS = /^([^:~\s]+):(\d+):@/;
const MODERN_ADDRESS = /^(?:net|onion):([^:~\s]+):(\d+)~/;
const parseInvite = (code) => {
  const s = String(code || '').trim();
  const legacy = s.match(FEED_ID);
  const modern = s.match(SHS_KEY);
  const pub = legacy ? legacy[0] : modern ? `@${modern[1]}.ed25519` : null;
  const address = s.match(LEGACY_ADDRESS) || s.match(MODERN_ADDRESS);
  const host = address ? address[1] : null;
  const port = address ? Number(address[2]) : null;
  let id = null;
  try {
    const seed = Buffer.from(s.split('~').pop().replace(/^invite:/, ''), 'base64');
    if (seed.length === 32) id = ssbKeys.generate('ed25519', seed).id;
  } catch (_) {}
  return { pub, id, host, port };
};

const count = (n) => Math.max(0, Math.floor(Number(n) || 0));

const summarize = (rows) => {
  const list = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && typeof r.id === 'string' && count(r.total) > 0)
    .map((r) => ({ id: r.id, total: count(r.total), used: Math.min(count(r.used), count(r.total)) }));
  const codes = list.filter((r) => r.total > 1)
    .sort((a, b) => (b.total - b.used) - (a.total - a.used))
    .slice(0, MAX_CODES)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    total: list.reduce((n, r) => n + r.total, 0),
    used: list.reduce((n, r) => n + r.used, 0),
    codes
  };
};

const latestByAuthor = (msgs) => {
  const out = new Map();
  for (const m of msgs || []) {
    const v = m && m.value;
    const c = v && v.content;
    if (!c || c.type !== ANNOUNCE_TYPE) continue;
    const prev = out.get(v.author);
    if (!prev || (Number(v.sequence) || 0) > (Number(prev.value.sequence) || 0)) out.set(v.author, m);
  }
  return out;
};

const listUses = (ssb) => new Promise((resolve) => {
  if (!ssb || !ssb.invite || typeof ssb.invite.list !== 'function') return resolve(null);
  try { ssb.invite.list((err, rows) => resolve(err ? null : rows)); } catch (_) { resolve(null); }
});

const announce = async (ssb) => {
  const rows = await listUses(ssb);
  if (!rows) return null;
  const next = summarize(rows);
  const last = latestByAuthor(await readTyped(ssb, [ANNOUNCE_TYPE])).get(ssb.id);
  const c = last && last.value.content;
  const prev = c ? { total: c.total, used: c.used, codes: c.codes } : null;
  if (prev ? JSON.stringify(prev) === JSON.stringify(next) : !next.total) return null;
  return new Promise((resolve, reject) => ssb.publish({ type: ANNOUNCE_TYPE, ...next, updatedAt: new Date().toISOString() }, (err, msg) => (err ? reject(err) : resolve(msg))));
};

const statusFor = (entries, msgs) => {
  const latest = latestByAuthor(msgs);
  return (Array.isArray(entries) ? entries : []).map((e) => {
    const { pub, id } = parseInvite(e && e.code);
    const m = pub ? latest.get(pub) : null;
    if (!m) return { ...e, invites: null, exhausted: false };
    const c = m.value.content;
    const total = count(c.total);
    const used = Math.min(count(c.used), total);
    const own = id && Array.isArray(c.codes) ? c.codes.find((x) => x && x.id === id) : null;
    const exhausted = (total > 0 && used >= total) || (!!own && count(own.used) >= count(own.total));
    return { ...e, invites: total > 0 ? { used, total } : null, exhausted };
  });
};

const readStatus = async (ssb, entries) => {
  let msgs = [];
  try { msgs = await readTyped(ssb, [ANNOUNCE_TYPE]); } catch (_) { msgs = []; }
  return statusFor(entries, msgs);
};

module.exports = { ANNOUNCE_TYPE, parseInvite, summarize, announce, readStatus };
