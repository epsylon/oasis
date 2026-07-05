const { mergeDuplicatesBy, norm } = require('./dedupe');

const identitySignature = (x) => (x && x.author && x.createdAt) ? norm(x.author) + '|' + norm(x.createdAt) : null;

const openInviteOf = (item) => {
  if (!item || !Array.isArray(item.invites)) return null;
  const pub = item.invites.find((inv) => inv && typeof inv === 'object' && inv.public === true && inv.code);
  return pub ? { code: pub.code } : null;
};

const collabContent = (opts = {}) => {
  const membersField = opts.membersField || 'members';
  const undecField = opts.undecField || 'undecryptable';
  const contentFields = Array.isArray(opts.contentFields) ? opts.contentFields : [];
  const listFields = Array.isArray(opts.listFields) ? opts.listFields : [];
  const arr = (v) => (Array.isArray(v) ? v : []);

  const freshestMembers = (base, dup) => {
    const bt = new Date(base.updatedAt || base.createdAt || 0).getTime();
    const dt = new Date(dup.updatedAt || dup.createdAt || 0).getTime();
    const fresh = dt >= bt ? dup : base;
    return arr(fresh[membersField]).length ? fresh[membersField]
      : (arr(base[membersField]).length ? base[membersField] : arr(dup[membersField]));
  };

  const mergePair = (base, dup) => {
    const out = { ...base, [membersField]: freshestMembers(base, dup) };
    for (const f of contentFields) out[f] = base[f] || dup[f];
    for (const f of listFields) out[f] = arr(base[f]).length ? base[f] : arr(dup[f]);
    out[undecField] = !!(base[undecField] && dup[undecField]);
    return out;
  };

  const orderForMerge = (a, b) => {
    const c = new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    if (c !== 0) return c;
    return ((a[undecField] || !a.title) ? 1 : 0) - ((b[undecField] || !b.title) ? 1 : 0);
  };

  const collapse = (items) =>
    mergeDuplicatesBy(arr(items).slice().sort(orderForMerge), identitySignature, mergePair);

  const fold = (base, all) => {
    const sig = identitySignature(base);
    if (!sig) return base;
    const group = arr(all).filter((x) => identitySignature(x) === sig);
    if (group.length <= 1) return base;
    const canonical = collapse(group)[0];
    const out = { ...base, [membersField]: canonical[membersField] };
    for (const f of contentFields) out[f] = base[f] || canonical[f];
    for (const f of listFields) out[f] = arr(base[f]).length ? base[f] : arr(canonical[f]);
    return out;
  };

  const isVisible = (item, viewerId) => {
    if (!item[undecField]) return true;
    return item.author === viewerId || arr(item[membersField]).includes(viewerId);
  };

  const visibleThenCollapsed = (items, viewerId) =>
    collapse(arr(items).filter((x) => isVisible(x, viewerId)));

  return { identitySignature, mergePair, collapse, fold, isVisible, visibleThenCollapsed };
};

module.exports = { collabContent, identitySignature, openInviteOf };
