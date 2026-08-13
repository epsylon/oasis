const fs = require('fs');
const path = require('path');
const pull = require('../server/node_modules/pull-stream');

const STEPS = ['language', 'ux', 'profile', 'federation', 'larp', 'greeting', 'backup'];
const FLAG = 'oasis-first-contact';
const PENDING = 'welcome=pending';
const DISMISSED = 'welcome=dismissed';
const DONE = 'welcome=done';

const ssbPathOf = (given) => {
  if (given) return given;
  try { return require('../server/ssb_config').path; } catch (_) { return null; }
};

const flagPath = (dir) => path.join(dir, FLAG);

function readFlag(dir) {
  if (!dir) return { exists: false, id: '', markers: new Set() };
  let raw = '';
  try { raw = fs.readFileSync(flagPath(dir), 'utf8'); } catch (_) { return { exists: false, id: '', markers: new Set() }; }
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const isMarker = (l) => /^(welcome|step)=/.test(l);
  const markers = new Set(lines.filter(isMarker));
  return { exists: true, id: lines.find(l => !isMarker(l)) || '', markers };
}

function appendMarker(dir, marker, createIfMissing) {
  if (!dir) return false;
  const flag = readFlag(dir);
  if (flag.markers.has(marker)) return true;
  if (!flag.exists && !createIfMissing) return false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(flagPath(dir), `${marker}\n`);
    return true;
  } catch (_) {
    return false;
  }
}

const isPending = (dir) => {
  if (!dir) return false;
  const flag = readFlag(dir);
  if (!flag.exists) return true;
  if (flag.markers.has(DISMISSED) || flag.markers.has(DONE)) return false;
  return flag.markers.has(PENDING);
};

const bannerVisible = (ssbPath) => isPending(ssbPathOf(ssbPath));

module.exports = ({ cooler, ssbPath } = {}) => {
  const dir = () => ssbPathOf(ssbPath);

  const ownMessages = async () => {
    const ssb = await cooler.open();
    const mine = ssb.id;
    const all = await new Promise((resolve, reject) =>
      pull(ssb.createLogStream({ reverse: true, limit: 2000 }), pull.collect((err, msgs) => err ? reject(err) : resolve(msgs || [])))
    );
    return { mine, messages: all.filter(m => m && m.value && m.value.author === mine) };
  };

  const hasProfile = (mine, messages) => messages.some(m => {
    const c = m.value.content;
    if (!c || typeof c !== 'object' || c.type !== 'about' || c.about !== mine) return false;
    return String(c.name || '').trim().length > 0 || String(c.image || '').trim().length > 0;
  });

  const hasGreeted = (messages) => messages.some(m => {
    const c = m.value.content;
    return c && typeof c === 'object' && c.type === 'feed' && String(c.text || '').trim().length > 0;
  });

  const hasJoinedLarp = (messages) => {
    for (const m of messages) {
      const c = m.value.content;
      if (!c || typeof c !== 'object') continue;
      if (c.type === 'larpJoinHouse' && c.house) return true;
      if (c.type === 'larpLeaveLarp') return false;
    }
    return false;
  };

  const hasFederated = (mine, messages) => {
    try {
      const gossip = JSON.parse(fs.readFileSync(path.join(dir(), 'gossip.json'), 'utf8'));
      if (Array.isArray(gossip) && gossip.length > 0) return true;
    } catch (_) {}
    return messages.some(m => {
      const c = m.value.content;
      return c && typeof c === 'object' && c.type === 'contact' && c.following === true && c.contact && c.contact !== mine;
    });
  };

  return {
    STEPS,

    flagPath() {
      return flagPath(dir());
    },

    firstContactSeen(feedId) {
      const flag = readFlag(dir());
      return flag.exists && (!feedId || flag.id === String(feedId));
    },

    begin(feedId) {
      const target = dir();
      if (!target) return false;
      const flag = readFlag(target);
      const closed = flag.markers.has(DISMISSED) || flag.markers.has(DONE);
      const markers = closed ? [...flag.markers] : [...new Set([PENDING, ...flag.markers])];
      try {
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(flagPath(target), `${String(feedId || '')}\n${new Date().toISOString()}\n${markers.join('\n')}\n`);
        return true;
      } catch (_) {
        return false;
      }
    },

    markStep(step) {
      if (!STEPS.includes(step)) return false;
      if (step !== 'language' && step !== 'backup' && step !== 'ux') return true;
      if (!isPending(dir())) return true;
      return appendMarker(dir(), `step=${step}`);
    },

    dismiss() {
      return appendMarker(dir(), DISMISSED, true);
    },

    isVisible() {
      return isPending(dir());
    },

    async status(available) {
      const target = dir();
      const flag = readFlag(target);
      const usable = STEPS.filter(s => !available || available[s] !== false);
      let mine = '';
      let messages = [];
      try { ({ mine, messages } = await ownMessages()); } catch (_) { mine = ''; messages = []; }
      const steps = {
        language: flag.markers.has('step=language'),
        profile: hasProfile(mine, messages),
        federation: hasFederated(mine, messages),
        larp: hasJoinedLarp(messages),
        ux: flag.markers.has('step=ux'),
        backup: flag.markers.has('step=backup'),
        greeting: hasGreeted(messages)
      };
      const profile = { id: mine, name: '', description: '', image: '' };
      for (const m of messages) {
        const c = m.value.content;
        if (!c || typeof c !== 'object' || c.type !== 'about' || c.about !== mine) continue;
        if (!profile.name && String(c.name || '').trim()) profile.name = String(c.name).trim();
        if (!profile.description && String(c.description || '').trim()) profile.description = String(c.description).trim();
        if (!profile.image && String(c.image || '').trim()) profile.image = String(c.image).trim();
        if (profile.name && profile.description && profile.image) break;
      }
      const done = usable.filter(s => steps[s]).length;
      const complete = done === usable.length;
      if (complete && isPending(target)) appendMarker(target, DONE);
      return {
        id: flag.id,
        pending: isPending(target),
        dismissed: flag.markers.has(DISMISSED),
        steps,
        profile,
        usable,
        done,
        total: usable.length,
        complete
      };
    }
  };
};

module.exports.bannerVisible = bannerVisible;
module.exports.STEPS = STEPS;
