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

module.exports = { dedupeBy, mergeDuplicatesBy, dedupeByPreferring, norm };
