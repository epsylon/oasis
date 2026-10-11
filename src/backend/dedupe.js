const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();

const dedupeBy = (items, keyFn) => {
  const seen = new Set();
  const out = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    let k = null;
    try { k = keyFn(it); } catch (_) { k = null; }
    if (k == null || k === '') { out.push(it); continue; }
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
};

const mergeDuplicatesBy = (items, keyFn, mergeFn) => {
  const slots = new Map();
  const out = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    let k = null;
    try { k = keyFn(it); } catch (_) { k = null; }
    if (k == null || k === '') { out.push(it); continue; }
    if (!slots.has(k)) {
      const slot = { i: out.length, v: it };
      slots.set(k, slot);
      out.push(it);
    } else {
      const slot = slots.get(k);
      slot.v = mergeFn(slot.v, it);
      out[slot.i] = slot.v;
    }
  }
  return out;
};

const dedupeByPreferring = (items, keyFn, scoreFn) => {
  const best = new Map();
  const order = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    let k = null;
    try { k = keyFn(it); } catch (_) { k = null; }
    if (k == null || k === '') { order.push({ solo: it }); continue; }
    let s = 0;
    try { s = Number(scoreFn(it)) || 0; } catch (_) { s = 0; }
    if (!best.has(k)) { const slot = { v: it, s }; best.set(k, slot); order.push({ slot }); }
    else { const slot = best.get(k); if (s > slot.s) { slot.v = it; slot.s = s; } }
  }
  return order.map(o => (o.solo !== undefined ? o.solo : o.slot.v));
};

const versionGroups = (entries) => {
  const byKey = new Map();
  for (const e of (entries || [])) if (e && e.key) byKey.set(e.key, e);
  const memo = new Map();
  const rootOf = (key) => {
    if (memo.has(key)) return memo.get(key);
    const path = [];
    const seen = new Set([key]);
    let cur = key;
    let root = null;
    while (root === null) {
      if (memo.has(cur)) { root = memo.get(cur); break; }
      const e = byKey.get(cur);
      const p = e && e.replaces;
      if (!p || !byKey.has(p) || seen.has(p)) { root = cur; break; }
      path.push(cur);
      seen.add(p);
      cur = p;
    }
    memo.set(cur, root);
    for (const k of path) memo.set(k, root);
    return root;
  };
  const isOrphan = (key) => {
    const e = byKey.get(key);
    return !!(e && e.replaces && !byKey.has(e.replaces));
  };
  const isForeignCopy = (key) => {
    const e = byKey.get(key);
    return !!(e && isOrphan(key) && typeof e.claimedAuthor === 'string' && e.claimedAuthor && e.claimedAuthor !== e.author);
  };
  const groups = new Map();
  for (const k of byKey.keys()) {
    const r = rootOf(k);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(k);
  }
  const later = (a, b) => (a.seq || 0) > (b.seq || 0) || ((a.seq || 0) === (b.seq || 0) && (a.ts || 0) >= (b.ts || 0));
  for (const [r, keys] of Array.from(groups.entries())) {
    if (!isForeignCopy(r)) continue;
    const owner = byKey.get(r).claimedAuthor;
    let first = null;
    for (const k of keys) { const e = byKey.get(k); if (e.author === owner && (!first || later(byKey.get(first), e))) first = k; }
    if (!first) continue;
    groups.delete(r);
    groups.set(first, keys);
    for (const k of keys) memo.set(k, first);
  }
  const ownerTip = new Map();
  for (const [r, keys] of groups) {
    const re = byKey.get(r);
    for (const k of keys) {
      const e = byKey.get(k);
      if (!re || e.author !== re.author) continue;
      const prev = ownerTip.has(r) ? byKey.get(ownerTip.get(r)) : null;
      if (!prev || later(e, prev)) ownerTip.set(r, k);
    }
  }
  const isForeign = (key) => {
    const e = byKey.get(key);
    const re = byKey.get(rootOf(key));
    return !!(e && re && e.author !== re.author);
  };
  const roots = new Set();
  for (const r of groups.keys()) if (!isForeignCopy(r)) roots.add(r);
  const tipOf = (key) => { const r = rootOf(key); return ownerTip.get(r) || r; };
  return { rootOf, tipOf, roots, groups, isOrphan, isForeign, isForeignCopy };
};

const versionEntry = (m) => {
  const v = (m && m.value) || {};
  const c = v.content || {};
  return { key: m && m.key, author: v.author, seq: v.sequence || 0, ts: v.timestamp || (m && m.timestamp) || 0, replaces: typeof c.replaces === 'string' ? c.replaces : null, claimedAuthor: typeof c.author === 'string' ? c.author : null };
};

module.exports = { dedupeBy, mergeDuplicatesBy, dedupeByPreferring, norm, versionGroups, versionEntry };
