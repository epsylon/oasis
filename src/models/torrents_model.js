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
  const match = s.match(/\((&[^)]+\.sha256)\)/);
  if (match) return match[1];
  const fallback = s.match(/\(([^)]+)\)/g);
  return fallback ? fallback[fallback.length - 1].slice(1, -1) : s || null;
};

const voteSum = (opinions = {}) =>
  Object.values(opinions || {}).reduce((s, n) => s + (Number(n) || 0), 0);

module.exports = ({ cooler, tribeCrypto, tribesModel }) => {
  let ssb;

  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const tribeHelpers = tribeCrypto ? tribeCrypto.createHelpers(tribesModel) : null;
  const encryptIfTribe = tribeHelpers ? tribeHelpers.encryptIfTribe : async (c) => c;
  const decryptIfTribe = tribeHelpers ? tribeHelpers.decryptIfTribe : async (c) => c;
  const assertReadable = tribeHelpers ? tribeHelpers.assertReadable : () => {};
  const decryptIndexNodes = tribeHelpers ? tribeHelpers.decryptIndexNodes : async () => {};

  const getAllMessages = async (ssbClient) =>
    new Promise((resolve, reject) => {
      pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((err, msgs) => (err ? reject(err) : resolve(msgs))));
    });

  const getMsg = async (ssbClient, key) =>
    new Promise((resolve) => {
      ssbClient.get(key, (err, msg) => (err ? resolve(null) : resolve(msg)));
    });

  const buildIndex = (messages) => {
    const tomb = new Set();
    const nodes = new Map();
    const parent = new Map();
    const child = new Map();
    const authorByKey = new Map();
    const tombRequests = [];

    for (const m of messages) {
      const k = m.key;
      const v = m.value || {};
      const c = v.content;
      if (!c) continue;

      if (c.type === "tombstone" && c.target) {
        tombRequests.push({ target: c.target, author: v.author });
        continue;
      }

      if (c.type !== "torrent") continue;

      const ts = v.timestamp || m.timestamp || 0;
      nodes.set(k, { key: k, ts, c });
      authorByKey.set(k, v.author);

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

    for (const t of tombRequests) {
      const targetAuthor = authorByKey.get(t.target);
      if (targetAuthor && t.author === targetAuthor) tomb.add(t.target);
    }

    const roots = new Set();
    for (const id of nodes.keys()) roots.add(rootOf(id));

    const tipByRoot = new Map();
    for (const r of roots) tipByRoot.set(r, tipOf(r));

    const forward = new Map();
    for (const [newId, oldId] of parent.entries()) forward.set(oldId, newId);

    return { tomb, nodes, parent, child, rootOf, tipOf, tipByRoot, forward };
  };

  const buildTorrent = (node, rootId, viewerId) => {
    const c = node.c || {};
    const undec = c.encryptedPayload && c._decrypted === false;
    const voters = safeArr(c.opinions_inhabitants);
    return {
      key: node.key,
      rootId,
      url: undec ? "" : c.url,
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      tags: safeArr(c.tags),
      author: c.author,
      title: undec ? "" : (c.title || ""),
      description: undec ? "" : (c.description || ""),
      size: c.size || 0,
      opinions: c.opinions || {},
      opinions_inhabitants: voters,
      hasVoted: viewerId ? voters.includes(viewerId) : false,
      tribeId: c.tribeId || null,
      encrypted: !!undec
    };
  };


  return {
    type: "torrent",

    async resolveCurrentId(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);

      let tip = id;
      while (idx.forward.has(tip)) tip = idx.forward.get(tip);
      if (idx.tomb.has(tip)) throw new Error("Torrent not found");
      return tip;
    },

    async resolveRootId(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);

      let tip = id;
      while (idx.forward.has(tip)) tip = idx.forward.get(tip);
      if (idx.tomb.has(tip)) throw new Error("Torrent not found");

      let root = tip;
      while (idx.parent.has(root)) root = idx.parent.get(root);
      return root;
    },

    async createTorrent(blobMarkdown, tagsRaw, title, description, size, tribeId) {
      const ssbClient = await openSsb();
      const blobId = parseBlobId(blobMarkdown);
      const tags = normalizeTags(tagsRaw) || [];
      const now = new Date().toISOString();

      let content = {
        type: "torrent",
        url: blobId,
        createdAt: now,
        updatedAt: null,
        author: ssbClient.id,
        tags,
        title: title || "",
        description: description || "",
        size: Number(size) || 0,
        opinions: {},
        opinions_inhabitants: [],
        ...(tribeId ? { tribeId } : {})
      };

      content = await encryptIfTribe(content);

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => (err ? reject(err) : resolve(res)));
      });
    },

    async updateTorrentById(id, blobMarkdown, tagsRaw, title, description) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await this.resolveCurrentId(id);
      const oldMsg = await getMsg(ssbClient, tipId);

      if (!oldMsg || oldMsg.content?.type !== "torrent") throw new Error("Torrent not found");
      const oldDec = await decryptIfTribe(oldMsg.content);
      assertReadable(oldDec, "Torrent");
      if (Object.keys(oldDec.opinions || oldMsg.content.opinions || {}).length > 0) throw new Error("Cannot edit torrent after it has received opinions.");
      if ((oldDec.author || oldMsg.content.author) !== userId) throw new Error("Not the author");

      const tags = tagsRaw !== undefined ? normalizeTags(tagsRaw) || [] : safeArr(oldDec.tags);
      const blobId = blobMarkdown ? parseBlobId(blobMarkdown) : null;
      const now = new Date().toISOString();

      let updated = {
        type: "torrent",
        replaces: tipId,
        url: blobId || oldDec.url,
        tags,
        title: title !== undefined ? title || "" : oldDec.title || "",
        description: description !== undefined ? description || "" : oldDec.description || "",
        size: oldDec.size || 0,
        opinions: oldDec.opinions || {},
        opinions_inhabitants: oldDec.opinions_inhabitants || [],
        author: oldDec.author || userId,
        ...(oldMsg.content.tribeId ? { tribeId: oldMsg.content.tribeId } : {}),
        createdAt: oldDec.createdAt,
        updatedAt: now
      };

      updated = await encryptIfTribe(updated);

      const result = await new Promise((resolve, reject) => {
        ssbClient.publish(updated, (err, res) => (err ? reject(err) : resolve(res)));
      });
      const tombstone = { type: "tombstone", target: tipId, deletedAt: now, author: userId };
      await new Promise((res, rej) => ssbClient.publish(tombstone, (e) => (e ? rej(e) : res())));
      return result;
    },

    async deleteTorrentById(id) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await this.resolveCurrentId(id);
      const msg = await getMsg(ssbClient, tipId);

      if (!msg || msg.content?.type !== "torrent") throw new Error("Torrent not found");
      const dec = await decryptIfTribe(msg.content);
      if ((dec.author || msg.content.author) !== userId) throw new Error("Not the author");

      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId };

      return new Promise((resolve, reject) => {
        ssbClient.publish(tombstone, (err, res) => (err ? reject(err) : resolve(res)));
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
      await decryptIndexNodes(idx);

      const items = [];
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue;
        const node = idx.nodes.get(tipId);
        if (!node) continue;
        items.push(buildTorrent(node, rootId, viewerId));
      }

      let list = items;
      const now = Date.now();

      if (filter === "mine") list = list.filter((a) => String(a.author) === String(viewerId));
      else if (filter === "recent") list = list.filter((a) => new Date(a.createdAt).getTime() >= now - 86400000);
      else if (filter === "top") {
        list = list.slice().sort((a, b) => voteSum(b.opinions) - voteSum(a.opinions) || new Date(b.createdAt) - new Date(a.createdAt));
      }

      if (q) {
        list = list.filter((a) => {
          const title = String(a.title || "").toLowerCase();
          const desc = String(a.description || "").toLowerCase();
          const tags = safeArr(a.tags).join(" ").toLowerCase();
          const author = String(a.author || "").toLowerCase();
          return title.includes(q) || desc.includes(q) || tags.includes(q) || author.includes(q);
        });
      }

      if (sort === "top") {
        list = list.slice().sort((a, b) => voteSum(b.opinions) - voteSum(a.opinions) || new Date(b.createdAt) - new Date(a.createdAt));
      } else if (sort === "oldest") {
        list = list.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      } else {
        list = list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      return list;
    },

    async getTorrentById(id, viewerId = null) {
      const ssbClient = await openSsb();
      const viewer = viewerId || ssbClient.id;
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);
      await decryptIndexNodes(idx);

      let tip = id;
      while (idx.forward.has(tip)) tip = idx.forward.get(tip);
      if (idx.tomb.has(tip)) throw new Error("Torrent not found");

      let root = tip;
      while (idx.parent.has(root)) root = idx.parent.get(root);

      const node = idx.nodes.get(tip);
      if (node) return buildTorrent(node, root, viewer);

      const msg = await getMsg(ssbClient, tip);
      if (!msg || msg.content?.type !== "torrent") throw new Error("Torrent not found");
      let c = msg.content;
      if (c.encryptedPayload && tribeCrypto && tribesModel) {
        const dec = await tribeCrypto.decryptFromTribe(c, tribesModel);
        c = dec && !dec._undecryptable ? { ...dec, _decrypted: true } : { ...c, _decrypted: false };
      }
      return buildTorrent({ key: tip, ts: msg.timestamp || 0, c }, root, viewer);
    },

    async createOpinion(id, category) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      if (!categories.includes(category)) throw new Error("Invalid voting category");

      const tipId = await this.resolveCurrentId(id);
      const msg = await getMsg(ssbClient, tipId);

      if (!msg || msg.content?.type !== "torrent") throw new Error("Torrent not found");

      const oldDec = await decryptIfTribe(msg.content);
      assertReadable(oldDec, "Torrent");
      const voters = safeArr(oldDec.opinions_inhabitants || msg.content.opinions_inhabitants);
      if (voters.includes(userId)) throw new Error("Already voted");

      const now = new Date().toISOString();
      let updated = {
        type: "torrent",
        replaces: tipId,
        url: oldDec.url,
        tags: oldDec.tags || [],
        title: oldDec.title || "",
        description: oldDec.description || "",
        size: oldDec.size || 0,
        opinions: {
          ...(oldDec.opinions || {}),
          [category]: ((oldDec.opinions || {})[category] || 0) + 1
        },
        opinions_inhabitants: voters.concat(userId),
        author: oldDec.author,
        ...(msg.content.tribeId ? { tribeId: msg.content.tribeId } : {}),
        createdAt: oldDec.createdAt,
        updatedAt: now
      };

      updated = await encryptIfTribe(updated);

      const result = await new Promise((resolve, reject) => {
        ssbClient.publish(updated, (err, res) => (err ? reject(err) : resolve(res)));
      });
      const tombstone = { type: "tombstone", target: tipId, deletedAt: now, author: userId };
      await new Promise((res, rej) => ssbClient.publish(tombstone, (e) => (e ? rej(e) : res())));
      return result;
    }
  };
};
