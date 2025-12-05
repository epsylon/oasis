const pull = require("../server/node_modules/pull-stream");
const { getConfig } = require("../configs/config-manager.js");
const categories = require("../backend/opinion_categories");

const logLimit = getConfig().ssbLogStream?.limit || 1000;

const safeArr = (v) => (Array.isArray(v) ? v : []);

const normalizeTags = (raw) => {
  if (raw === undefined || raw === null) return undefined;
  if (Array.isArray(raw)) return raw.map((t) => String(t || "").trim()).filter(Boolean);
  return String(raw).split(",").map((t) => t.trim()).filter(Boolean);
};

const parseBlobId = (blobMarkdown) => {
  const s = String(blobMarkdown || "");
  const match = s.match(/\(([^)]+)\)/);
  return match ? match[1] : s || null;
};

const voteSum = (opinions = {}) =>
  Object.values(opinions || {}).reduce((s, n) => s + (Number(n) || 0), 0);

module.exports = ({ cooler }) => {
  let ssb;

  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const getAllMessages = async (ssbClient) =>
    new Promise((resolve, reject) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => (err ? reject(err) : resolve(msgs)))
      );
    });

  const getMsg = async (ssbClient, key) =>
    new Promise((resolve, reject) => {
      ssbClient.get(key, (err, msg) => (err ? reject(err) : resolve(msg)));
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

      if (c.type !== "image") continue;

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

  const buildImage = (node, rootId, viewerId) => {
    const c = node.c || {};
    const voters = safeArr(c.opinions_inhabitants);
    return {
      key: node.key,
      rootId,
      url: c.url,
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      tags: safeArr(c.tags),
      author: c.author,
      title: c.title || "",
      description: c.description || "",
      meme: !!c.meme,
      opinions: c.opinions || {},
      opinions_inhabitants: voters,
      hasVoted: viewerId ? voters.includes(viewerId) : false
    };
  };

  return {
    type: "image",

    async resolveCurrentId(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);

      let tip = id;
      while (idx.forward.has(tip)) tip = idx.forward.get(tip);
      if (idx.tomb.has(tip)) throw new Error("Image not found");
      return tip;
    },

    async resolveRootId(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);

      let tip = id;
      while (idx.forward.has(tip)) tip = idx.forward.get(tip);
      if (idx.tomb.has(tip)) throw new Error("Image not found");

      let root = tip;
      while (idx.parent.has(root)) root = idx.parent.get(root);
      return root;
    },

    async createImage(blobMarkdown, tagsRaw, title, description, memeBool) {
      const ssbClient = await openSsb();
      const blobId = parseBlobId(blobMarkdown);
      const tags = normalizeTags(tagsRaw) || [];
      const now = new Date().toISOString();

      const content = {
        type: "image",
        url: blobId,
        createdAt: now,
        updatedAt: now,
        author: ssbClient.id,
        tags,
        title: title || "",
        description: description || "",
        meme: !!memeBool,
        opinions: {},
        opinions_inhabitants: []
      };

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => (err ? reject(err) : resolve(res)));
      });
    },

    async updateImageById(id, blobMarkdown, tagsRaw, title, description, memeBool) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await this.resolveCurrentId(id);
      const oldMsg = await getMsg(ssbClient, tipId);

      if (!oldMsg || oldMsg.content?.type !== "image") throw new Error("Image not found");
      if (Object.keys(oldMsg.content.opinions || {}).length > 0) throw new Error("Cannot edit image after it has received opinions.");
      if (oldMsg.content.author !== userId) throw new Error("Not the author");

      const tags = tagsRaw !== undefined ? normalizeTags(tagsRaw) || [] : safeArr(oldMsg.content.tags);
      const blobId = blobMarkdown ? parseBlobId(blobMarkdown) : null;
      const now = new Date().toISOString();

      const updated = {
        ...oldMsg.content,
        replaces: tipId,
        url: blobId || oldMsg.content.url,
        tags,
        title: title !== undefined ? title || "" : oldMsg.content.title || "",
        description: description !== undefined ? description || "" : oldMsg.content.description || "",
        meme: typeof memeBool === "boolean" ? memeBool : !!oldMsg.content.meme,
        createdAt: oldMsg.content.createdAt,
        updatedAt: now
      };

      const tombstone = { type: "tombstone", target: tipId, deletedAt: now, author: userId };
      await new Promise((res, rej) => ssbClient.publish(tombstone, (e) => (e ? rej(e) : res())));

      return new Promise((resolve, reject) => {
        ssbClient.publish(updated, (err, result) => (err ? reject(err) : resolve(result)));
      });
    },

    async deleteImageById(id) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await this.resolveCurrentId(id);
      const msg = await getMsg(ssbClient, tipId);

      if (!msg || msg.content?.type !== "image") throw new Error("Image not found");
      if (msg.content.author !== userId) throw new Error("Not the author");

      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId };

      return new Promise((resolve, reject) => {
        ssbClient.publish(tombstone, (err2, res) => (err2 ? reject(err2) : resolve(res)));
      });
    },

    async listAll(filterOrOpts = "all", maybeOpts = {}) {
      const ssbClient = await openSsb();

      const opts = typeof filterOrOpts === "object" ? filterOrOpts : maybeOpts || {};
      const filter = (typeof filterOrOpts === "string" ? filterOrOpts : opts.filter || "all") || "all";
      const q = String(opts.q || "").trim().toLowerCase();
      const sort = String(opts.sort || "recent").trim();
      const viewerId = opts.viewerId || ssbClient.id;

      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);

      const items = [];
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue;
        const node = idx.nodes.get(tipId);
        if (!node) continue;
        items.push(buildImage(node, rootId, viewerId));
      }

      let list = items;
      const now = Date.now();

      if (filter === "mine") list = list.filter((im) => String(im.author) === String(viewerId));
      else if (filter === "recent") list = list.filter((im) => new Date(im.createdAt).getTime() >= now - 86400000);
      else if (filter === "meme") list = list.filter((im) => im.meme === true);
      else if (filter === "top") {
        list = list
          .slice()
          .sort((a, b) => voteSum(b.opinions) - voteSum(a.opinions) || new Date(b.createdAt) - new Date(a.createdAt));
      }

      if (q) {
        list = list.filter((im) => {
          const t = String(im.title || "").toLowerCase();
          const d = String(im.description || "").toLowerCase();
          const tags = safeArr(im.tags).join(" ").toLowerCase();
          const a = String(im.author || "").toLowerCase();
          return t.includes(q) || d.includes(q) || tags.includes(q) || a.includes(q);
        });
      }

      if (sort === "top") {
        list = list
          .slice()
          .sort((a, b) => voteSum(b.opinions) - voteSum(a.opinions) || new Date(b.createdAt) - new Date(a.createdAt));
      } else if (sort === "oldest") {
        list = list.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      } else {
        list = list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      return list;
    },

    async getImageById(id, viewerId = null) {
      const ssbClient = await openSsb();
      const viewer = viewerId || ssbClient.id;

      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);

      let tip = id;
      while (idx.forward.has(tip)) tip = idx.forward.get(tip);
      if (idx.tomb.has(tip)) throw new Error("Image not found");

      let root = tip;
      while (idx.parent.has(root)) root = idx.parent.get(root);

      const node = idx.nodes.get(tip);
      if (node) return buildImage(node, root, viewer);

      const msg = await getMsg(ssbClient, tip);
      if (!msg || msg.content?.type !== "image") throw new Error("Image not found");
      return buildImage({ key: tip, ts: msg.timestamp || 0, c: msg.content }, root, viewer);
    },

    async createOpinion(id, category) {
      if (!categories.includes(category)) throw new Error("Invalid voting category");

      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      const tipId = await this.resolveCurrentId(id);
      const msg = await getMsg(ssbClient, tipId);

      if (!msg || msg.content?.type !== "image") throw new Error("Image not found");

      const voters = safeArr(msg.content.opinions_inhabitants);
      if (voters.includes(userId)) throw new Error("Already voted");

      const now = new Date().toISOString();
      const updated = {
        ...msg.content,
        replaces: tipId,
        opinions: {
          ...msg.content.opinions,
          [category]: (msg.content.opinions?.[category] || 0) + 1
        },
        opinions_inhabitants: voters.concat(userId),
        updatedAt: now
      };

      const tombstone = { type: "tombstone", target: tipId, deletedAt: now, author: userId };
      await new Promise((res, rej) => ssbClient.publish(tombstone, (e) => (e ? rej(e) : res())));

      return new Promise((resolve, reject) => {
        ssbClient.publish(updated, (err2, result) => (err2 ? reject(err2) : resolve(result)));
      });
    }
  };
};

