const fs = require('fs');

const ANNOUNCE_SEEN_FILE = 'oasis-political-seen';

const isMutual = (relationship) => !!(relationship && relationship.following && relationship.followsMe);

const isRecipientAllowed = ({ pmVisibility, viewerId, recipientId, relationship } = {}) => {
  if (recipientId && viewerId && recipientId === viewerId) return true;
  if (pmVisibility !== 'mutuals') return true;
  return isMutual(relationship);
};

const announceSeenPath = () => {
  try { return require('../server/ssb_config').statePath(ANNOUNCE_SEEN_FILE); } catch (_) { return null; }
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

module.exports = { isRecipientAllowed, isMutual, announceSeenPath, readAnnounceSeen, writeAnnounceSeen, decideAnnouncement };
