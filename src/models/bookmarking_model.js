const pull = require("../server/node_modules/pull-stream");
const moment = require("../server/node_modules/moment");
const { getConfig } = require("../configs/config-manager.js");
const categories = require("../backend/opinion_categories");

const logLimit = getConfig().ssbLogStream?.limit || 1000;

const safeArr = (v) => (Array.isArray(v) ? v : []);
const safeText = (v) => String(v || "").trim();

const normalizeTags = (raw) => {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t || "").trim()).filter(Boolean);
  return String(raw).split(",").map((t) => t.trim()).filter(Boolean);
};

const coerceLastVisit = (lastVisit) => {
  const now = moment();
  if (!lastVisit) return now.toISOString();
  const m = moment(lastVisit, moment.ISO_8601, true);
  if (!m.isValid()) return now.toISOString();
  if (m.isAfter(now)) return now.toISOString();
  return m.toISOString();
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

      if (c.type !== "bookmark") continue;

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

  const buildBookmark = (node, rootId, viewerId) => {
    const c = node.c || {};
    const voters = safeArr(c.opinions_inhabitants);
    return {
      id: node.key,
      rootId,
      url: c.url || "",
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      lastVisit: c.lastVisit || null,
      tags: safeArr(c.tags),
      category: c.category || "",
      description: c.description || "",
      opinions: c.opinions || {},
      opinions_inhabitants: voters,
      author: c.author,
      hasVoted: viewerId ? voters.includes(viewerId) : false
    };
  };

  return {
    type: "bookmark",

    async resolveCurrentId(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);

      let tip = id;
      while (idx.forward.has(tip)) tip = idx.forward.get(tip);
      if (idx.tomb.has(tip)) throw new Error("Bookmark not found");
      return tip;
    },

    async resolveRootId(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);

      let tip = id;
      while (idx.forward.has(tip)) tip = idx.forward.get(tip);
      if (idx.tomb.has(tip)) throw new Error("Bookmark not found");

      let root = tip;
      while (idx.parent.has(root)) root = idx.parent.get(root);
      return root;
    },

    async createBookmark(url, tagsRaw, description, category, lastVisit) {
      const ssbClient = await openSsb();
      const now = new Date().toISOString();

      const u = safeText(url);
      if (!u) throw new Error("URL is required");

      const content = {
        type: "bookmark",
        author: ssbClient.id,
        url: u,
        tags: normalizeTags(tagsRaw),
        description: description || "",
        category: category || "",
        createdAt: now,
        updatedAt: now,
        lastVisit: coerceLastVisit(lastVisit),
        opinions: {},
        opinions_inhabitants: []
      };

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => (err ? reject(err) : resolve(res)));
      });
    },

    async updateBookmarkById(id, updatedData) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      const tipId = await this.resolveCurrentId(id);
      const oldMsg = await getMsg(ssbClient, tipId);

      if (!oldMsg || oldMsg.content?.type !== "bookmark") throw new Error("Bookmark not found");
      if (Object.keys(oldMsg.content.opinions || {}).length > 0) throw new Error("Cannot edit bookmark after it has received opinions.");
      if (String(oldMsg.content.author) !== String(userId)) throw new Error("Not the author");

      const url = safeText(updatedData.url || oldMsg.content.url);
      if (!url) throw new Error("URL is required");

      const now = new Date().toISOString();

      const updated = {
        ...oldMsg.content,
        replaces: tipId,
        url,
        tags: updatedData.tags !== undefined ? normalizeTags(updatedData.tags) : safeArr(oldMsg.content.tags),
        description: updatedData.description !== undefined ? updatedData.description || "" : oldMsg.content.description || "",
        category: updatedData.category !== undefined ? updatedData.category || "" : oldMsg.content.category || "",
        lastVisit: coerceLastVisit(updatedData.lastVisit || oldMsg.content.lastVisit),
        createdAt: oldMsg.content.createdAt,
        updatedAt: now
      };

      const tombstone = { type: "tombstone", target: tipId, deletedAt: now, author: userId };
      await new Promise((res, rej) => ssbClient.publish(tombstone, (e) => (e ? rej(e) : res())));

      return new Promise((resolve, reject) => {
        ssbClient.publish(updated, (err, result) => (err ? reject(err) : resolve(result)));
      });
    },

    async deleteBookmarkById(id) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      const tipId = await this.resolveCurrentId(id);
      const msg = await getMsg(ssbClient, tipId);

      if (!msg || msg.content?.type !== "bookmark") throw new Error("Bookmark not found");
      if (String(msg.content.author) !== String(userId)) throw new Error("Not the author");

      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId };

      return new Promise((resolve, reject) => {
        ssbClient.publish(tombstone, (err, res) => (err ? reject(err) : resolve(res)));
      });
    },

    async listAll(filterOrOpts = "all", maybeOpts = {}) {
      const ssbClient = await openSsb();

      const opts = typeof filterOrOpts === "object" ? filterOrOpts : maybeOpts || {};
      const filter = (typeof filterOrOpts === "string" ? filterOrOpts : opts.filter || "all") || "all";
      const q = safeText(opts.q || "").toLowerCase();
      const sort = safeText(opts.sort || "recent");
      const viewerId = opts.viewerId || ssbClient.id;

      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);

      const items = [];
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue;
        const node = idx.nodes.get(tipId);
        if (!node) continue;
        items.push(buildBookmark(node, rootId, viewerId));
      }

      let list = items;
      const now = Date.now();

      if (filter === "mine") list = list.filter((b) => String(b.author) === String(viewerId));
      else if (filter === "recent") list = list.filter((b) => new Date(b.createdAt).getTime() >= now - 86400000);
      else if (filter === "top") {
        list = list
          .slice()
          .sort((a, b) => voteSum(b.opinions) - voteSum(a.opinions) || new Date(b.createdAt) - new Date(a.createdAt));
      }

      if (q) {
        list = list.filter((b) => {
          const url = String(b.url || "").toLowerCase();
          const cat = String(b.category || "").toLowerCase();
          const desc = String(b.description || "").toLowerCase();
          const tags = safeArr(b.tags).join(" ").toLowerCase();
          const author = String(b.author || "").toLowerCase();
          return url.includes(q) || cat.includes(q) || desc.includes(q) || tags.includes(q) || author.includes(q);
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

    async getBookmarkById(id, viewerId = null) {
      const ssbClient = await openSsb();
      const viewer = viewerId || ssbClient.id;

      const tipId = await this.resolveCurrentId(id);
      const rootId = await this.resolveRootId(id);

      const msg = await getMsg(ssbClient, tipId);
      if (!msg || msg.content?.type !== "bookmark") throw new Error("Bookmark not found");

      return buildBookmark({ key: tipId, ts: msg.timestamp || 0, c: msg.content }, rootId, viewer);
    },

    async createOpinion(id, category) {
      if (!categories.includes(category)) throw new Error("Invalid voting category");

      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      const tipId = await this.resolveCurrentId(id);
      const msg = await getMsg(ssbClient, tipId);

      if (!msg || msg.content?.type !== "bookmark") throw new Error("Bookmark not found");

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
        ssbClient.publish(updated, (err, result) => (err ? reject(err) : resolve(result)));
      });
    }
  };
};

