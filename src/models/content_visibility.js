const up = (v) => String(v == null ? '' : v).toUpperCase();
const arr = (v) => (Array.isArray(v) ? v : []);
const isPrivateFlag = (v) => {
  if (v === false) return true;
  const s = String(v == null ? '' : v).toLowerCase();
  return s === 'private' || s === 'false' || s === '0';
};

const isContentVisibleTo = (type, c, viewer, author = null) => {
  if (!c || typeof c !== 'object') return false;
  if (c.encryptedPayload || c.encryptedQuestion || c.encryptedText) return false;
  const owner = String(author || c.author || '') === String(viewer);
  switch (type) {
    case 'task': return !isPrivateFlag(c.isPublic) || owner || arr(c.assignees).includes(viewer);
    case 'event': return !isPrivateFlag(c.isPublic) || owner || arr(c.attendees).includes(viewer);
    case 'forum': return !(c.isPrivate === true || c.isPrivate === 'true' || c.isPrivate === 'on') || owner;
    case 'job': return up(c.visibility) !== 'HIDDEN' || owner || arr(c.subscribers).includes(viewer);
    case 'housing':
    case 'market': return up(c.visibility) !== 'HIDDEN' || owner;
    case 'shop': return up(c.visibility) !== 'CLOSED' || owner;
    case 'schoolCourse': return up(c.visibility) !== 'INVITE' || owner || arr(c.students).includes(viewer) || arr(c.invited).includes(viewer);
    case 'tribe': return c.isAnonymous === false || owner || arr(c.members).includes(viewer);
    case 'poll': return !c.chatId && !c.tribeId;
    case 'curriculum': return up(c.visibility) !== 'HIDDEN' || owner;
    default: return !c.tribeId;
  }
};

module.exports = { isContentVisibleTo };
