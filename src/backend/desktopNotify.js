const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getConfig } = require('../configs/config-manager.js');

const REPEAT_MS = 60000;
const ICON = path.join(__dirname, '..', 'client', 'assets', 'images', 'snh-oasis.jpg');
const recent = new Map();

const onPath = (bin) => (process.env.PATH || '').split(path.delimiter).some(d => d && fs.existsSync(path.join(d, bin)));

const i18nNow = () => {
  const all = require('../client/assets/translations/i18n');
  let lang = 'en';
  try { lang = getConfig().language || 'en'; } catch (_) {}
  return { ...all.en, ...(all[lang] || {}) };
};

const displayName = (id, name) => {
  const n = String(name || '').trim();
  if (!n || n === 'Redacted' || n === String(id || '').replace(/^@/, '').slice(0, 8)) return String(id || '');
  return n.startsWith('@') ? n : `@${n}`;
};

const notify = (keyword, text, key = null, opts = {}) => {
  if (!onPath('notify-send')) return false;
  const body = String(text || '').replace(/\s+/g, ' ').trim().replace(/[.。!…]+$/, '').slice(0, 200);
  const line = `${String(keyword || 'Oasis').toUpperCase()}: ${body}...`;
  const now = Date.now();
  const dedupe = key || line;
  for (const [k, t] of recent) if (now - t > REPEAT_MS) recent.delete(k);
  if (recent.has(dedupe)) return false;
  recent.set(dedupe, now);
  const actions = Array.isArray(opts.actions) ? opts.actions.filter(x => x && x.key && x.label) : [];
  const extra = [
    ...(opts.timeoutMs > 0 ? ['-t', String(Math.round(opts.timeoutMs))] : []),
    ...actions.flatMap(x => ['-A', `${x.key}=${x.label}`])
  ];
  try {
    const p = spawn('notify-send', ['-a', 'Oasis', ...(fs.existsSync(ICON) ? ['-i', ICON] : []), ...extra, line], { stdio: ['ignore', actions.length ? 'pipe' : 'ignore', 'ignore'] });
    p.on('error', () => {});
    if (actions.length && typeof opts.onAction === 'function') {
      let out = '';
      p.stdout.on('data', (d) => { out += d; });
      p.on('close', () => { const chosen = out.trim(); if (actions.some(x => x.key === chosen)) opts.onAction(chosen); });
    }
    return true;
  } catch (_) {
    return false;
  }
};

module.exports = { notify, i18nNow, displayName };
