const pull = require("../server/node_modules/pull-stream");
const { getConfig } = require("../configs/config-manager.js");
const categories = require("../backend/opinion_categories");
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
    const tomb = new Set();
    const nodes = new Map();
    const parent = new Map();
    const child = new Map();

    for (const m of messages) {
      const k = m.key;
      const v = m.value || {};
      const c = v.content;
      if (!c) continue;

      if (c.type === "tombstone" && c.target) {
        tomb.add(c.target);
        continue;
      }

      if (c.type !== "document") continue;

      const ts = v.timestamp || m.timestamp || 0;
      nodes.set(k, { key: k, ts, c });

      if (c.replaces) {
        parent.set(k, c.replaces);
        child.set(c.replaces, k);
      }
    }

    const rootOf = (id) => {
      let cur = id;
      while (parent.has(cur)) cur = parent.get(cur);
      return cur;
    };

    const tipOf = (id) => {
      let cur = id;
      while (child.has(cur)) cur = child.get(cur);
      return cur;
    };

    const roots = new Set();
    for (const id of nodes.keys()) roots.add(rootOf(id));

    const tipByRoot = new Map();
    for (const r of roots) tipByRoot.set(r, tipOf(r));

    const forward = new Map();
    for (const [newId, oldId] of parent.entries()) forward.set(oldId, newId);

    return { tomb, nodes, parent, child, rootOf, tipOf, tipByRoot, forward };
  };

  const pickDoc = (node, rootId) => {
    const c = node.c || {};
    return {
      key: node.key,
      rootId,
      url: c.url,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt || null,
      tags: safeArr(c.tags),
      author: c.author,
      title: c.title || "",
      description: c.description || "",
      opinions: c.opinions || {},
      opinions_inhabitants: safeArr(c.opinions_inhabitants)
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

      let tip = id;
      while (idx.forward.has(tip)) tip = idx.forward.get(tip);
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
      if (Object.keys(oldMsg.content.opinions || {}).length > 0) {
        throw new Error("Cannot edit document after it has received opinions.");
      }
      if (String(oldMsg.content.author) !== String(userId)) throw new Error("Not the author");

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
        items.push(pickDoc(node, rootId));
      }

      let out = items;
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
      const tipId = await this.resolveCurrentId(id);
      const rootId = await this.resolveRootId(id);
      const favorites = await favoritesSetForDocuments();

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, msg) => {
          if (err || !msg || msg.content?.type !== "document") return reject(new Error("Document not found"));
          const c = msg.content;
          resolve({
            key: tipId,
            rootId,
            url: c.url,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt || null,
            tags: c.tags || [],
            author: c.author,
            title: c.title || "",
            description: c.description || "",
            opinions: c.opinions || {},
            opinions_inhabitants: c.opinions_inhabitants || [],
            isFavorite: favorites.has(rootId || tipId)
          });
        });
      });
    },

    async createOpinion(id, category) {
      if (!categories.includes(category)) return Promise.reject(new Error("Invalid voting category"));

      const ssbClient = await openSsb();
      const tipId = await this.resolveCurrentId(id);

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, async (err, msg) => {
          if (err || !msg || msg.content?.type !== "document") return reject(new Error("Document not found"));
          if (safeArr(msg.content.opinions_inhabitants).includes(userId)) return reject(new Error("Already voted"));

          const now = new Date().toISOString();

          const updated = {
            ...msg.content,
            replaces: tipId,
            opinions: { ...msg.content.opinions, [category]: (msg.content.opinions?.[category] || 0) + 1 },
            opinions_inhabitants: safeArr(msg.content.opinions_inhabitants).concat(userId),
            updatedAt: now
          };

          const tombstone = { type: "tombstone", target: tipId, deletedAt: now, author: userId };
          await new Promise((res, rej) => ssbClient.publish(tombstone, (e) => (e ? rej(e) : res())));

          ssbClient.publish(updated, (err2, result) => (err2 ? reject(err2) : resolve(result)));
        });
      });
    }
  };
};

