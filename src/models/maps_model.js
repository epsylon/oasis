const pull = require("../server/node_modules/pull-stream");
const { getConfig } = require("../configs/config-manager.js");

const logLimit = getConfig().ssbLogStream?.limit || 1000;

const safeArr = (v) => (Array.isArray(v) ? v : []);

const normalizeTags = (raw) => {
  if (raw === undefined || raw === null) return undefined;
  if (Array.isArray(raw)) return raw.map((t) => String(t || "").trim()).filter(Boolean);
  return String(raw).split(",").map((t) => t.trim()).filter(Boolean);
};

const ALLOWED_MAP_TYPES = new Set(["OPEN", "CLOSED", "SINGLE"]);

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
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => (err ? reject(err) : resolve(msgs)))
      );
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
    const markers = new Map();
    const rawMarkers = new Map();
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

      if (c.type === "mapMarker") {
        const mapId = c.mapId;
        if (mapId) {
          authorByKey.set(k, v.author);
          if (!rawMarkers.has(mapId)) rawMarkers.set(mapId, []);
          rawMarkers.get(mapId).push({
            key: k,
            ts: v.timestamp || m.timestamp || 0,
            c,
            envAuthor: v.author
          });
        }
        continue;
      }

      if (c.type !== "map") continue;

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

    return { tomb, nodes, parent, child, rootOf, tipOf, tipByRoot, forward, markers, rawMarkers };
  };

  const expandMarkers = async (idx) => {
    for (const [mapId, raws] of idx.rawMarkers.entries()) {
      const list = [];
      for (const r of raws) {
        let c = r.c;
        if (c.encryptedPayload && tribeCrypto && tribesModel) {
          const dec = await tribeCrypto.decryptFromTribe(c, tribesModel);
          if (dec && !dec._undecryptable) c = dec;
        }
        list.push({
          key: r.key,
          lat: parseFloat(c.lat) || 0,
          lng: parseFloat(c.lng) || 0,
          label: c.label || "",
          image: c.image || "",
          author: c.author || r.envAuthor,
          encrypted: !!(r.c.encryptedPayload && (!c || c._undecryptable)),
          createdAt: c.createdAt || new Date(r.ts).toISOString()
        });
      }
      idx.markers.set(mapId, list);
    }
  };


  const buildMap = (node, rootId, viewerId, markerList = []) => {
    const c = node.c || {};
    const undec = c.encryptedPayload && c._decrypted === false;
    return {
      key: node.key,
      rootId,
      title: undec ? "" : (c.title || ""),
      lat: parseFloat(c.lat) || 0,
      lng: parseFloat(c.lng) || 0,
      description: undec ? "" : (c.description || ""),
      markerLabel: undec ? "" : (c.markerLabel || ""),
      image: undec ? "" : (c.image || ""),
      mapType: ALLOWED_MAP_TYPES.has(c.mapType) ? c.mapType : "SINGLE",
      tags: safeArr(c.tags),
      author: c.author,
      tribeId: c.tribeId || null,
      encrypted: !!undec,
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      markers: markerList.filter((mk) => !mk.tombstoned)
    };
  };

  return {
    type: "map",

    async resolveCurrentId(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);

      let tip = id;
      while (idx.forward.has(tip)) tip = idx.forward.get(tip);
      if (idx.tomb.has(tip)) throw new Error("Map not found");
      return tip;
    },

    async resolveRootId(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);

      let tip = id;
      while (idx.forward.has(tip)) tip = idx.forward.get(tip);
      if (idx.tomb.has(tip)) throw new Error("Map not found");

      let root = tip;
      while (idx.parent.has(root)) root = idx.parent.get(root);
      return root;
    },

    async createMap(lat, lng, description, mapType, tagsRaw, title, tribeId, markerLabel, image) {
      const ssbClient = await openSsb();
      const tags = normalizeTags(tagsRaw) || [];
      const now = new Date().toISOString();
      const mType = ALLOWED_MAP_TYPES.has(mapType) ? mapType : "SINGLE";

      let content = {
        type: "map",
        title: title || "",
        lat: parseFloat(lat) || 0,
        lng: parseFloat(lng) || 0,
        description: description || "",
        markerLabel: markerLabel || "",
        mapType: mType,
        author: ssbClient.id,
        tags,
        ...(tribeId ? { tribeId } : {}),
        ...(image ? { image } : {}),
        createdAt: now,
        updatedAt: now
      };

      content = await encryptIfTribe(content);

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => (err ? reject(err) : resolve(res)));
      });
    },

    async updateMapById(id, lat, lng, description, mapType, tagsRaw, title, image) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await this.resolveCurrentId(id);
      const oldMsg = await getMsg(ssbClient, tipId);

      if (!oldMsg || oldMsg.content?.type !== "map") throw new Error("Map not found");
      const oldDecrypted = await decryptIfTribe(oldMsg.content);
      assertReadable(oldDecrypted, "Map");
      if ((oldDecrypted.author || oldMsg.content.author) !== userId) throw new Error("Not the author");

      const tags = tagsRaw !== undefined ? normalizeTags(tagsRaw) || [] : safeArr(oldDecrypted.tags);
      const now = new Date().toISOString();
      const mType = mapType && ALLOWED_MAP_TYPES.has(mapType) ? mapType : oldDecrypted.mapType;

      let updated = {
        type: "map",
        replaces: tipId,
        title: title !== undefined ? title || "" : oldDecrypted.title || "",
        lat: lat !== undefined ? parseFloat(lat) || 0 : oldDecrypted.lat,
        lng: lng !== undefined ? parseFloat(lng) || 0 : oldDecrypted.lng,
        description: description !== undefined ? description || "" : oldDecrypted.description || "",
        markerLabel: oldDecrypted.markerLabel || "",
        mapType: mType,
        tags,
        author: oldDecrypted.author || userId,
        ...(oldMsg.content.tribeId ? { tribeId: oldMsg.content.tribeId } : {}),
        ...(image ? { image } : (oldDecrypted.image ? { image: oldDecrypted.image } : {})),
        createdAt: oldDecrypted.createdAt,
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

    async deleteMapById(id) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await this.resolveCurrentId(id);
      const msg = await getMsg(ssbClient, tipId);

      if (!msg || msg.content?.type !== "map") throw new Error("Map not found");
      const decrypted = await decryptIfTribe(msg.content);
      if ((decrypted.author || msg.content.author) !== userId) throw new Error("Not the author");

      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId };

      return new Promise((resolve, reject) => {
        ssbClient.publish(tombstone, (err2, res) => (err2 ? reject(err2) : resolve(res)));
      });
    },

    async addMarker(mapId, lat, lng, label, image) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);

      let tipId = mapId;
      while (idx.forward.has(tipId)) tipId = idx.forward.get(tipId);
      if (idx.tomb.has(tipId)) throw new Error("Map not found");

      const node = idx.nodes.get(tipId);
      if (!node) throw new Error("Map not found");

      const mapDecrypted = await decryptIfTribe(node.c);
      assertReadable(mapDecrypted, "Map");
      const mapType = mapDecrypted.mapType || node.c.mapType || "SINGLE";
      const mapAuthor = mapDecrypted.author || node.c.author;
      if (mapType === "SINGLE") throw new Error("Map does not allow markers");
      if (mapType === "CLOSED" && mapAuthor !== userId) throw new Error("Only the map creator can add markers");

      const now = new Date().toISOString();
      let content = {
        type: "mapMarker",
        mapId: tipId,
        lat: parseFloat(lat) || 0,
        lng: parseFloat(lng) || 0,
        label: label || "",
        author: userId,
        createdAt: now,
        ...(node.c.tribeId ? { tribeId: node.c.tribeId } : {})
      };
      if (image) content.image = image;

      content = await encryptIfTribe(content);

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => (err ? reject(err) : resolve(res)));
      });
    },

    async listAll(filterOrOpts = "all", maybeOpts = {}) {
      const ssbClient = await openSsb();

      const opts = typeof filterOrOpts === "object" ? filterOrOpts : maybeOpts || {};
      const filter = (typeof filterOrOpts === "string" ? filterOrOpts : opts.filter || "all") || "all";
      const q = String(opts.q || "").trim().toLowerCase();
      const viewerId = opts.viewerId || ssbClient.id;

      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);
      await decryptIndexNodes(idx);
      await expandMarkers(idx);

      const items = [];
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue;
        const node = idx.nodes.get(tipId);
        if (!node) continue;
        const markerList = safeArr(idx.markers.get(tipId)).concat(safeArr(idx.markers.get(rootId)));
        items.push(buildMap(node, rootId, viewerId, markerList));
      }

      let list = items;
      const now = Date.now();

      if (filter === "mine") list = list.filter((m) => String(m.author) === String(viewerId));
      else if (filter === "recent") list = list.filter((m) => new Date(m.createdAt).getTime() >= now - 86400000);

      if (q) {
        list = list.filter((m) => {
          const d = String(m.description || "").toLowerCase();
          const tags = safeArr(m.tags).join(" ").toLowerCase();
          const a = String(m.author || "").toLowerCase();
          return d.includes(q) || tags.includes(q) || a.includes(q);
        });
      }

      list = list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return list;
    },

    async getMapById(id, viewerId = null) {
      const ssbClient = await openSsb();
      const viewer = viewerId || ssbClient.id;

      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(messages);
      await decryptIndexNodes(idx);
      await expandMarkers(idx);

      let tip = id;
      while (idx.forward.has(tip)) tip = idx.forward.get(tip);
      if (idx.tomb.has(tip)) throw new Error("Map not found");

      let root = tip;
      while (idx.parent.has(root)) root = idx.parent.get(root);

      const node = idx.nodes.get(tip);
      if (!node) {
        const msg = await getMsg(ssbClient, tip);
        if (!msg || msg.content?.type !== "map") throw new Error("Map not found");
        let c = msg.content;
        if (c.encryptedPayload && tribeCrypto && tribesModel) {
          const dec = await tribeCrypto.decryptFromTribe(c, tribesModel);
          c = dec && !dec._undecryptable ? { ...dec, _decrypted: true } : { ...c, _decrypted: false };
        }
        const markerList = safeArr(idx.markers.get(tip)).concat(safeArr(idx.markers.get(root)));
        return buildMap({ key: tip, ts: msg.timestamp || 0, c }, root, viewer, markerList);
      }

      const markerList = safeArr(idx.markers.get(tip)).concat(safeArr(idx.markers.get(root)));
      return buildMap(node, root, viewer, markerList);
    }
  };
};
