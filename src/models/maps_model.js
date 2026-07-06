const pull = require("../server/node_modules/pull-stream");
const crypto = require("crypto");
const { getConfig } = require("../configs/config-manager.js");
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { collabContent, openInviteOf } = require('../backend/collab_content');
const mapCollab = collabContent({ membersField: 'members', undecField: 'encrypted', contentFields: ['title', 'description', 'image'], listFields: ['tags', 'invites', 'markers'] });

const logLimit = getConfig().ssbLogStream?.limit || 1000;
const INVITE_CODE_BYTES = 16;

const safeArr = (v) => (Array.isArray(v) ? v : []);

const normalizeTags = (raw) => {
  if (raw === undefined || raw === null) return undefined;
  if (Array.isArray(raw)) return raw.map((t) => String(t || "").trim()).filter(Boolean);
  return String(raw).split(",").map((t) => t.trim()).filter(Boolean);
};

const ALLOWED_MAP_TYPES = new Set(["OPEN", "CLOSED", "SINGLE"]);

module.exports = ({ cooler, tribeCrypto, mapCrypto, tribesModel }) => {
  let ssb;

  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const ownCrypto = mapCrypto || tribeCrypto;
  const lookupKey = (rid) => (ownCrypto && ownCrypto.getKey(rid)) || (tribeCrypto && tribeCrypto.getKey(rid)) || null;
  const lookupKeys = (rid) => {
    const a = (ownCrypto && ownCrypto.getKeys(rid)) || [];
    if (a.length) return a;
    return (tribeCrypto && tribeCrypto.getKeys(rid)) || [];
  };
  const lookupGen = (rid) => ((ownCrypto && ownCrypto.getGen(rid)) || (tribeCrypto && tribeCrypto.getGen(rid)) || 0);

  const rotateMapKey = async (rootId, remainingMembers) => {
    if (!ownCrypto || !tribeCrypto || !rootId) return;
    const existing = lookupKey(rootId);
    if (!existing) return;
    const newKey = ownCrypto.generateTribeKey();
    const newGen = ownCrypto.addNewKey(rootId, newKey);
    if (!Array.isArray(remainingMembers) || !remainingMembers.length) return;
    const ssbClient = await openSsb();
    const ssbKeys = require("../server/node_modules/ssb-keys");
    const memberKeys = {};
    for (const m of remainingMembers) {
      try { memberKeys[m] = tribeCrypto.boxKeyForMember(newKey, m, ssbKeys); } catch (_) {}
    }
    if (Object.keys(memberKeys).length) {
      await new Promise((resolve) => {
        ssbClient.publish({ type: "tribe-keys", tribeId: rootId, generation: newGen, memberKeys }, () => resolve());
      });
    }
  };

  const ingestOwnTribeKeys = async () => {
    if (!ownCrypto) return;
    try {
      const ssbClient = await openSsb();
      const ssbKeys = require("../server/node_modules/ssb-keys");
      const config = require("../server/ssb_config");
      const msgs = await new Promise((resolve, reject) => pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((e, m) => e ? reject(e) : resolve(m))));
      for (const m of msgs) {
        const c = m.value && m.value.content;
        if (!c || c.type !== "tribe-keys") continue;
        const memberKeys = c.memberKeys;
        if (!memberKeys || typeof memberKeys !== "object") continue;
        const boxed = memberKeys[ssbClient.id];
        if (!boxed) continue;
        try {
          const unboxed = ssbKeys.unbox(boxed, config.keys);
          const key = typeof unboxed === "string" ? unboxed : (unboxed && unboxed.toString ? unboxed.toString() : null);
          if (key && c.tribeId) ownCrypto.addNewKey(c.tribeId, key);
        } catch (_) {}
      }
    } catch (_) {}
  };

  const tribeHelpers = tribeCrypto ? tribeCrypto.createHelpers(tribesModel) : null;
  const encryptIfTribe = tribeHelpers ? tribeHelpers.encryptIfTribe : async (c) => c;
  const decryptIfTribe = tribeHelpers ? tribeHelpers.decryptIfTribe : async (c) => c;
  const assertReadable = tribeHelpers ? tribeHelpers.assertReadable : () => {};
  const unwrapForIndex = (msgs) => tribeHelpers ? tribeHelpers.unwrapMessagesForKind(msgs, ['map', 'mapMarker']) : msgs;
  const tombFor = async (target, tribeId, author) => tribeHelpers ? tribeHelpers.encryptTombstone(target, tribeId, author) : { type: 'tombstone', target, deletedAt: new Date().toISOString(), author };

  const encryptStandalone = (content, rootId) => {
    if (!tribeCrypto || !rootId) return content;
    const key = lookupKey(rootId);
    if (!key) return content;
    return tribeCrypto.encryptContent(content, [key], true);
  };

  const tryDecryptPublicInviteKey = (invites) => {
    if (!tribeCrypto || !Array.isArray(invites)) return null;
    for (const inv of invites) {
      if (!inv || typeof inv !== "object" || inv.public !== true) continue;
      if (typeof inv.code !== "string") continue;
      if (typeof inv.ek === "string") {
        try {
          const k = tribeCrypto.decryptFromInvite(inv.ek, inv.code, inv.salt);
          if (k) return k;
        } catch (_) {}
      }
      if (typeof inv.ekChain === "string") {
        try {
          const chain = tribeCrypto.decryptChainFromInvite(inv.ekChain, inv.code, inv.salt);
          if (Array.isArray(chain) && chain.length && chain[0].key) return chain[0].key;
        } catch (_) {}
      }
    }
    return null;
  };

  const decryptMapRoot = (content, rootId) => {
    if (!content || !content.encryptedPayload) return content;
    if (!tribeCrypto) return content;
    const keys = lookupKeys(rootId);
    let candidateChains = (keys || []).map(k => [k]);
    const pubKey = tryDecryptPublicInviteKey(content.invites);
    if (pubKey) candidateChains.push([pubKey]);
    if (!candidateChains.length) return { ...content, _undecryptable: true };
    return tribeCrypto.decryptContent(content, candidateChains);
  };

  const decryptIndexNodes = async (idx) => {
    if (!tribeCrypto) return;
    for (const [k, n] of (idx.nodes ? idx.nodes.entries() : [])) {
      if (!n.c || !n.c.encryptedPayload) continue;
      const root = idx.rootOf(k);
      let dec = null;
      if (n.c.tribeId && tribesModel) {
        try {
          const r = await tribeCrypto.decryptFromTribe(n.c, tribesModel);
          if (r && !r._undecryptable) dec = r;
        } catch (_) {}
      }
      if (!dec) {
        const r = decryptMapRoot(n.c, root);
        if (r && !r._undecryptable) dec = r;
      }
      if (dec) {
        idx.nodes.set(k, { ...n, c: { ...dec, _decrypted: true } });
      } else {
        idx.nodes.set(k, { ...n, c: { ...n.c, _decrypted: false } });
      }
    }
  };

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
    const strictChild = new Map();
    const markers = new Map();
    const rawMarkers = new Map();
    const authorByKey = new Map();
    const tombRequests = [];
    const memberMsgs = [];

    for (const m of messages) {
      const k = m.key;
      const v = m.value || {};
      const c = v.content;
      if (!c) continue;

      if (c.type === "tombstone" && c.target) {
        tombRequests.push({ target: c.target, author: v.author });
        continue;
      }

      if (c.type === "mapMember" && c.target) {
        memberMsgs.push({ target: c.target, member: c.member, on: c.on !== false, author: v.author, ts: v.timestamp || m.timestamp || 0, code: typeof c.code === "string" ? c.code : "" });
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
      nodes.set(k, { key: k, ts, c, author: v.author });
      authorByKey.set(k, v.author);

      if (c.replaces) {
        parent.set(k, c.replaces);
        child.set(c.replaces, k);
      }
    }

    for (const [k, node] of nodes.entries()) {
      const t = node.c.replaces;
      if (!t) continue;
      const orig = nodes.get(t);
      if (orig && orig.author === node.author) strictChild.set(t, k);
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

    const contentTipOf = (root) => {
      const rn = nodes.get(root);
      if (!rn) return root;
      let cur = root, best = root, g = 0;
      const seen = new Set();
      while (child.has(cur) && !seen.has(cur) && g++ < 100000) {
        seen.add(cur);
        const next = child.get(cur);
        const n = nodes.get(next);
        if (!n) break;
        if (n.author === rn.author && !tomb.has(next)) best = next;
        cur = next;
      }
      return best;
    };

    for (const t of tombRequests) {
      const targetAuthor = authorByKey.get(t.target);
      if (targetAuthor && t.author === targetAuthor) tomb.add(t.target);
    }

    const roots = new Set();
    for (const id of nodes.keys()) roots.add(rootOf(id));

    const tipByRoot = new Map();
    for (const r of roots) tipByRoot.set(r, tipOf(r));

    const contentTipByRoot = new Map();
    for (const r of roots) contentTipByRoot.set(r, contentTipOf(r));

    const forward = new Map();
    for (const [newId, oldId] of parent.entries()) forward.set(oldId, newId);

    const memberByRoot = new Map();
    const consumedByRoot = new Map();
    for (const mm of memberMsgs) {
      if (!nodes.has(mm.target)) continue;
      const r = rootOf(mm.target);
      const ownerAuthor = nodes.get(r) && nodes.get(r).author;
      if (!ownerAuthor) continue;
      const self = mm.member === mm.author;
      const byOwner = mm.author === ownerAuthor;
      if (!self && !byOwner) continue;
      if (!mm.member) continue;
      if (mm.on && mm.code) {
        if (!consumedByRoot.has(r)) consumedByRoot.set(r, new Set());
        consumedByRoot.get(r).add(mm.code);
      }
      if (!memberByRoot.has(r)) memberByRoot.set(r, new Map());
      const m2 = memberByRoot.get(r);
      const prev = m2.get(mm.member);
      if (!prev || mm.ts >= prev.ts) m2.set(mm.member, { on: mm.on, ts: mm.ts });
    }

    const isCodeConsumed = (root, code) => {
      if (!code) return false;
      const set = consumedByRoot.get(root);
      return !!(set && set.has(code));
    };

    const resolveMembers = (root) => {
      const ownerNode = nodes.get(root);
      const oc = ownerNode ? ownerNode.c : {};
      const set = new Set(Array.isArray(oc.members) ? oc.members.filter(x => typeof x === "string" && x) : []);
      for (const [mem, st] of (memberByRoot.get(root) || new Map())) {
        if (st.on) set.add(mem); else set.delete(mem);
      }
      return [...set];
    };

    const ensureMemberKeys = async (ssbClient, messages, items) => {
    if (!tribeCrypto) return;
    const distributed = new Map();
    for (const m of messages) {
      const c = m.value && m.value.content;
      if (!c || c.type !== "tribe-keys" || !c.tribeId) continue;
      const mk = c.memberKeys;
      if (!mk || typeof mk !== "object") continue;
      if (!distributed.has(c.tribeId)) distributed.set(c.tribeId, new Set());
      for (const id of Object.keys(mk)) distributed.get(c.tribeId).add(id);
    }
    const ssbKeys = require("../server/node_modules/ssb-keys");
    for (const item of (Array.isArray(items) ? items : [])) {
      if (!item || item.encrypted) continue;
      const rootId = item.rootId;
      if (!rootId) continue;
      const key = lookupKey(rootId);
      if (!key) continue;
      const have = distributed.get(rootId) || new Set();
      const missing = (Array.isArray(item.members) ? item.members : []).filter(m => m && m !== ssbClient.id && !have.has(m));
      if (!missing.length) continue;
      const memberKeys = {};
      for (const m of missing) {
        try { memberKeys[m] = tribeCrypto.boxKeyForMember(key, m, ssbKeys) } catch (_) {}
      }
      if (!Object.keys(memberKeys).length) continue;
      await new Promise((resolve) => {
        ssbClient.publish({ type: "tribe-keys", tribeId: rootId, generation: lookupGen(rootId) || 1, memberKeys }, () => resolve())
      });
    }
  }

  return { tomb, nodes, parent, child, strictChild, rootOf, tipOf, contentTipOf, tipByRoot, contentTipByRoot, forward, markers, rawMarkers, resolveMembers, isCodeConsumed };
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
          author: r.envAuthor,
          encrypted: !!(r.c.encryptedPayload && (!c || c._undecryptable)),
          createdAt: c.createdAt || new Date(r.ts).toISOString()
        });
      }
      idx.markers.set(mapId, list);
    }
  };


  const buildMap = (node, rootId, viewerId, markerList = [], members = null) => {
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
      author: node.author,
      members: Array.isArray(members) ? members : (Array.isArray(c.members) ? c.members : []),
      invites: Array.isArray(c.invites) ? c.invites : [],
      tribeId: c.tribeId || null,
      encrypted: !!undec,
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      markers: markerList.filter((mk) => !mk.tombstoned)
    };
  };

  const collectMaps = (idx, viewerId) => {
    const items = [];
    for (const [rootId, tipId] of idx.contentTipByRoot.entries()) {
      if (idx.tomb.has(tipId)) continue;
      const node = idx.nodes.get(tipId);
      if (!node) continue;
      const markerList = safeArr(idx.markers.get(tipId)).concat(safeArr(idx.markers.get(rootId)));
      items.push(buildMap(node, rootId, viewerId, markerList, idx.resolveMembers(rootId)));
    }
    return items;
  };

  return {
    type: "map",

    async ingestKeys() { await ingestOwnTribeKeys() },

    async pruneOrphanKeys() {
      if (!ownCrypto || typeof ownCrypto.getAllRootIds !== "function") return 0;
      try {
        const ssbClient = await openSsb();
        const messages = await new Promise((resolve, reject) => pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((e, m) => e ? reject(e) : resolve(m))));
        const live = new Set();
        const tomb = buildValidatedTombstoneSet(messages);
        for (const m of messages) {
          const c = m.value && m.value.content;
          if (!c) continue;
          if (c.type === "map") live.add(m.key);
        }
        const all = ownCrypto.getAllRootIds();
        let removed = 0;
        for (const rid of all) {
          if (!live.has(rid) || tomb.has(rid)) {
            try { ownCrypto.dropKey(rid); removed += 1; } catch (_) {}
          }
        }
        return removed;
      } catch (_) { return 0; }
    },

    async leaveMap(mapId) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const map = await this.getMapById(mapId, userId);
      if (!map) throw new Error("Map not found");
      if (map.author === userId) throw new Error("Author cannot leave their own map");
      if (!Array.isArray(map.members) || !map.members.includes(userId)) return;
      const members = map.members.filter(m => m !== userId);
      const rootId = await this.resolveRootId(map.rootId || map.key);
      const content = { type: "mapMember", target: rootId, member: userId, on: false, createdAt: new Date().toISOString() };
      const result = await new Promise((resolve, reject) => ssbClient.publish(content, (e, r) => e ? reject(e) : resolve(r)));
      try { await rotateMapKey(rootId, members); } catch (_) {}
      return result;
    },

    async resolveCurrentId(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(unwrapForIndex(messages));

      let root = id;
      while (idx.parent.has(root)) root = idx.parent.get(root);
      const tip = idx.contentTipOf(root);
      if (idx.tomb.has(tip)) throw new Error("Map not found");
      return tip;
    },

    async resolveRootId(id) {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(unwrapForIndex(messages));

      let root = id;
      while (idx.parent.has(root)) root = idx.parent.get(root);
      const tip = idx.contentTipOf(root);
      if (idx.tomb.has(tip)) throw new Error("Map not found");
      return root;
    },

    async createMap(lat, lng, description, mapType, tagsRaw, title, tribeId, markerLabel, image) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tags = normalizeTags(tagsRaw) || [];
      const now = new Date().toISOString();
      const mType = ALLOWED_MAP_TYPES.has(mapType) ? mapType : "SINGLE";

      let plainContent = {
        type: "map",
        title: title || "",
        lat: parseFloat(lat) || 0,
        lng: parseFloat(lng) || 0,
        description: description || "",
        markerLabel: markerLabel || "",
        mapType: mType,
        author: userId,
        members: [userId],
        invites: [],
        tags,
        ...(tribeId ? { tribeId } : {}),
        ...(image ? { image } : {}),
        createdAt: now,
        updatedAt: now
      };

      const isPublicOpen = mType === "OPEN" && !tribeId;
      const shouldEncryptStandalone = !tribeId && !isPublicOpen && tribeCrypto;
      let mapKey = null;
      let content = plainContent;
      if (tribeId) {
        content = await encryptIfTribe(plainContent);
      } else if (shouldEncryptStandalone) {
        mapKey = ownCrypto.generateTribeKey();
        content = tribeCrypto.encryptContent(plainContent, [mapKey], true);
      }

      const result = await new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => (err ? reject(err) : resolve(res)));
      });

      if (mapKey) {
        ownCrypto.setKey(result.key, mapKey, 1);
        try {
          const ssbKeys = require("../server/node_modules/ssb-keys");
          const boxedKey = tribeCrypto.boxKeyForMember(mapKey, userId, ssbKeys);
          await new Promise((resolve) => {
            ssbClient.publish({ type: "tribe-keys", tribeId: result.key, generation: 1, memberKeys: { [userId]: boxedKey } }, () => resolve());
          });
        } catch (_) {}
        if (mType === "OPEN") {
          try {
            const pubCode = crypto.randomBytes(INVITE_CODE_BYTES).toString("hex");
            const inviteSalt = tribeCrypto.generateInviteSalt();
            const ek = tribeCrypto.encryptForInvite(mapKey, pubCode, inviteSalt);
            let updated = {
              type: "map",
              replaces: result.key,
              title: plainContent.title,
              lat: plainContent.lat,
              lng: plainContent.lng,
              description: plainContent.description,
              markerLabel: plainContent.markerLabel,
              mapType: mType,
              author: userId,
              members: [userId],
              invites: [{ code: pubCode, ek, salt: inviteSalt, gen: 1, public: true }],
              tags,
              ...(image ? { image } : {}),
              createdAt: now,
              updatedAt: new Date().toISOString()
            };
            updated = encryptStandalone(updated, result.key);
            await new Promise((resolve, reject) => ssbClient.publish(updated, (e, r) => e ? reject(e) : resolve(r)));
            await new Promise((resolve, reject) => ssbClient.publish({ type: "tombstone", target: result.key, deletedAt: new Date().toISOString(), author: userId }, e => e ? reject(e) : resolve()));
          } catch (_) {}
        }
      }

      return result;
    },

    async updateMapById(id, lat, lng, description, mapType, tagsRaw, title, image) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await this.resolveCurrentId(id);
      const rootId = await this.resolveRootId(id);
      const oldMsg = await getMsg(ssbClient, tipId);

      if (!oldMsg) throw new Error("Map not found");
      const isWrapped = tribeCrypto && tribeCrypto.isTribeMsg(oldMsg.content);
      const tribeIdHint = isWrapped ? null : (oldMsg.content && oldMsg.content.tribeId);
      const oldDecrypted = (isWrapped || tribeIdHint)
        ? await decryptIfTribe(oldMsg.content)
        : decryptMapRoot(oldMsg.content, rootId);
      const effectiveTribeId = oldDecrypted && oldDecrypted.tribeId;
      if (!oldDecrypted || (oldDecrypted.type && oldDecrypted.type !== "map" && !isWrapped && oldMsg.content?.type !== "map")) throw new Error("Map not found");
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
        members: Array.isArray(oldDecrypted.members) ? oldDecrypted.members : [userId],
        invites: Array.isArray(oldDecrypted.invites) ? oldDecrypted.invites : [],
        ...(effectiveTribeId ? { tribeId: effectiveTribeId } : {}),
        ...(image ? { image } : (oldDecrypted.image ? { image: oldDecrypted.image } : {})),
        createdAt: oldDecrypted.createdAt,
        updatedAt: now
      };

      if (effectiveTribeId) {
        updated = await encryptIfTribe(updated);
      } else if (mType !== "SINGLE") {
        updated = encryptStandalone(updated, rootId);
      }

      const result = await new Promise((resolve, reject) => {
        ssbClient.publish(updated, (err, res) => (err ? reject(err) : resolve(res)));
      });
      const tombstone = await tombFor(tipId, effectiveTribeId, userId);
      await new Promise((res, rej) => ssbClient.publish(tombstone, (e) => (e ? rej(e) : res())));
      return result;
    },

    async deleteMapById(id) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await this.resolveCurrentId(id);
      const msg = await getMsg(ssbClient, tipId);

      if (!msg) throw new Error("Map not found");
      const decrypted = await decryptIfTribe(msg.content);
      if (!decrypted) throw new Error("Map not found");
      if ((decrypted.author || msg.content.author) !== userId) throw new Error("Not the author");

      const tombstone = await tombFor(tipId, decrypted.tribeId, userId);

      return new Promise((resolve, reject) => {
        ssbClient.publish(tombstone, (err2, res) => (err2 ? reject(err2) : resolve(res)));
      });
    },

    async addMarker(mapId, lat, lng, label, image) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(unwrapForIndex(messages));

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
      const rootId = idx.rootOf(tipId);
      let content = {
        type: "mapMarker",
        mapId: rootId,
        lat: parseFloat(lat) || 0,
        lng: parseFloat(lng) || 0,
        label: label || "",
        author: userId,
        createdAt: now,
        ...(node.c.tribeId ? { tribeId: node.c.tribeId } : {})
      };
      if (image) content.image = image;

      if (node.c.tribeId) {
        content = await encryptIfTribe(content);
      } else if (tribeCrypto) {
        const mapKey = lookupKey(rootId);
        if (mapKey) content = tribeCrypto.encryptContent(content, [mapKey], true);
      }

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
      const idx = buildIndex(unwrapForIndex(messages));
      await decryptIndexNodes(idx);
      await expandMarkers(idx);

      let list = mapCollab.visibleThenCollapsed(collectMaps(idx, viewerId), viewerId);
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

      try { await ensureMemberKeys(ssbClient, messages, list); } catch (_) {}
      return list;
    },

    async getMapById(id, viewerId = null) {
      const ssbClient = await openSsb();
      const viewer = viewerId || ssbClient.id;

      const messages = await getAllMessages(ssbClient);
      const idx = buildIndex(unwrapForIndex(messages));
      await decryptIndexNodes(idx);
      await expandMarkers(idx);

      let root = id;
      while (idx.parent.has(root)) root = idx.parent.get(root);
      const tip = idx.contentTipOf(root);
      if (idx.tomb.has(tip)) throw new Error("Map not found");

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
        return buildMap({ key: tip, ts: msg.timestamp || 0, c, author: msg.author }, root, viewer, markerList, idx.resolveMembers(root));
      }

      const markerList = safeArr(idx.markers.get(tip)).concat(safeArr(idx.markers.get(root)));
      const map = buildMap(node, root, viewer, markerList, idx.resolveMembers(root));
      return mapCollab.fold(map, collectMaps(idx, viewer));
    },

    async generateInvite(mapId, opts = {}) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const map = await this.getMapById(mapId, userId);
      if (!map) throw new Error("Map not found");
      if (map.author !== userId) throw new Error("Only the author can generate invites");
      const code = crypto.randomBytes(INVITE_CODE_BYTES).toString("hex");
      let invite = code;
      if (tribeCrypto && !map.tribeId) {
        const inviteSalt = tribeCrypto.generateInviteSalt();
        const ekChain = tribeCrypto.encryptChainForInvite([map.rootId || map.key], code, inviteSalt);
        if (ekChain) invite = { code, ekChain, salt: inviteSalt, gen: lookupGen(map.rootId || map.key) || 1, ...(opts.public ? { public: true } : {}) };
      }
      if (opts.public && typeof invite !== "object") invite = { code, public: true };
      const tipId = await this.resolveCurrentId(mapId);
      const rootId = await this.resolveRootId(mapId);
      const oldMsg = await getMsg(ssbClient, tipId);
      const isWrapped = tribeCrypto && tribeCrypto.isTribeMsg(oldMsg.content);
      const oldDecrypted = (isWrapped || (oldMsg.content && oldMsg.content.tribeId))
        ? await decryptIfTribe(oldMsg.content)
        : decryptMapRoot(oldMsg.content, rootId);
      const effectiveTribeId = oldDecrypted && oldDecrypted.tribeId;
      const invites = [...(Array.isArray(oldDecrypted.invites) ? oldDecrypted.invites : []), invite];
      let updated = {
        type: "map",
        replaces: tipId,
        title: oldDecrypted.title || "",
        lat: oldDecrypted.lat,
        lng: oldDecrypted.lng,
        description: oldDecrypted.description || "",
        markerLabel: oldDecrypted.markerLabel || "",
        mapType: oldDecrypted.mapType,
        tags: Array.isArray(oldDecrypted.tags) ? oldDecrypted.tags : [],
        author: oldDecrypted.author,
        members: Array.isArray(oldDecrypted.members) ? oldDecrypted.members : [userId],
        invites,
        ...(effectiveTribeId ? { tribeId: effectiveTribeId } : {}),
        ...(oldDecrypted.image ? { image: oldDecrypted.image } : {}),
        createdAt: oldDecrypted.createdAt,
        updatedAt: new Date().toISOString()
      };
      if (effectiveTribeId) updated = await encryptIfTribe(updated);
      else updated = encryptStandalone(updated, rootId);
      await new Promise((resolve, reject) => ssbClient.publish(updated, (e, r) => e ? reject(e) : resolve(r)));
      const tomb1 = await tombFor(tipId, effectiveTribeId, userId);
      await new Promise((resolve, reject) => ssbClient.publish(tomb1, e => e ? reject(e) : resolve()));
      return code;
    },

    async getOpenInvite(mapId) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      return openInviteOf(await this.getMapById(mapId, userId).catch(() => null));
    },

    async generateOpenInvite(mapId) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const map = await this.getMapById(mapId, userId);
      if (!map) throw new Error("Map not found");
      if (map.author !== userId) throw new Error("Only the author can generate invites");
      const existing = (Array.isArray(map.invites) ? map.invites : []).find(inv => typeof inv === "object" && inv.public === true);
      if (existing) throw new Error("An open invitation already exists");
      return this.generateInvite(mapId, { public: true });
    },

    async removeOpenInvite(mapId) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const map = await this.getMapById(mapId, userId);
      if (!map) throw new Error("Map not found");
      if (map.author !== userId) throw new Error("Only the author can remove invites");
      const tipId = await this.resolveCurrentId(mapId);
      const rootId = await this.resolveRootId(mapId);
      const oldMsg = await getMsg(ssbClient, tipId);
      const isWrapped = tribeCrypto && tribeCrypto.isTribeMsg(oldMsg.content);
      const oldDecrypted = (isWrapped || (oldMsg.content && oldMsg.content.tribeId))
        ? await decryptIfTribe(oldMsg.content)
        : decryptMapRoot(oldMsg.content, rootId);
      const effectiveTribeId = oldDecrypted && oldDecrypted.tribeId;
      const invites = (Array.isArray(oldDecrypted.invites) ? oldDecrypted.invites : []).filter(inv => !(typeof inv === "object" && inv.public === true));
      let updated = {
        type: "map",
        replaces: tipId,
        title: oldDecrypted.title || "",
        lat: oldDecrypted.lat,
        lng: oldDecrypted.lng,
        description: oldDecrypted.description || "",
        markerLabel: oldDecrypted.markerLabel || "",
        mapType: oldDecrypted.mapType,
        tags: Array.isArray(oldDecrypted.tags) ? oldDecrypted.tags : [],
        author: oldDecrypted.author,
        members: Array.isArray(oldDecrypted.members) ? oldDecrypted.members : [userId],
        invites,
        ...(effectiveTribeId ? { tribeId: effectiveTribeId } : {}),
        ...(oldDecrypted.image ? { image: oldDecrypted.image } : {}),
        createdAt: oldDecrypted.createdAt,
        updatedAt: new Date().toISOString()
      };
      if (effectiveTribeId) updated = await encryptIfTribe(updated);
      else updated = encryptStandalone(updated, rootId);
      await new Promise((resolve, reject) => ssbClient.publish(updated, (e, r) => e ? reject(e) : resolve(r)));
      const tomb1 = await tombFor(tipId, effectiveTribeId, userId);
      await new Promise((resolve, reject) => ssbClient.publish(tomb1, e => e ? reject(e) : resolve()));
    },

    async joinByInvite(code) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const joinIdx = buildIndex(unwrapForIndex(await getAllMessages(ssbClient)));
      await decryptIndexNodes(joinIdx);
      await expandMarkers(joinIdx);
      const maps = collectMaps(joinIdx, userId);
      let matched = null;
      let matchedInvite = null;
      for (const m of maps) {
        const invs = Array.isArray(m.invites) ? m.invites : [];
        for (const inv of invs) {
          if (typeof inv === "string" && inv === code) { matched = m; matchedInvite = inv; break; }
          if (typeof inv === "object" && inv.code === code) { matched = m; matchedInvite = inv; break; }
        }
        if (matched) break;
      }
      if (!matched) throw new Error("Invalid or expired invite code");
      if (Array.isArray(matched.members) && matched.members.includes(userId)) throw new Error("Already a member");
      const isPublic = (typeof matchedInvite === "object" && matchedInvite.public === true);
      const rootId = await this.resolveRootId(matched.rootId || matched.key);
      if (!isPublic) {
        const idx = buildIndex(unwrapForIndex(await getAllMessages(ssbClient)));
        if (idx.isCodeConsumed(rootId, code)) throw new Error("Invite already used");
      }
      let mapKey = null;
      if (tribeCrypto && typeof matchedInvite === "object") {
        if (matchedInvite.ekChain) {
          const chain = tribeCrypto.decryptChainFromInvite(matchedInvite.ekChain, code, matchedInvite.salt);
          if (Array.isArray(chain) && chain.length) {
            for (const entry of chain) {
              if (Array.isArray(entry.keys) && entry.keys.length) {
                tribeCrypto.setKeys(entry.rootId, entry.keys, entry.gen || entry.keys.length);
              } else if (entry.key) {
                tribeCrypto.setKey(entry.rootId, entry.key, entry.gen || 1);
              }
            }
            mapKey = chain[0].key;
          }
        } else if (matchedInvite.ek) {
          mapKey = tribeCrypto.decryptFromInvite(matchedInvite.ek, code, matchedInvite.salt);
          ownCrypto.setKey(matched.rootId || matched.key, mapKey, matchedInvite.gen || 1);
        }
      }
      await new Promise((resolve, reject) => ssbClient.publish({ type: "mapMember", target: rootId, member: userId, on: true, createdAt: new Date().toISOString(), ...(isPublic ? {} : { code }) }, (e, r) => e ? reject(e) : resolve(r)));
      if (tribeCrypto && mapKey) {
        try {
          const ssbKeys = require("../server/node_modules/ssb-keys");
          const memberKeys = {};
          try { memberKeys[userId] = tribeCrypto.boxKeyForMember(mapKey, userId, ssbKeys); } catch (_) {}
          if (matched.author && matched.author !== userId) {
            try { memberKeys[matched.author] = tribeCrypto.boxKeyForMember(mapKey, matched.author, ssbKeys); } catch (_) {}
          }
          if (Object.keys(memberKeys).length) {
            await new Promise((resolve) => {
              ssbClient.publish({ type: "tribe-keys", tribeId: rootId, generation: lookupGen(rootId) || 1, memberKeys }, () => resolve());
            });
          }
        } catch (_) {}
      }
      return rootId;
    },

    async joinMap(mapId) {
      const userId = (await openSsb()).id;
      const map = await this.getMapById(mapId, userId);
      if (!map) throw new Error("Map not found");
      if (Array.isArray(map.members) && map.members.includes(userId)) return map.rootId || map.key;
      if (tribeCrypto && Array.isArray(map.invites)) {
        const pub = map.invites.find(inv => typeof inv === "object" && inv.public === true && inv.code && (inv.ek || inv.ekChain));
        if (pub) return await this.joinByInvite(pub.code);
      }
      throw new Error("This map requires an invite code to join");
    }
  };
};
