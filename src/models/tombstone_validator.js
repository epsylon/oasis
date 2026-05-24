function buildValidatedTombstoneSet(messages) {
  if (!Array.isArray(messages)) return new Set();
  const tombClaims = new Map();
  const targetAuthors = new Map();
  const targetRoots = new Map();
  for (const m of messages) {
    if (!m || !m.value) continue;
    const v = m.value;
    const c = v.content;
    if (!c) continue;
    if (typeof c === 'object' && c.type === 'tombstone' && typeof c.target === 'string') {
      const ts = v.timestamp || 0;
      const prev = tombClaims.get(c.target);
      if (!prev || ts > prev.ts) tombClaims.set(c.target, { author: v.author, ts, rootId: c._rootId || null });
      continue;
    }
    if (m.key) {
      targetAuthors.set(m.key, v.author);
      if (typeof c === 'object' && c._rootId) targetRoots.set(m.key, c._rootId);
    }
  }
  const out = new Set();
  for (const [target, { author, rootId }] of tombClaims.entries()) {
    if (targetAuthors.get(target) !== author) continue;
    if (rootId) {
      const targetRoot = targetRoots.get(target);
      if (targetRoot !== rootId) continue;
    }
    out.add(target);
  }
  return out;
}

function isTombstoneFromAuthor(tombstoneMsg, targetAuthor) {
  if (!tombstoneMsg || !tombstoneMsg.value) return false;
  return tombstoneMsg.value.author === targetAuthor;
}

module.exports = { buildValidatedTombstoneSet, isTombstoneFromAuthor };
