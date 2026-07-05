const pull = require("../server/node_modules/pull-stream");
const { getConfig } = require("../configs/config-manager.js");
const categories = require("../backend/opinion_categories");
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { dedupeBy, norm } = require('../backend/dedupe');
const mediaFavorites = require("../backend/media-favorites");

const logLimit = getConfig().ssbLogStream?.limit || 1000;

const safeArr = (v) => (Array.isArray(v) ? v : []);
const safeText = (v) => String(v || "").trim();

const parseBlobId = (blobMarkdown) => {
  if (!blobMarkdown) return null;
  const s = String(blobMarkdown);
  const match = s.match(/\(([^)]+)\)/);
  return match ? match[1] : s.trim();
};

const parseCSV = (str) =>
  str === undefined || str === null ? undefined : String(str).split(",").map((s) => s.trim()).filter(Boolean);

const voteSum = (opinions = {}) => Object.values(opinions || {}).reduce((s, n) => s + (Number(n) || 0), 0);

module.exports = ({ cooler }) => {
  let ssb;
  let userId;

  const openSsb = async () => {
    if (!ssb) {
      ssb = await cooler.open();
      userId = ssb.id;
    }
    return ssb;
  };

  const getAllMessages = async (ssbClient) =>
    new Promise((resolve, reject) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => (err ? reject(err) : resolve(msgs)))
      );
    });

  const buildIndex = (messages) => {
    const tomb = buildValidatedTombstoneSet(messages);
    const nodes = new Map();
    const parent = new Map();
    const child = new Map();
    const strictChild = new Map();
    const opinionMsgs = [];

    for (const m of messages) {
      const k = m.key;
      const v = m.value || {};
      const c = v.content;
      if (!c) continue;

      if (c.type === "tombstone") continue;
      if (c.type === "documentOpinion") { opinionMsgs.push({ target: c.target, author: v.author, category: c.category }); continue; }
      if (c.type !== "document") continue;

      const ts = v.timestamp || m.timestamp || 0;
      let sizeBytes = 0;
      try { sizeBytes = Buffer.byteLength(JSON.stringify(v), "utf8"); } catch (_) { sizeBytes = 0; }
      nodes.set(k, { key: k, ts, c, sizeBytes, author: v.author });

      if (c.replaces) {
        parent.set(k, c.replaces);
        child.set(c.replaces, k);
      }
    }

    for (const [k, t] of Array.from(parent.entries())) {
      const orig = nodes.get(t);
      const node = nodes.get(k);
      if (orig && node && orig.author === node.author) continue;
      parent.delete(k);
      if (child.get(t) === k) child.delete(t);
      if (orig) nodes.delete(k);
    }

    for (const [k, node] of nodes) {
      const t = node.c.replaces;
      if (t) { const orig = nodes.get(t); if (orig && orig.author === node.author) strictChild.set(t, k); }
    }

    const rootOf = (id) => {
      let cur = id, g = 0;
      while (parent.has(cur) && nodes.has(parent.get(cur)) && g++ < 100000) cur = parent.get(cur);
      return cur;
    };

    const contentTipOf = (root) => {
      let cur = root, g = 0;
      while (strictChild.has(cur) && g++ < 100000) cur = strictChild.get(cur);
      const n = nodes.get(cur), rn = nodes.get(root);
      return (n && rn && n.author === rn.author) ? cur : root;
    };

    const roots = new Set();
    for (const id of nodes.keys()) roots.add(rootOf(id));

    const opinionsByRoot = new Map();
    for (const op of opinionMsgs) { if (!nodes.has(op.target)) continue; const r = rootOf(op.target); if (!opinionsByRoot.has(r)) opinionsByRoot.set(r, []); opinionsByRoot.get(r).push(op); }

    const forward = new Map();
    for (const [newId, oldId] of parent.entries()) forward.set(oldId, newId);

    const resolveGroup = (root) => {
      const contentTip = contentTipOf(root);
      const contentNode = nodes.get(contentTip) || nodes.get(root);
      const lc = contentNode ? contentNode.c : {};
      const opinions = { ...(lc.opinions || {}) };
      const voters = safeArr(lc.opinions_inhabitants).slice();
      const voterSet = new Set(voters);
      for (const op of (opinionsByRoot.get(root) || [])) {
        if (voterSet.has(op.author)) continue;
        voterSet.add(op.author); voters.push(op.author);
        opinions[op.category] = (opinions[op.category] || 0) + 1;
      }
      return { contentTip, contentNode, opinions, voters };
    };

    const tipByRoot = new Map();
    for (const r of roots) tipByRoot.set(r, contentTipOf(r));

    return { tomb, nodes, parent, child, rootOf, tipByRoot, forward, resolveGroup };
  };

  const pickDoc = (node, rootId, agg) => {
    const c = node.c || {};
    return {
      key: node.key,
      rootId,
      url: c.url,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt || null,
      tags: safeArr(c.tags),
      author: node.author,
      title: c.title || "",
      description: c.description || "",
      opinions: agg ? agg.opinions : (c.opinions || {}),
      opinions_inhabitants: agg ? agg.voters : safeArr(c.opinions_inhabitants),
      sizeBytes: node.sizeBytes || 0
    };
  };

  const hasBlob = (ssbClient, blobId) =>
    new Promise((resolve) => {
      if (!blobId) return resolve(false);
      ssbClient.blobs.has(blobId, (err, has) => resolve(!err && !!has));
    });

  const favoritesSetForDocuments = async () => {
    try {
      return await mediaFavorites.getFavoriteSet("documents");
    } catch {
      return new Set();
    }
  };

  return {
    type: "document",

    async resolveCurrentId(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);

      const tip = idx.tipByRoot.get(idx.rootOf(id)) || id;
      if (idx.tomb.has(tip)) throw new Error("Document not found");
      return tip;
    },

    async resolveRootId(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);

      let tip = id;
      while (idx.forward.has(tip)) tip = idx.forward.get(tip);
      if (idx.tomb.has(tip)) throw new Error("Document not found");

      let root = tip;
      while (idx.parent.has(root)) root = idx.parent.get(root);
      return root;
    },

    async createDocument(blobMarkdown, tagsRaw, title, description) {
      const ssbClient = await openSsb();
      const blobId = parseBlobId(blobMarkdown);
      if (!blobId) throw new Error("Missing document blob");

      const tags = parseCSV(tagsRaw) || [];

      const content = {
        type: "document",
        url: blobId,
        createdAt: new Date().toISOString(),
        author: userId,
        tags,
        title: title || "",
        description: description || "",
        opinions: {},
        opinions_inhabitants: []
      };

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => (err ? reject(err) : resolve(res)));
      });
    },

    async updateDocumentById(id, blobMarkdown, tagsRaw, title, description) {
      const ssbClient = await openSsb();
      const tipId = await this.resolveCurrentId(id);

      const oldMsg = await new Promise((res, rej) =>
        ssbClient.get(tipId, (err, msg) => (err || !msg ? rej(new Error("Document not found")) : res(msg)))
      );

      if (oldMsg.content?.type !== "document") throw new Error("Document not found");
      if (String(oldMsg.content.author) !== String(userId)) throw new Error("Not the author");
      const aggDoc = await this.getDocumentById(id);
      if (aggDoc && Object.keys(aggDoc.opinions || {}).some(k => (aggDoc.opinions[k] || 0) > 0)) throw new Error("Cannot edit document after it has received opinions.");

      const parsedTags = parseCSV(tagsRaw);
      const tags = parsedTags !== undefined ? parsedTags : safeArr(oldMsg.content.tags);

      const blobId = parseBlobId(blobMarkdown);

      const updatedAt = new Date().toISOString();

      const updated = {
        ...oldMsg.content,
        replaces: tipId,
        url: blobId || oldMsg.content.url,
        tags,
        title: title !== undefined ? (title || "") : oldMsg.content.title || "",
        description: description !== undefined ? (description || "") : oldMsg.content.description || "",
        updatedAt
      };

      const tombstone = { type: "tombstone", target: tipId, deletedAt: updatedAt, author: userId };
      await new Promise((res, rej) => ssbClient.publish(tombstone, (e) => (e ? rej(e) : res())));

      return new Promise((resolve, reject) => {
        ssbClient.publish(updated, (err2, result) => (err2 ? reject(err2) : resolve(result)));
      });
    },

    async deleteDocumentById(id) {
      const ssbClient = await openSsb();
      const tipId = await this.resolveCurrentId(id);

      const msg = await new Promise((res, rej) =>
        ssbClient.get(tipId, (err, m) => (err || !m ? rej(new Error("Document not found")) : res(m)))
      );

      if (msg.content?.type !== "document") throw new Error("Document not found");
      if (String(msg.content.author) !== String(userId)) throw new Error("Not the author");

      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId };

      return new Promise((resolve, reject) => {
        ssbClient.publish(tombstone, (err2, res) => (err2 ? reject(err2) : resolve(res)));
      });
    },

    async listAll(arg1 = "all") {
      const ssbClient = await openSsb();

      const opts = typeof arg1 === "object" && arg1 !== null ? arg1 : { filter: arg1 };
      const filter = safeText(opts.filter || "all");
      const q = safeText(opts.q || "").toLowerCase();
      const sort = safeText(opts.sort || "recent");

      const favorites = await favoritesSetForDocuments();

      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);

      const items = [];
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue;
        const node = idx.nodes.get(tipId);
        if (!node) continue;
        items.push(pickDoc(node, rootId, idx.resolveGroup(rootId)));
      }

      let out = dedupeBy(items, x => x.url ? [norm(x.author), norm(x.url)].join('|') : null);
      const now = Date.now();

      if (filter === "mine") out = out.filter((d) => String(d.author) === String(userId));
      else if (filter === "recent") out = out.filter((d) => new Date(d.createdAt).getTime() >= now - 86400000);
      else if (filter === "favorites") out = out.filter((d) => favorites.has(d.rootId || d.key));

      if (q) {
        out = out.filter((d) => {
          const t = String(d.title || "").toLowerCase();
          const desc = String(d.description || "").toLowerCase();
          const u = String(d.url || "").toLowerCase();
          const a = String(d.author || "").toLowerCase();
          const tags = safeArr(d.tags).join(" ").toLowerCase();
          return t.includes(q) || desc.includes(q) || u.includes(q) || a.includes(q) || tags.includes(q);
        });
      }

      const effectiveSort = filter === "top" ? "top" : sort;

      if (effectiveSort === "top") {
        out = out
          .slice()
          .sort((a, b) => voteSum(b.opinions) - voteSum(a.opinions) || new Date(b.createdAt) - new Date(a.createdAt));
      } else if (effectiveSort === "oldest") {
        out = out.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      } else {
        out = out.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      const checked = await Promise.all(out.map(async (d) => ((await hasBlob(ssbClient, d.url)) ? d : null)));
      return checked
        .filter(Boolean)
        .map((d) => ({ ...d, isFavorite: favorites.has(d.rootId || d.key) }));
    },

    async getDocumentById(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);
      const favorites = await favoritesSetForDocuments();

      const rootId = idx.rootOf(id);
      const agg = idx.resolveGroup(rootId);
      if (!agg.contentNode || idx.tomb.has(agg.contentTip)) throw new Error("Document not found");

      const c = agg.contentNode.c || {};
      return {
        key: agg.contentTip,
        rootId,
        url: c.url,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt || null,
        tags: c.tags || [],
        author: agg.contentNode.author,
        title: c.title || "",
        description: c.description || "",
        opinions: agg.opinions,
        opinions_inhabitants: agg.voters,
        isFavorite: favorites.has(rootId || agg.contentTip)
      };
    },

    async createOpinion(id, category) {
      if (!categories.includes(category)) return Promise.reject(new Error("Invalid voting category"));

      const ssbClient = await openSsb();

      const doc = await this.getDocumentById(id);
      if (!doc) throw new Error("Document not found");
      if (safeArr(doc.opinions_inhabitants).includes(userId)) throw new Error("Already voted");

      const content = { type: "documentOpinion", target: doc.rootId, category, createdAt: new Date().toISOString() };
      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, result) => (err ? reject(err) : resolve(result)));
      });
    }
  };
};

