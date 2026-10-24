const fs = require('fs');

const ANNOUNCE_SEEN_FILE = 'oasis-political-seen';
const SUPPORTERS_SEEN_FILE = 'supporters-seen.json';

const isMutual = (relationship) => !!(relationship && relationship.following && relationship.followsMe);

const isRecipientAllowed = ({ pmVisibility, viewerId, recipientId, relationship } = {}) => {
  if (recipientId && viewerId && recipientId === viewerId) return true;
  if (pmVisibility === 'mutuals') return isMutual(relationship);
  if (pmVisibility === 'following') return !!(relationship && relationship.following);
  return true;
};

const announceSeenPath = () => {
  try { return require('../configs/state-manager').statePath(ANNOUNCE_SEEN_FILE); } catch (_) { return null; }
};

const readAnnounceSeen = () => {
  const file = announceSeenPath();
  if (!file) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) { return {}; }
};

const writeAnnounceSeen = (state) => {
  const file = announceSeenPath();
  if (!file) return false;
  try { fs.writeFileSync(file, JSON.stringify(state || {})); return true; } catch (_) { return false; }
};

const everAnnounced = (announced, subject) => {
  for (const entry of (announced || [])) {
    if (String(entry).startsWith(`${subject}|`)) return true;
  }
  return false;
};

const decideAnnouncement = ({ subject, ref, announced = new Set(), seen = {} } = {}) => {
  if (!subject || !ref) return { send: false, remember: false };
  const key = String(ref);
  if (announced.has(`${subject}|${key}`)) return { send: false, remember: false };
  if (seen[subject] === key) return { send: false, remember: false };
  if (!everAnnounced(announced, subject) && seen[subject] === undefined) {
    return { send: false, remember: true };
  }
  return { send: true, remember: true };
};

const supportersSeenPath = () => {
  try { return require('../configs/state-manager').statePath(SUPPORTERS_SEEN_FILE); } catch (_) { return null; }
};

const readSupportersSeen = () => {
  const file = supportersSeenPath();
  if (!file) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && Array.isArray(parsed.ids) ? { ids: parsed.ids.map(String), since: Number(parsed.since) || 0 } : null;
  } catch (_) { return null; }
};

const writeSupportersSeen = (state) => {
  const file = supportersSeenPath();
  if (!file) return false;
  try { fs.writeFileSync(file, JSON.stringify({ ids: Array.from(new Set((state && state.ids) || [])), since: Number(state && state.since) || Date.now() })); return true; } catch (_) { return false; }
};

const SUPPORTERS_PER_ROUND = 20;
const SUPPORTERS_LOOKUPS = 50;

const newSupporters = (current, seen, followedAt = null, now = Date.now()) => {
  const ids = Array.from(new Set(Array.from(current || []).map(String)));
  if (!seen || !Array.isArray(seen.ids)) return { announce: [], state: { ids, since: now }, changed: true };
  const known = new Set(seen.ids.map(String));
  const since = Number(seen.since) || now;
  const fresh = ids.filter(id => !known.has(id));
  const dated = (id) => !followedAt || Number.isFinite(followedAt.get(id));
  const before = fresh.filter(id => dated(id) && followedAt && followedAt.get(id) < since);
  const announce = fresh.filter(id => dated(id) && !before.includes(id)).slice(0, SUPPORTERS_PER_ROUND);
  return { announce, state: { ids: Array.from(new Set([...known, ...before, ...announce])), since }, changed: before.length + announce.length > 0 || !Number(seen.since) };
};

module.exports = { isRecipientAllowed, isMutual, announceSeenPath, readAnnounceSeen, writeAnnounceSeen, decideAnnouncement, readSupportersSeen, writeSupportersSeen, newSupporters, SUPPORTERS_PER_ROUND, SUPPORTERS_LOOKUPS };
