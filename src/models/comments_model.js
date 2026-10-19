const { readTyped } = require('./typed_log');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { getConfig } = require('../configs/config-manager.js');

const MSG_ID_RE = /^%[A-Za-z0-9+/]{43}=?\.sha256$/;
const ROOT_CACHE_MAX = 2000;

const isMsgId = (v) => typeof v === 'string' && MSG_ID_RE.test(v);
const isComment = (c) => !!c && typeof c === 'object' && c.type === 'post' && isMsgId(c.root) && !c.fork;
const isBlogPost = (c) => !!c && typeof c === 'object' && c.type === 'post' && typeof c.text === 'string' && !c.root && !c.fork && !c.branch && !c.about && !c.target;
const contentOf = (m) => (m && m.value && m.value.content) || (m && m.content) || null;

const commentsModel = ({ cooler, post }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };
  const roots = new Map();

  const getMsg = async (id) => {
    const client = await openSsb();
    return new Promise((res) => client.get(id, (err, m) => res(err ? null : m)));
  };

  const remember = (id, type) => {
    if (roots.size >= ROOT_CACHE_MAX) roots.delete(roots.keys().next().value);
    roots.set(id, type);
  };

  const rootTypeOf = async (rootId) => {
    if (!isMsgId(rootId)) return null;
    if (roots.has(rootId)) return roots.get(rootId);
    const c = contentOf(await getMsg(rootId).catch(() => null));
    const type = !c || typeof c !== 'object' || typeof c.type !== 'string' ? null : (c.type === 'post' && !isBlogPost(c) ? null : c.type);
    if (type) remember(rootId, type);
    return type;
  };

  const annotate = async (items) => {
    const list = Array.isArray(items) ? items : [];
    const wanted = new Set();
    for (const it of list) { const c = contentOf(it); if (isComment(c)) wanted.add(c.root); }
    const types = new Map();
    await Promise.all([...wanted].map(async (id) => types.set(id, await rootTypeOf(id).catch(() => null))));
    for (const it of list) {
      const c = contentOf(it);
      if (!isComment(c)) continue;
      it.comment = { rootId: c.root, rootType: types.get(c.root) || null };
    }
    return list;
  };

  const locate = async (id) => {
    if (!isMsgId(id)) return null;
    const msg = await getMsg(id).catch(() => null);
    const c = contentOf(msg);
    if (!c || typeof c !== 'object' || typeof c.type !== 'string') return null;
    if (isComment(c)) return { commentId: id, rootId: c.root, rootType: await rootTypeOf(c.root).catch(() => null) };
    if (c.type === 'post') return isBlogPost(c) ? { rootId: id, rootType: 'post' } : null;
    remember(id, c.type);
    return { rootId: id, rootType: c.type, author: msg.author, content: c };
  };

  const listFor = async (rootId) => {
    if (!isMsgId(rootId)) return [];
    const raw = await post.topicComments(rootId);
    return (raw || []).filter(m => { const c = contentOf(m); return isComment(c) && c.root === rootId; })
      .sort((a, b) => (a?.value?.timestamp || 0) - (b?.value?.timestamp || 0));
  };

  const listForMany = async (ids) => {
    const want = new Set((ids || []).filter(isMsgId));
    const out = new Map();
    if (!want.size) return out;
    const client = await openSsb();
    const msgs = await readTyped(client, ['post', 'tombstone'], { limit: getConfig().ssbLogStream?.limit || 1000 });
    const gone = buildValidatedTombstoneSet(msgs || []);
    for (const m of msgs || []) {
      const c = contentOf(m);
      if (!isComment(c) || gone.has(m.key) || !want.has(c.root)) continue;
      if (!out.has(c.root)) out.set(c.root, []);
      out.get(c.root).push(m);
    }
    for (const list of out.values()) list.sort((a, b) => (a?.value?.timestamp || 0) - (b?.value?.timestamp || 0));
    return out;
  };

  const countsFor = async (ids) => {
    const want = new Set((ids || []).filter(isMsgId));
    const counts = new Map();
    if (!want.size) return counts;
    const client = await openSsb();
    const msgs = await readTyped(client, ['post', 'tombstone'], { limit: getConfig().ssbLogStream?.limit || 1000 });
    const gone = buildValidatedTombstoneSet(msgs || []);
    for (const m of msgs || []) {
      const c = contentOf(m);
      if (!isComment(c) || gone.has(m.key) || !want.has(c.root)) continue;
      counts.set(c.root, (counts.get(c.root) || 0) + 1);
    }
    return counts;
  };

  const publish = async ({ rootId, text }) => {
    if (!isMsgId(rootId)) throw new Error('Invalid root');
    return post.publish({ text, root: rootId, dest: rootId });
  };

  return { isComment, isBlogPost, rootTypeOf, annotate, locate, listFor, listForMany, countsFor, publish };
};

module.exports = commentsModel;
module.exports.isComment = isComment;
module.exports.isBlogPost = isBlogPost;
