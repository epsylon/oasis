const pull = require("../server/node_modules/pull-stream");
const { getConfig } = require("../configs/config-manager.js");
const categories = require("../backend/opinion_categories");

const { dedupeBy, norm } = require('../backend/dedupe');
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
  const unwrapForIndex = (msgs) => tribeHelpers ? tribeHelpers.unwrapMessagesForKind(msgs, 'torrent') : msgs;
  const tombFor = async (target, tribeId, author) => tribeHelpers ? tribeHelpers.encryptTombstone(target, tribeId, author) : { type: 'tombstone', target, deletedAt: new Date().toISOString(), author };

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
    const strictChild = new Map();
    const authorByKey = new Map();
    const tombRequests = [];
    const opinionMsgs = [];

    for (const m of messages) {
      const k = m.key;
      const v = m.value || {};
      const c = v.content;
      if (!c) continue;

      if (c.type === "tombstone" && c.target) {
        tombRequests.push({ target: c.target, author: v.author });
        continue;
      }

      if (c.type === "torrentOpinion") { opinionMsgs.push({ target: c.target, author: v.author, category: c.category }); continue; }

      if (c.type !== "torrent") continue;

      const ts = v.timestamp || m.timestamp || 0;
      let sizeBytes = 0;
      try { sizeBytes = Buffer.byteLength(JSON.stringify(v), "utf8"); } catch (_) { sizeBytes = 0; }
      nodes.set(k, { key: k, ts, c, sizeBytes, author: v.author });
      authorByKey.set(k, v.author);

      if (c.replaces) {
        parent.set(k, c.replaces);
        child.set(c.replaces, k);
      }
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

    for (const t of tombRequests) {
      const targetAuthor = authorByKey.get(t.target);
      if (targetAuthor && t.author === targetAuthor) tomb.add(t.target);
    }

    const roots = new Set();
    for (const id of nodes.keys()) roots.add(rootOf(id));

    const opinionsByRoot = new Map();
    for (const op of opinionMsgs) { if (!nodes.has(op.target)) continue; const r = rootOf(op.target); if (!opinionsByRoot.has(r)) opinionsByRoot.set(r, []); opinionsByRoot.get(r).push(op); }

    const tipByRoot = new Map();
    for (const r of roots) tipByRoot.set(r, contentTipOf(r));

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

    return { tomb, nodes, parent, child, rootOf, tipByRoot, forward, resolveGroup };
  };

  const buildTorrent = (node, rootId, viewerId, agg) => {
    const c = node.c || {};
    const undec = c.encryptedPayload && c._decrypted === false;
    const opinions = agg ? agg.opinions : (c.opinions || {});
    const voters = agg ? agg.voters : safeArr(c.opinions_inhabitants);
    return {
      key: node.key,
      rootId,
      url: undec ? "" : c.url,
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      tags: safeArr(c.tags),
      author: node.author,
      title: undec ? "" : (c.title || ""),
      description: undec ? "" : (c.description || ""),
      size: c.size || 0,
      opinions,
      opinions_inhabitants: voters,
      hasVoted: viewerId ? voters.includes(viewerId) : false,
      tribeId: c.tribeId || null,
      encrypted: !!undec,
      sizeBytes: node.sizeBytes || 0
    };
  };


  return {
    type: "torrent",

    async resolveCurrentId(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(unwrapForIndex(messages));

      const tip = idx.tipByRoot.get(idx.rootOf(id)) || id;
      if (idx.tomb.has(tip)) throw new Error("Torrent not found");
      return tip;
    },

    async resolveRootId(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(unwrapForIndex(messages));

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

      if (!oldMsg) throw new Error("Torrent not found");
      const oldDec = await decryptIfTribe(oldMsg.content);
      if (!oldDec || oldDec.type !== "torrent") throw new Error("Torrent not found");
      assertReadable(oldDec, "Torrent");
      if ((oldDec.author || oldMsg.content.author) !== userId) throw new Error("Not the author");
      const aggTorrent = await this.getTorrentById(id, userId);
      if (aggTorrent && Object.keys(aggTorrent.opinions || {}).some(k => (aggTorrent.opinions[k] || 0) > 0)) throw new Error("Cannot edit torrent after it has received opinions.");

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
      const tombstone = await tombFor(tipId, oldDec.tribeId || oldMsg.content.tribeId, userId);
      await new Promise((res, rej) => ssbClient.publish(tombstone, (e) => (e ? rej(e) : res())));
      return result;
    },

    async deleteTorrentById(id) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await this.resolveCurrentId(id);
      const msg = await getMsg(ssbClient, tipId);

      if (!msg) throw new Error("Torrent not found");
      const dec = await decryptIfTribe(msg.content);
      if (!dec || dec.type !== "torrent") throw new Error("Torrent not found");
      if ((dec.author || msg.content.author) !== userId) throw new Error("Not the author");

      const tombstone = await tombFor(tipId, dec.tribeId || msg.content.tribeId, userId);

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
      const idx = buildIndex(unwrapForIndex(messages));
      await decryptIndexNodes(idx);

      const items = [];
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue;
        const node = idx.nodes.get(tipId);
        if (!node) continue;
        items.push(buildTorrent(node, rootId, viewerId, idx.resolveGroup(rootId)));
      }

      let list = dedupeBy(items, x => x.url ? [norm(x.author), norm(x.url)].join('|') : null);
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
      const idx = buildIndex(unwrapForIndex(messages));
      await decryptIndexNodes(idx);

      const root = idx.rootOf(id);
      const agg = idx.resolveGroup(root);
      if (agg.contentNode && !idx.tomb.has(agg.contentTip)) return buildTorrent(agg.contentNode, root, viewer, agg);

      const tip = idx.tipByRoot.get(root) || id;
      if (idx.tomb.has(tip)) throw new Error("Torrent not found");

      const msg = await getMsg(ssbClient, tip);
      if (!msg) throw new Error("Torrent not found");
      let c = msg.content;
      if (tribeCrypto && (c?.encryptedPayload || tribeCrypto.isTribeMsg(c)) && tribesModel) {
        const dec = await tribeCrypto.decryptFromTribe(c, tribesModel);
        c = dec && !dec._undecryptable ? { ...dec, _decrypted: true } : { ...c, _decrypted: false };
      }
      if (!c || c.type !== "torrent") throw new Error("Torrent not found");
      return buildTorrent({ key: tip, ts: msg.timestamp || 0, c, author: msg.author }, root, viewer, agg);
    },

    async createOpinion(id, category) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      if (!categories.includes(category)) throw new Error("Invalid voting category");

      const torrent = await this.getTorrentById(id, userId);
      if (!torrent) throw new Error("Torrent not found");
      if (safeArr(torrent.opinions_inhabitants).includes(userId)) throw new Error("Already voted");

      const content = { type: "torrentOpinion", target: torrent.rootId, category, createdAt: new Date().toISOString() };
      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => (err ? reject(err) : resolve(res)));
      });
    }
  };
};
