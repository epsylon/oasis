const { readTyped } = require('./typed_log');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

const slugify = (value) => String(value == null ? '' : value)
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

const linkTarget = (raw) => {
  const s = String(raw || '').trim();
  const wikiPath = s.match(/\/wiki\/([^?#]+)/);
  if (wikiPath) { try { return decodeURIComponent(wikiPath[1]).trim(); } catch (_) { return wikiPath[1].trim(); } }
  if (/^[a-z]+:\/\//i.test(s)) {
    const seg = s.replace(/[?#].*$/, '').split('/').filter(Boolean).pop() || '';
    try { return decodeURIComponent(seg).trim(); } catch (_) { return seg.trim(); }
  }
  const idx = s.lastIndexOf(':');
  return idx >= 0 ? s.slice(idx + 1).trim() : s;
};

const extractWikiLinks = (text) => {
  const out = [];
  const seen = new Set();
  for (const m of String(text || '').matchAll(WIKILINK_RE)) {
    const slug = slugify(linkTarget(m[1]));
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
};

const WIKI_TYPE = 'wikiPage';
const ENVELOPE_TYPE = 'tribe-msg';
const EDIT_POLICIES = ['open', 'author', 'tribe'];
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CHANGES = 60;
const MAX_TITLE = 100;
const IMAGE_RE = /!\[image:[^\]]*\]\((&[^)]+)\)/;

const safeText = (v) => String(v == null ? '' : v).trim();
const normalizeList = (raw) => {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(',');
  return Array.from(new Set(arr.map(t => String(t || '').trim()).filter(Boolean)));
};
const normalizePolicy = (v) => {
  const s = String(v || '').toLowerCase();
  if (s === 'closed') return 'author';
  return EDIT_POLICIES.includes(s) ? s : 'open';
};

module.exports = ({ cooler, tribeCrypto = null, tribesModel = null }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const tribeRootId = async (tribeId) => {
    if (!tribesModel || !tribeId) return tribeId;
    try { return await tribesModel.getRootId(tribeId); } catch (_) { return tribeId; }
  };

  const tribeKeyFor = async (tribeId) => {
    if (!tribeCrypto || !tribeId) return null;
    const rootId = await tribeRootId(tribeId);
    return tribeCrypto.getKey(rootId) || null;
  };

  const readEntries = async (ssbClient) => {
    const msgs = await readTyped(ssbClient, [WIKI_TYPE, 'tombstone', ENVELOPE_TYPE], { limit: logLimit });
    const fpIdx = tribeCrypto && typeof tribeCrypto.buildFingerprintIndex === 'function' ? tribeCrypto.buildFingerprintIndex() : null;
    const out = [];
    for (const m of msgs) {
      const v = m && m.value;
      const c = v && v.content;
      if (!c || typeof c !== 'object') continue;
      if (c.type === WIKI_TYPE || c.type === 'tombstone') { out.push(m); continue; }
      if (!fpIdx || !tribeCrypto.isTribeMsg(c)) continue;
      const r = tribeCrypto.unwrapMsg(c, fpIdx);
      if (!r || !r.body || typeof r.body !== 'object') continue;
      const body = r.body;
      if (body.k === WIKI_TYPE) {
        const flat = { ...body, type: WIKI_TYPE };
        delete flat.k;
        out.push({ ...m, value: { ...v, content: flat } });
      } else if (body.k === 'tombstone' && typeof body.target === 'string') {
        out.push({ ...m, value: { ...v, content: { type: 'tombstone', target: body.target, deletedAt: body.deletedAt, author: body.author || v.author } } });
      }
    }
    return out;
  };

  const buildIndex = (entries) => {
    const tomb = buildValidatedTombstoneSet(entries);
    const nodes = new Map();
    const parentOf = new Map();
    for (const m of entries) {
      const c = m.value.content;
      if (c.type !== WIKI_TYPE) continue;
      nodes.set(m.key, { key: m.key, author: m.value.author, ts: m.value.timestamp || m.timestamp || 0, c });
      if (typeof c.replaces === 'string') parentOf.set(m.key, c.replaces);
    }
    const rootOf = (key) => {
      const seen = new Set();
      let cur = key;
      while (parentOf.has(cur) && !seen.has(cur)) { seen.add(cur); cur = parentOf.get(cur); }
      return cur;
    };
    const versionsByRoot = new Map();
    for (const node of nodes.values()) {
      const root = rootOf(node.key);
      if (tomb.has(root)) continue;
      if (!versionsByRoot.has(root)) versionsByRoot.set(root, []);
      versionsByRoot.get(root).push(node);
    }
    const pages = [];
    for (const [root, versions] of versionsByRoot) {
      versions.sort((a, b) => a.ts - b.ts);
      const first = versions[0];
      const tip = versions[versions.length - 1];
      const c = tip.c;
      const body = safeText(c.body);
      pages.push({
        id: root,
        rootId: root,
        tipId: tip.key,
        slug: safeText(c.slug) || slugify(c.title),
        title: safeText(c.title).slice(0, MAX_TITLE),
        body,
        image: (body.match(IMAGE_RE) || [])[1] || null,
        tags: normalizeList(c.tags),
        aliases: normalizeList(c.aliases).map(slugify).filter(Boolean),
        editPolicy: normalizePolicy(c.editPolicy),
        tribeId: c.tribeId || null,
        encrypted: !!c.tribeId,
        author: first.c.author || first.author,
        lastAuthor: c.author || tip.author,
        createdAt: first.c.createdAt || new Date(first.ts).toISOString(),
        updatedAt: c.updatedAt || new Date(tip.ts).toISOString(),
        ts: tip.ts,
        versionCount: versions.length,
        links: extractWikiLinks(body),
        versions: versions.map(vn => ({
          key: vn.key,
          author: vn.c.author || vn.author,
          ts: vn.ts,
          createdAt: vn.c.updatedAt || vn.c.createdAt || new Date(vn.ts).toISOString(),
          title: safeText(vn.c.title),
          body: safeText(vn.c.body),
          tags: normalizeList(vn.c.tags),
          summary: safeText(vn.c.summary)
        }))
      });
    }
    pages.sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
    return { pages, rootOf, nodes };
  };

  const sameScope = (page, tribeId) => String(page.tribeId || '') === String(tribeId || '');

  const scopePages = async (pages, tribeId) => {
    if (tribeId === 'any') return pages;
    if (!tribeId) return pages.filter(p => !p.tribeId);
    const chain = tribesModel && typeof tribesModel.getChainIds === 'function'
      ? await tribesModel.getChainIds(tribeId).catch(() => [tribeId])
      : [tribeId];
    const set = new Set(chain.map(String));
    return pages.filter(p => p.tribeId && set.has(String(p.tribeId)));
  };

  const decorate = (pages, scoped) => {
    const bySlug = new Map();
    for (const p of scoped) {
      const keys = [p.slug, ...p.aliases];
      for (const s of keys) if (s && !bySlug.has(s)) bySlug.set(s, p);
    }
    const inbound = new Map();
    for (const p of scoped) {
      for (const s of p.links) {
        const target = bySlug.get(s);
        if (!target || target.id === p.id) continue;
        if (!inbound.has(target.id)) inbound.set(target.id, new Set());
        inbound.get(target.id).add(p.id);
      }
    }
    return scoped.map(p => ({
      ...p,
      backlinkCount: (inbound.get(p.id) || new Set()).size,
      missingLinks: p.links.filter(s => !bySlug.has(s)),
      isOrphan: !(inbound.get(p.id) || new Set()).size
    }));
  };

  const findInScope = (scoped, idOrSlug) => {
    const needle = String(idOrSlug || '').trim();
    if (!needle) return null;
    if (needle.startsWith('%')) return scoped.find(p => p.id === needle || p.tipId === needle || p.versions.some(v => v.key === needle)) || null;
    const slug = slugify(needle);
    return scoped.find(p => p.slug === slug) || scoped.find(p => p.aliases.includes(slug)) || null;
  };

  const publishContent = async (ssbClient, content) => {
    let msg = content;
    if (content.tribeId) {
      const key = await tribeKeyFor(content.tribeId);
      if (!key) throw new Error('Missing tribe key — cannot publish encrypted wiki page');
      msg = tribeCrypto.wrapMsg({ k: WIKI_TYPE, ...content }, key);
    }
    return new Promise((resolve, reject) => ssbClient.publish(msg, (err, res) => err ? reject(err) : resolve(res)));
  };

  const load = async () => {
    const ssbClient = await openSsb();
    const idx = buildIndex(await readEntries(ssbClient));
    return { ssbClient, idx };
  };

  const canEdit = async (page, viewer) => {
    if (!page) return false;
    const owner = String(page.author) === String(viewer);
    if (page.editPolicy === 'author') return owner;
    if (page.tribeId) {
      if (!tribesModel) return owner;
      try {
        const t = await tribesModel.getTribeById(page.tribeId);
        return owner || (Array.isArray(t.members) && t.members.includes(viewer));
      } catch (_) { return owner; }
    }
    if (page.editPolicy === 'tribe') return owner;
    return true;
  };

  return {
    WIKI_TYPE,
    EDIT_POLICIES,
    slugify,

    async createPage({ title, body, tags, aliases, editPolicy, tribeId = null }) {
      const { ssbClient, idx } = await load();
      const cleanTitle = safeText(title).slice(0, MAX_TITLE);
      if (!cleanTitle) throw new Error('Title required');
      const slug = slugify(cleanTitle);
      if (!slug) throw new Error('Title required');
      const scoped = await scopePages(idx.pages, tribeId);
      const existing = scoped.find(p => p.slug === slug);
      if (existing) return { key: existing.id, existing: true };
      const now = new Date().toISOString();
      const content = {
        type: WIKI_TYPE,
        title: cleanTitle,
        slug,
        body: safeText(body),
        tags: normalizeList(tags),
        aliases: normalizeList(aliases).map(slugify).filter(Boolean),
        editPolicy: normalizePolicy(editPolicy),
        author: ssbClient.id,
        createdAt: now,
        updatedAt: now,
        ...(tribeId ? { tribeId } : {})
      };
      const res = await publishContent(ssbClient, content);
      return { key: res.key, existing: false };
    },

    async updatePage(id, data = {}) {
      const { ssbClient, idx } = await load();
      const page = findInScope(idx.pages, id);
      if (!page) throw new Error('Page not found');
      if (!(await canEdit(page, ssbClient.id))) throw new Error('Not allowed to edit');
      const now = new Date().toISOString();
      const nextTitle = data.title !== undefined ? safeText(data.title).slice(0, MAX_TITLE) : page.title;
      const content = {
        type: WIKI_TYPE,
        title: nextTitle || page.title,
        slug: page.slug,
        body: data.body !== undefined ? safeText(data.body) : page.body,
        tags: data.tags !== undefined ? normalizeList(data.tags) : page.tags,
        aliases: data.aliases !== undefined ? normalizeList(data.aliases).map(slugify).filter(Boolean) : page.aliases,
        editPolicy: data.editPolicy !== undefined ? normalizePolicy(data.editPolicy) : page.editPolicy,
        summary: safeText(data.summary).slice(0, 200),
        author: ssbClient.id,
        createdAt: page.createdAt,
        updatedAt: now,
        replaces: page.tipId,
        ...(page.tribeId ? { tribeId: page.tribeId } : {})
      };
      const res = await publishContent(ssbClient, content);
      return { key: res.key, rootId: page.id };
    },

    async restoreVersion(id, versionKey) {
      const { idx } = await load();
      const page = findInScope(idx.pages, id);
      if (!page) throw new Error('Page not found');
      const version = page.versions.find(v => v.key === versionKey);
      if (!version) throw new Error('Version not found');
      return this.updatePage(page.id, { title: version.title, body: version.body, tags: version.tags, summary: `restore:${versionKey}` });
    },

    async deletePage(id) {
      const { ssbClient, idx } = await load();
      const page = findInScope(idx.pages, id);
      if (!page) throw new Error('Page not found');
      if (String(page.author) !== String(ssbClient.id)) throw new Error('Only the creator can delete');
      const deletedAt = new Date().toISOString();
      const tomb = { type: 'tombstone', target: page.id, deletedAt, author: ssbClient.id };
      let msg = tomb;
      if (page.tribeId) {
        const key = await tribeKeyFor(page.tribeId);
        if (!key) throw new Error('Missing tribe key — cannot delete encrypted wiki page');
        msg = tribeCrypto.wrapMsg({ k: 'tombstone', target: page.id, deletedAt, author: ssbClient.id }, key);
      }
      return new Promise((resolve, reject) => ssbClient.publish(msg, (err, res) => err ? reject(err) : resolve(res)));
    },

    async getPage(idOrSlug, { tribeId = null } = {}) {
      const { ssbClient, idx } = await load();
      let scoped = await scopePages(idx.pages, tribeId);
      let page = findInScope(scoped, idOrSlug);
      if (!page && String(idOrSlug || '').startsWith('%')) {
        page = findInScope(idx.pages, idOrSlug);
        if (page) scoped = await scopePages(idx.pages, page.tribeId || null);
      }
      if (!page) return null;
      const decorated = decorate(idx.pages, scoped);
      const full = decorated.find(p => p.id === page.id) || page;
      const bySlug = new Map();
      for (const p of scoped) for (const s of [p.slug, ...p.aliases]) if (s && !bySlug.has(s)) bySlug.set(s, p);
      const backlinks = decorated.filter(p => p.id !== full.id && p.links.some(s => bySlug.get(s) && bySlug.get(s).id === full.id));
      return { ...full, backlinks, canEdit: await canEdit(full, ssbClient.id), isOwner: String(full.author) === String(ssbClient.id) };
    },

    async listPages({ tribeId = null, filter = 'all', q = '', viewerId } = {}) {
      const { ssbClient, idx } = await load();
      const me = viewerId || ssbClient.id;
      const scoped = decorate(idx.pages, await scopePages(idx.pages, tribeId));
      let list = scoped;
      const f = String(filter || 'all').toLowerCase();
      if (f === 'mine') list = list.filter(p => String(p.author) === String(me) || p.versions.some(v => String(v.author) === String(me)));
      else if (f === 'recent') list = list.filter(p => Date.now() - p.ts <= RECENT_MS);
      else if (f === 'orphans') list = list.filter(p => p.isOrphan);
      const needle = safeText(q).toLowerCase();
      if (needle) list = list.filter(p => p.title.toLowerCase().includes(needle) || p.body.toLowerCase().includes(needle) || p.tags.some(t => t.toLowerCase().includes(needle)));
      return list.slice().sort((a, b) => b.ts - a.ts);
    },

    async recentChanges({ tribeId = null } = {}) {
      const { idx } = await load();
      const scoped = await scopePages(idx.pages, tribeId);
      const changes = [];
      for (const p of scoped) {
        p.versions.forEach((v, i) => changes.push({
          pageId: p.id, slug: p.slug, title: v.title || p.title, tribeId: p.tribeId || null,
          versionKey: v.key, author: v.author, ts: v.ts, createdAt: v.createdAt, summary: v.summary, index: i + 1, isCreation: i === 0
        }));
      }
      return changes.sort((a, b) => b.ts - a.ts || b.index - a.index).slice(0, MAX_CHANGES);
    },

    async resolveRootId(id) {
      const { idx } = await load();
      const page = findInScope(idx.pages, id);
      if (!page) throw new Error('Not found');
      return page.id;
    },

    async canEditPage(id, viewer) {
      const { ssbClient, idx } = await load();
      const page = findInScope(idx.pages, id);
      return canEdit(page, viewer || ssbClient.id);
    }
  };
};

Object.assign(module.exports, { WIKILINK_RE, slugify, linkTarget, extractWikiLinks });
