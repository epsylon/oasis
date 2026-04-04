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
    const markers = new Map();

    for (const m of messages) {
      const k = m.key;
      const v = m.value || {};
      const c = v.content;
      if (!c) continue;

      if (c.type === "tombstone" && c.target) {
        tomb.add(c.target);
        continue;
      }

      if (c.type === "mapMarker") {
        const mapId = c.mapId;
        if (mapId) {
          if (!markers.has(mapId)) markers.set(mapId, []);
          markers.get(mapId).push({
            key: k,
            lat: parseFloat(c.lat) || 0,
            lng: parseFloat(c.lng) || 0,
            label: c.label || "",
            image: c.image || "",
            author: v.author || c.author,
            createdAt: c.createdAt || new Date(v.timestamp || m.timestamp || 0).toISOString()
          });
        }
        continue;
      }

      if (c.type !== "map") continue;

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

    return { tomb, nodes, parent, child, rootOf, tipOf, tipByRoot, forward, markers };
  };

  const buildMap = (node, rootId, viewerId, markerList = []) => {
    const c = node.c || {};
    return {
      key: node.key,
      rootId,
      title: c.title || "",
      lat: parseFloat(c.lat) || 0,
      lng: parseFloat(c.lng) || 0,
      description: c.description || "",
      markerLabel: c.markerLabel || "",
      image: c.image || "",
      mapType: ALLOWED_MAP_TYPES.has(c.mapType) ? c.mapType : "SINGLE",
      tags: safeArr(c.tags),
      author: c.author,
      tribeId: c.tribeId || null,
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

      const content = {
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
      if (oldMsg.content.author !== userId) throw new Error("Not the author");

      const tags = tagsRaw !== undefined ? normalizeTags(tagsRaw) || [] : safeArr(oldMsg.content.tags);
      const now = new Date().toISOString();
      const mType = mapType && ALLOWED_MAP_TYPES.has(mapType) ? mapType : oldMsg.content.mapType;

      const updated = {
        ...oldMsg.content,
        replaces: tipId,
        title: title !== undefined ? title || "" : oldMsg.content.title || "",
        lat: lat !== undefined ? parseFloat(lat) || 0 : oldMsg.content.lat,
        lng: lng !== undefined ? parseFloat(lng) || 0 : oldMsg.content.lng,
        description: description !== undefined ? description || "" : oldMsg.content.description || "",
        mapType: mType,
        tags,
        ...(image ? { image } : {}),
        createdAt: oldMsg.content.createdAt,
        updatedAt: now
      };

      const tombstone = { type: "tombstone", target: tipId, deletedAt: now, author: userId };
      await new Promise((res, rej) => ssbClient.publish(tombstone, (e) => (e ? rej(e) : res())));

      return new Promise((resolve, reject) => {
        ssbClient.publish(updated, (err, result) => (err ? reject(err) : resolve(result)));
      });
    },

    async deleteMapById(id) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await this.resolveCurrentId(id);
      const msg = await getMsg(ssbClient, tipId);

      if (!msg || msg.content?.type !== "map") throw new Error("Map not found");
      if (msg.content.author !== userId) throw new Error("Not the author");

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

      const mapType = node.c.mapType || "SINGLE";
      if (mapType === "SINGLE") throw new Error("Map does not allow markers");
      if (mapType === "CLOSED" && node.c.author !== userId) throw new Error("Only the map creator can add markers");

      const now = new Date().toISOString();
      const content = {
        type: "mapMarker",
        mapId: tipId,
        lat: parseFloat(lat) || 0,
        lng: parseFloat(lng) || 0,
        label: label || "",
        author: userId,
        createdAt: now
      };
      if (image) content.image = image;

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

      let tip = id;
      while (idx.forward.has(tip)) tip = idx.forward.get(tip);
      if (idx.tomb.has(tip)) throw new Error("Map not found");

      let root = tip;
      while (idx.parent.has(root)) root = idx.parent.get(root);

      const node = idx.nodes.get(tip);
      if (!node) {
        const msg = await getMsg(ssbClient, tip);
        if (!msg || msg.content?.type !== "map") throw new Error("Map not found");
        const markerList = safeArr(idx.markers.get(tip)).concat(safeArr(idx.markers.get(root)));
        return buildMap({ key: tip, ts: msg.timestamp || 0, c: msg.content }, root, viewer, markerList);
      }

      const markerList = safeArr(idx.markers.get(tip)).concat(safeArr(idx.markers.get(root)));
      return buildMap(node, root, viewer, markerList);
    }
  };
};
