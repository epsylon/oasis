const pull = require("../server/node_modules/pull-stream");
const opinionRules = require("../backend/opinion_categories");
const { getConfig } = require("../configs/config-manager.js");
const categories = require("../backend/opinion_categories");
const { readTyped, memoIndex } = require("./typed_log");

const { dedupeBy, norm, versionGroups } = require('../backend/dedupe');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const safeArr = (v) => (Array.isArray(v) ? v : []);

const normalizeTags = (raw) => {
  if (raw === undefined || raw === null) return undefined;
  if (Array.isArray(raw)) return raw.map((t) => String(t || "").trim()).filter(Boolean);
  return String(raw).split(",").map((t) => t.trim()).filter(Boolean);
};

const cipherField = (cipher) => (cipher && typeof cipher === "object" && cipher.key && cipher.manifestBlobId)
  ? { cipher: { v: Number(cipher.v) || 1, key: String(cipher.key), manifestBlobId: String(cipher.manifestBlobId), chunkCount: Number(cipher.chunkCount) || 0 } }
  : {};

const parseBlobId = (blobMarkdown) => {
  const s = String(blobMarkdown || "");
  const match = s.match(/\((&[^)]+\.sha256)\)/);
  if (match) return match[1];
  const fallback = s.match(/\(([^)]+)\)/g);
  return fallback ? fallback[fallback.length - 1].slice(1, -1) : s || null;
};

const voteSum = (opinions = {}) =>
  Object.values(opinions || {}).reduce((s, n) => s + (Number(n) || 0), 0);

const torrentMeta = (meta) => {
  const out = {};
  if (meta && typeof meta.license === "string" && meta.license) out.license = meta.license;
  if (meta && /^[0-9a-f]{40}$/.test(String(meta.infoHash || ""))) out.infoHash = meta.infoHash;
  return out;
};

module.exports = ({ cooler, cryptoModel, tribesModel }) => {
  let ssb;

  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const tribeHelpers = cryptoModel ? cryptoModel.createHelpers(tribesModel) : null;
  const encryptIfGroup = tribeHelpers ? tribeHelpers.encryptIfGroup : async (c) => c;
  const decryptIfGroup = tribeHelpers ? tribeHelpers.decryptIfGroup : async (c) => c;
  const assertReadable = tribeHelpers ? tribeHelpers.assertReadable : () => {};
  const decryptIndexNodes = tribeHelpers ? tribeHelpers.decryptIndexNodes : async () => {};
  const unwrapForIndex = (msgs) => tribeHelpers ? tribeHelpers.unwrapMessagesForKind(msgs, 'torrent') : msgs;
  const tombFor = async (target, tribeId, author) => tribeHelpers ? tribeHelpers.encryptTombstone(target, tribeId, author) : { type: 'tombstone', target, deletedAt: new Date().toISOString(), author };

  const TORRENT_TYPES = ["torrent", "torrentOpinion", "tombstone"];

  const getAllMessages = async (ssbClient) => readTyped(ssbClient, TORRENT_TYPES, { limit: logLimit, withWindow: true });

  const getMsg = async (ssbClient, key) =>
    new Promise((resolve) => {
      ssbClient.get(key, (err, msg) => (err ? resolve(null) : resolve(msg)));
    });

  const buildIndex = (messages) => {
    const tomb = new Set();
    const nodes = new Map();
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
      nodes.set(k, { key: k, ts, seq: v.sequence || 0, c, sizeBytes, author: v.author });
      authorByKey.set(k, v.author);
    }

    const vg = versionGroups([...nodes.values()].map(n => ({ key: n.key, author: n.author, seq: n.seq, ts: n.ts, replaces: n.c.replaces || null, claimedAuthor: typeof n.c.author === "string" ? n.c.author : null })));
    const rootOf = vg.rootOf;
    const contentTipOf = vg.tipOf;

    for (const t of tombRequests) {
      const targetAuthor = authorByKey.get(t.target);
      if (targetAuthor && t.author === targetAuthor) tomb.add(t.target);
    }

    const opinionsByRoot = new Map();
    for (const op of opinionMsgs) { if (!nodes.has(op.target)) continue; const r = rootOf(op.target); if (!opinionsByRoot.has(r)) opinionsByRoot.set(r, []); opinionsByRoot.get(r).push(op); }

    const tipByRoot = new Map();
    for (const r of vg.roots) tipByRoot.set(r, contentTipOf(r));

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

    return { tomb, nodes, rootOf, tipByRoot, resolveGroup };
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
      source: undec ? "" : (typeof c.source === "string" && c.source.startsWith("&") ? c.source : ""),
      sourceName: undec ? "" : (c.sourceName || ""),
      license: undec ? "" : (c.license || ""),
      infoHash: undec ? "" : (/^[0-9a-f]{40}$/.test(String(c.infoHash || "")) ? c.infoHash : ""),
      cipher: undec ? null : (c.cipher && typeof c.cipher === "object" && typeof c.cipher.key === "string" && typeof c.cipher.manifestBlobId === "string" ? { v: Number(c.cipher.v) || 1, key: c.cipher.key, manifestBlobId: c.cipher.manifestBlobId, chunkCount: Number(c.cipher.chunkCount) || 0 } : null),
      sourceMime: undec ? "" : (c.sourceMime || ""),
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

      const root = idx.rootOf(id);
      if (idx.tomb.has(idx.tipByRoot.get(root) || id)) throw new Error("Torrent not found");
      return root;
    },

    async createTorrent(blobMarkdown, tagsRaw, title, description, size, tribeId, source = null, meta = {}) {
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
        ...(tribeId ? { tribeId } : {}),
        ...(source && typeof source.source === "string" && source.source.startsWith("&")
          ? { source: source.source, sourceName: String(source.sourceName || ""), sourceMime: String(source.sourceMime || "") }
          : {}),
        ...cipherField(source && source.cipher),
        ...torrentMeta(meta)
      };

      content = await encryptIfGroup(content);

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => (err ? reject(err) : resolve(res)));
      });
    },

    async updateTorrentById(id, blobMarkdown, tagsRaw, title, description, extra = null) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await this.resolveCurrentId(id);
      const oldMsg = await getMsg(ssbClient, tipId);

      if (!oldMsg) throw new Error("Torrent not found");
      const oldDec = await decryptIfGroup(oldMsg.content);
      if (!oldDec || oldDec.type !== "torrent") throw new Error("Torrent not found");
      assertReadable(oldDec, "Torrent");
      if (oldMsg.author !== userId) throw new Error("Not the author");
      const aggTorrent = await this.getTorrentById(id, userId);
      opinionRules.assertMediaKept(aggTorrent, !!blobMarkdown);

      const tags = tagsRaw !== undefined ? normalizeTags(tagsRaw) || [] : safeArr(oldDec.tags);
      const blobId = blobMarkdown ? parseBlobId(blobMarkdown) : null;
      const now = new Date().toISOString();

      let updated = {
        type: "torrent",
        replaces: tipId,
        url: blobId || oldDec.url,
        ...(blobId ? cipherField(extra && extra.cipher) : cipherField(oldDec.cipher)),
        tags,
        title: title !== undefined ? title || "" : oldDec.title || "",
        description: description !== undefined ? description || "" : oldDec.description || "",
        size: blobId && extra && Number(extra.size) > 0 ? Number(extra.size) : (oldDec.size || 0),
        ...torrentMeta({ license: oldDec.license, infoHash: blobId ? "" : oldDec.infoHash, ...(extra || {}) }),
        opinions: oldDec.opinions || {},
        opinions_inhabitants: oldDec.opinions_inhabitants || [],
        author: oldDec.author || userId,
        ...((oldDec.tribeId || oldMsg.content.tribeId) ? { tribeId: oldDec.tribeId || oldMsg.content.tribeId } : {}),
        createdAt: oldDec.createdAt,
        updatedAt: now
      };

      updated = await encryptIfGroup(updated);

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
      const dec = await decryptIfGroup(msg.content);
      if (!dec || dec.type !== "torrent") throw new Error("Torrent not found");
      if (msg.author !== userId) throw new Error("Not the author");

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
      const idx = await memoIndex('torrents', messages, async (m) => { const built = buildIndex(unwrapForIndex(m)); await decryptIndexNodes(built); return built; });

      const root = idx.rootOf(id);
      if (idx.nodes.has(root) && !idx.tipByRoot.has(root)) throw new Error("Torrent not found");
      const agg = idx.resolveGroup(root);
      if (agg.contentNode && !idx.tomb.has(agg.contentTip)) return buildTorrent(agg.contentNode, root, viewer, agg);

      const tip = idx.tipByRoot.get(root) || id;
      if (idx.tomb.has(tip)) throw new Error("Torrent not found");

      const msg = await getMsg(ssbClient, tip);
      if (!msg) throw new Error("Torrent not found");
      let c = msg.content;
      if (cryptoModel && (c?.encryptedPayload || cryptoModel.isSealedMsg(c)) && tribesModel) {
        const dec = await cryptoModel.decryptFromGroup(c, tribesModel);
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

const BENCODE_MAX_DEPTH = 64;
const TORRENT_FILES_SHOWN = 50;
const MAGNET_TRACKERS_MAX = 8;
const MAGNET_SEEDS_MAX = 4;
const TORRENT_LINK_RE = /^(https?|udp|wss?):\/\//i;

const decodeBencode = (buf) => {
  let pos = 0;
  let infoRange = null;
  const fail = () => { throw new Error("Invalid torrent"); };
  const parse = (depth) => {
    if (depth > BENCODE_MAX_DEPTH || pos >= buf.length) fail();
    const ch = buf[pos];
    if (ch === 0x69) {
      const end = buf.indexOf(0x65, pos);
      if (end < 0) fail();
      const n = Number(buf.toString("latin1", pos + 1, end));
      pos = end + 1;
      return Number.isFinite(n) ? n : fail();
    }
    if (ch === 0x6c) {
      pos++;
      const out = [];
      while (buf[pos] !== 0x65) out.push(parse(depth + 1));
      pos++;
      return out;
    }
    if (ch === 0x64) {
      pos++;
      const out = {};
      while (buf[pos] !== 0x65) {
        const key = parse(depth + 1);
        if (!Buffer.isBuffer(key)) fail();
        const start = pos;
        const name = key.toString("latin1");
        out[name] = parse(depth + 1);
        if (depth === 0 && name === "info") infoRange = [start, pos];
      }
      pos++;
      return out;
    }
    if (ch >= 0x30 && ch <= 0x39) {
      const colon = buf.indexOf(0x3a, pos);
      if (colon < 0) fail();
      const len = Number(buf.toString("latin1", pos, colon));
      const start = colon + 1;
      if (!Number.isInteger(len) || len < 0 || start + len > buf.length) fail();
      pos = start + len;
      return buf.subarray(start, pos);
    }
    return fail();
  };
  return { value: parse(0), infoRange };
};

const text = (v) => (Buffer.isBuffer(v) ? v.toString("utf8") : "");

const parseTorrent = (buf) => {
  const { value, infoRange } = decodeBencode(Buffer.from(buf));
  const info = value && value.info;
  if (!info || typeof info !== "object" || !infoRange) throw new Error("Invalid torrent");
  const crypto = require("crypto");
  const raw = Buffer.from(buf).subarray(infoRange[0], infoRange[1]);
  const v2Only = !info.pieces && info["file tree"];
  const infoHash = crypto.createHash(v2Only ? "sha256" : "sha1").update(raw).digest("hex");
  const name = text(info["name.utf-8"] || info.name);
  const files = Array.isArray(info.files)
    ? info.files.map(f => ({ path: (Array.isArray(f["path.utf-8"] || f.path) ? (f["path.utf-8"] || f.path) : []).map(text).join("/"), length: Number(f.length) || 0 }))
    : [{ path: name, length: Number(info.length) || 0 }];
  const announce = [text(value.announce), ...(Array.isArray(value["announce-list"]) ? value["announce-list"].flat().map(text) : [])];
  const seeds = Array.isArray(value["url-list"]) ? value["url-list"].map(text) : [text(value["url-list"])];
  return {
    infoHash,
    v2: !!v2Only,
    name,
    length: files.reduce((sum, f) => sum + f.length, 0),
    fileCount: files.length,
    files: files.slice(0, TORRENT_FILES_SHOWN),
    trackers: [...new Set(announce.filter(t => TORRENT_LINK_RE.test(t)))].slice(0, MAGNET_TRACKERS_MAX),
    webSeeds: [...new Set(seeds.filter(u => /^https?:\/\//i.test(u)))].slice(0, MAGNET_SEEDS_MAX)
  };
};

const magnetFor = (t) => {
  if (!t || !t.infoHash) return "";
  const params = [t.v2 ? `xt=urn:btmh:1220${t.infoHash}` : `xt=urn:btih:${t.infoHash}`];
  if (t.name) params.push(`dn=${encodeURIComponent(t.name)}`);
  if (t.length) params.push(`xl=${t.length}`);
  for (const tr of t.trackers || []) params.push(`tr=${encodeURIComponent(tr)}`);
  for (const ws of t.webSeeds || []) params.push(`ws=${encodeURIComponent(ws)}`);
  return `magnet:?${params.join("&")}`;
};

module.exports.parseTorrent = parseTorrent;
module.exports.magnetFor = magnetFor;
