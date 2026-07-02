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

module.exports = { dedupeBy, norm };
