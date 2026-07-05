const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const crypto = require('crypto');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { getConfig } = require('../configs/config-manager.js');
const { dedupeBy, norm } = require('../backend/dedupe');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler, tribeCrypto, eventCrypto, tribesModel }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };
  const me = async () => (await openSsb()).id;

  const ownCrypto = eventCrypto || tribeCrypto;
  const lookupKey = (rid) => (ownCrypto && ownCrypto.getKey(rid)) || (tribeCrypto && tribeCrypto.getKey(rid)) || null;

  const readAll = async (ssbClient) =>
    new Promise((resolve, reject) =>
      pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((err, msgs) => err ? reject(err) : resolve(msgs)))
    );

  const ingestOwnTribeKeys = async () => {
    if (!ownCrypto) return;
    try {
      const ssbClient = await openSsb();
      const ssbKeys = require("../server/node_modules/ssb-keys");
      const cfg = require("../server/ssb_config");
      const msgs = await readAll(ssbClient);
      for (const m of msgs) {
        const c = m.value && m.value.content;
        if (!c || c.type !== "tribe-keys") continue;
        const memberKeys = c.memberKeys;
        if (!memberKeys || typeof memberKeys !== "object") continue;
        const boxed = memberKeys[ssbClient.id];
        if (!boxed) continue;
        try {
          const unboxed = ssbKeys.unbox(boxed, cfg.keys);
          const key = typeof unboxed === "string" ? unboxed : (unboxed && unboxed.toString ? unboxed.toString() : null);
          if (key && c.tribeId) ownCrypto.addNewKey(c.tribeId, key);
        } catch (_) {}
      }
    } catch (_) {}
  };

  const decryptEventContent = (rawContent, eventId) => {
    if (!rawContent) return null;
    if (!rawContent.encryptedPayload) return rawContent;
    if (!ownCrypto || !tribeCrypto) return { ...rawContent, _undecryptable: true };
    const keys = (ownCrypto.getKeys && ownCrypto.getKeys(eventId)) || [];
    if (!keys.length) return { ...rawContent, _undecryptable: true };
    const dec = tribeCrypto.decryptContent(rawContent, keys.map(k => [k]));
    if (!dec || dec._undecryptable) return { ...rawContent, _undecryptable: true };
    return { ...dec, _decrypted: true };
  };

  const uniq = (arr) => Array.from(new Set((Array.isArray(arr) ? arr : []).filter(x => typeof x === 'string' && x.trim().length)));

  const normalizePrivacy = (v) => {
    const s = String(v || 'public').toLowerCase();
    return s === 'private' ? 'private' : 'public';
  };

  const normalizePrice = (price) => {
    let p = typeof price === 'string' ? parseFloat(price.replace(',', '.')) : price;
    if (isNaN(p) || p < 0) p = 0;
    return Number(p).toFixed(6);
  };

  const normalizeDate = (date) => {
    const m = moment(date);
    if (!m.isValid()) throw new Error("Invalid date format");
    return m.toISOString();
  };

  const deriveStatus = (c) => {
    const dateM = moment(c.date);
    let status = String(c.status || 'OPEN').toUpperCase();
    if (dateM.isValid() && dateM.isBefore(moment())) status = 'CLOSED';
    if (status !== 'OPEN' && status !== 'CLOSED') status = 'OPEN';
    return status;
  };

  const buildEventIndex = (messages) => {
    const eventAuthor = new Map();
    const eventReplaces = new Map();
    for (const m of messages) {
      const c = m.value && m.value.content;
      if (!c || c.type !== 'event') continue;
      eventAuthor.set(m.key, m.value.author);
      if (c.replaces) eventReplaces.set(m.key, c.replaces);
    }
    for (const [key, target] of Array.from(eventReplaces.entries())) {
      if (!eventAuthor.has(target)) { eventReplaces.delete(key); continue; }
      if (eventAuthor.get(target) !== eventAuthor.get(key)) { eventReplaces.delete(key); eventAuthor.delete(key); }
    }
    const strictNext = new Map();
    for (const [key, target] of eventReplaces) {
      if (eventAuthor.get(target) === eventAuthor.get(key)) strictNext.set(target, key);
    }
    const rootOf = (id) => {
      let cur = id;
      const seen = new Set();
      while (eventReplaces.has(cur) && eventAuthor.has(eventReplaces.get(cur))) {
        if (seen.has(cur)) break;
        seen.add(cur);
        cur = eventReplaces.get(cur);
      }
      return cur;
    };
    const contentTipOf = (root) => {
      let cur = root;
      const seen = new Set();
      while (strictNext.has(cur)) {
        if (seen.has(cur)) break;
        seen.add(cur);
        cur = strictNext.get(cur);
      }
      return cur;
    };
    return { eventAuthor, eventReplaces, strictNext, rootOf, contentTipOf };
  };

  const collectCollab = (messages) => {
    const opinions = new Map();
    const attend = new Map();
    for (const m of messages) {
      const c = m.value && m.value.content;
      if (!c || typeof c.target !== 'string') continue;
      const author = m.value.author;
      const ts = (m.value && m.value.timestamp) || 0;
      if (c.type === 'eventOpinion' && typeof c.category === 'string') {
        if (!opinions.has(c.target)) opinions.set(c.target, new Map());
        const byAuthor = opinions.get(c.target);
        if (!byAuthor.has(author)) byAuthor.set(author, c.category);
      } else if (c.type === 'eventAttend') {
        if (!attend.has(c.target)) attend.set(c.target, new Map());
        const byAuthor = attend.get(c.target);
        const prev = byAuthor.get(author);
        if (!prev || ts >= prev.ts) byAuthor.set(author, { on: c.on !== false, ts });
      }
    }
    return { opinions, attend };
  };

  const aggregateCollab = (ownerContent, rootId, collab) => {
    const attendees = new Set(uniq(ownerContent.attendees || []));
    if (ownerContent.organizer) attendees.add(ownerContent.organizer);
    const attMap = collab.attend.get(rootId);
    if (attMap) for (const [author, st] of attMap) { if (st.on) attendees.add(author); else if (author !== ownerContent.organizer) attendees.delete(author); }

    const opinionInh = new Set(Array.isArray(ownerContent.opinions_inhabitants) ? ownerContent.opinions_inhabitants : []);
    const opinions = Object.assign({}, ownerContent.opinions || {});
    const opMap = collab.opinions.get(rootId);
    if (opMap) for (const [author, category] of opMap) {
      if (opinionInh.has(author)) continue;
      opinionInh.add(author);
      opinions[category] = (opinions[category] || 0) + 1;
    }
    return { attendees: uniq([...attendees]), opinions, opinions_inhabitants: [...opinionInh] };
  };

  return {
    type: 'event',

    async ingestKeys() { await ingestOwnTribeKeys(); },

    async resolveRootId(id) {
      const ssbClient = await openSsb();
      const messages = await readAll(ssbClient);
      const idx = buildEventIndex(messages);
      return idx.rootOf(id);
    },

    async createEvent(title, description, date, location, price = 0, url = "", attendees = [], tagsRaw = [], isPublic, mapUrl = "", clearnetPublic = false) {
      const ssbClient = await openSsb();
      const userId = await me();

      const formattedDate = normalizeDate(date);
      if (moment(formattedDate).isBefore(moment().startOf('minute'))) throw new Error("Cannot create an event in the past");

      let attendeeList = attendees;
      if (!Array.isArray(attendeeList)) attendeeList = String(attendeeList || '').split(',').map(s => s.trim()).filter(Boolean);
      attendeeList = uniq([...attendeeList, userId]);

      const tags = Array.isArray(tagsRaw)
        ? tagsRaw.filter(Boolean)
        : String(tagsRaw || '').split(',').map(s => s.trim()).filter(Boolean);

      const visibility = normalizePrivacy(isPublic);
      const plainContent = {
        type: 'event',
        title,
        description,
        date: formattedDate,
        location,
        price: normalizePrice(price),
        url: url || '',
        attendees: attendeeList,
        tags,
        createdAt: new Date().toISOString(),
        organizer: userId,
        status: 'OPEN',
        isPublic: visibility,
        mapUrl: String(mapUrl || "").trim(),
        clearnetPublic: clearnetPublic === true || clearnetPublic === 'true' || clearnetPublic === 'on',
        opinions: {},
        opinions_inhabitants: []
      };

      const shouldEncrypt = visibility === 'private' && ownCrypto && tribeCrypto;
      let eventKey = null;
      let content = plainContent;
      if (shouldEncrypt) {
        eventKey = ownCrypto.generateTribeKey();
        content = tribeCrypto.encryptContent(plainContent, [eventKey], true);
      }

      const result = await new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res));
      });

      if (eventKey) {
        ownCrypto.setKey(result.key, eventKey, 1);
        try {
          const ssbKeys = require("../server/node_modules/ssb-keys");
          const memberKeys = {};
          for (const m of attendeeList) {
            try { memberKeys[m] = tribeCrypto.boxKeyForMember(eventKey, m, ssbKeys); } catch (_) {}
          }
          if (Object.keys(memberKeys).length) {
            await new Promise((resolve) => {
              ssbClient.publish({ type: "tribe-keys", tribeId: result.key, generation: 1, memberKeys }, () => resolve());
            });
          }
        } catch (_) {}
      }
      return result;
    },

    async generateInvite(eventId) {
      if (!ownCrypto || !tribeCrypto) throw new Error("Event crypto unavailable");
      const ssbClient = await openSsb();
      const userId = await me();
      const ev = await new Promise((res, rej) => ssbClient.get(eventId, (err, m) => err || !m || !m.content ? rej(new Error("Error retrieving event")) : res(m)));
      const rid = await this.resolveRootId(eventId);
      const c = ev.content && ev.content.encryptedPayload ? decryptEventContent(ev.content, rid) : ev.content;
      if (c && c._undecryptable) throw new Error("Event is encrypted and cannot be decrypted");
      if (c.organizer !== userId) throw new Error("Only the organizer can generate invites");
      if (normalizePrivacy(c.isPublic) !== 'private') throw new Error("Only private events use invitation codes");
      const key = lookupKey(rid);
      if (!key) throw new Error("Missing event key — cannot generate invite");
      const code = crypto.randomBytes(16).toString('hex');
      const inviteSalt = tribeCrypto.generateInviteSalt();
      const ek = tribeCrypto.encryptForInvite(key, code, inviteSalt);
      const inviteRef = { code, ek, salt: inviteSalt, gen: 1, rootId: rid };
      await new Promise((resolve, reject) => {
        ssbClient.publish({ type: 'event-invite', target: rid, ek, salt: inviteSalt, codeHash: tribeCrypto.hashInviteCode(code, inviteSalt) }, (err) => err ? reject(err) : resolve());
      });
      return { code, eventId: rid };
    },

    async getOpenInvite(eventId) {
      const ssbClient = await openSsb();
      const rid = await this.resolveRootId(eventId).catch(() => eventId);
      const messages = await readAll(ssbClient);
      const markerTomb = new Set();
      const invTomb = new Set();
      for (const m of messages) {
        const c = m.value && m.value.content;
        if (!c) continue;
        if (c.type === 'event-open-invite-tombstone' && typeof c.target === 'string') markerTomb.add(c.target);
        if (c.type === 'event-invite-tombstone' && typeof c.target === 'string') invTomb.add(c.target);
      }
      let best = null;
      for (const m of messages) {
        const c = m.value && m.value.content;
        if (!c || c.type !== 'event-open-invite' || c.v !== 1) continue;
        if (c.target !== rid || typeof c.code !== 'string') continue;
        if (markerTomb.has(m.key)) continue;
        if (c.inviteKey && invTomb.has(c.inviteKey)) continue;
        const ts = (m.value && m.value.timestamp) || 0;
        if (!best || ts > best.ts) best = { code: c.code, by: c.by || m.value.author, markerKey: m.key, inviteKey: c.inviteKey || null, ts };
      }
      return best ? { code: best.code, by: best.by, markerKey: best.markerKey, inviteKey: best.inviteKey } : null;
    },

    async generateOpenInvite(eventId) {
      if (!ownCrypto || !tribeCrypto) throw new Error("Event crypto unavailable");
      const ssbClient = await openSsb();
      const userId = await me();
      const ev = await new Promise((res, rej) => ssbClient.get(eventId, (err, m) => err || !m || !m.content ? rej(new Error("Error retrieving event")) : res(m)));
      const rid = await this.resolveRootId(eventId);
      const c = ev.content && ev.content.encryptedPayload ? decryptEventContent(ev.content, rid) : ev.content;
      if (c && c._undecryptable) throw new Error("Event is encrypted and cannot be decrypted");
      if (c.organizer !== userId) throw new Error("Only the organizer can generate invites");
      if (normalizePrivacy(c.isPublic) !== 'private') throw new Error("Only private events use invitation codes");
      if (await this.getOpenInvite(eventId)) throw new Error("An open invitation already exists");
      const key = lookupKey(rid);
      if (!key) throw new Error("Missing event key — cannot generate invite");
      const code = crypto.randomBytes(16).toString('hex');
      const inviteSalt = tribeCrypto.generateInviteSalt();
      const ek = tribeCrypto.encryptForInvite(key, code, inviteSalt);
      const invitePub = await new Promise((resolve, reject) => {
        ssbClient.publish({ type: 'event-invite', target: rid, ek, salt: inviteSalt, codeHash: tribeCrypto.hashInviteCode(code, inviteSalt), multi: 1 }, (err, r) => err ? reject(err) : resolve(r));
      });
      await new Promise((resolve, reject) => {
        ssbClient.publish({ type: 'event-open-invite', v: 1, target: rid, code, inviteKey: invitePub.key, by: userId, createdAt: new Date().toISOString() }, (err) => err ? reject(err) : resolve());
      });
      return { code, eventId: rid };
    },

    async removeOpenInvite(eventId) {
      const ssbClient = await openSsb();
      const userId = await me();
      const rec = await this.getOpenInvite(eventId);
      if (!rec) return;
      let organizer = null;
      try {
        const ev = await new Promise((res, rej) => ssbClient.get(eventId, (err, m) => err || !m || !m.content ? rej(new Error("nf")) : res(m)));
        const rid = await this.resolveRootId(eventId);
        const c = ev.content && ev.content.encryptedPayload ? decryptEventContent(ev.content, rid) : ev.content;
        organizer = c && c.organizer;
      } catch (_) {}
      if (rec.by !== userId && organizer !== userId) throw new Error("Not allowed to remove this invitation");
      await new Promise((resolve, reject) => ssbClient.publish({ type: 'event-open-invite-tombstone', target: rec.markerKey, ts: new Date().toISOString() }, (err) => err ? reject(err) : resolve()));
      if (rec.inviteKey) await new Promise((resolve, reject) => ssbClient.publish({ type: 'event-invite-tombstone', target: rec.inviteKey, ts: new Date().toISOString() }, (err) => err ? reject(err) : resolve()));
    },

    async joinByInvite(code) {
      if (!ownCrypto || !tribeCrypto) throw new Error("Event crypto unavailable");
      const ssbClient = await openSsb();
      const userId = await me();
      const messages = await readAll(ssbClient);
      const invTomb = new Set();
      for (const m of messages) {
        const c = m.value && m.value.content;
        if (c && c.type === 'event-invite-tombstone' && typeof c.target === 'string') invTomb.add(c.target);
      }
      let matched = null;
      for (const m of messages) {
        const c = m.value && m.value.content;
        if (!c || c.type !== 'event-invite') continue;
        if (invTomb.has(m.key)) continue;
        try {
          const hash = tribeCrypto.hashInviteCode(code, c.salt);
          if (hash === c.codeHash) { matched = c; break; }
        } catch (_) {}
      }
      if (!matched) throw new Error("Invalid or expired invite code");
      const eventKey = tribeCrypto.decryptFromInvite(matched.ek, code, matched.salt);
      if (!eventKey) throw new Error("Could not decrypt invite");
      ownCrypto.addNewKey(matched.target, eventKey);
      await this.toggleAttendee(matched.target);
      return { ok: true, eventId: matched.target };
    },

    async toggleAttendee(eventId) {
      const ssbClient = await openSsb();
      const userId = await me();
      const messages = await readAll(ssbClient);
      const idx = buildEventIndex(messages);
      const rid = idx.rootOf(eventId);
      const contentTip = idx.contentTipOf(rid);
      const ev = await new Promise((res, rej) => ssbClient.get(contentTip, (err, ev) => err || !ev || !ev.content ? rej(new Error("Error retrieving event")) : res(ev)));
      const c = ev.content && ev.content.encryptedPayload ? decryptEventContent(ev.content, rid) : ev.content;
      if (c && c._undecryptable) throw new Error("Event is encrypted and cannot be decrypted");

      const status = deriveStatus(c);
      if (status === 'CLOSED') throw new Error("Cannot attend a closed event");

      const collab = collectCollab(messages);
      const agg = aggregateCollab(c, rid, collab);
      const isAttending = agg.attendees.includes(userId);
      const isLeaving = isAttending;
      const on = !isAttending;

      const isPrivate = normalizePrivacy(c.isPublic) === 'private';
      const isOrganizer = c.organizer === userId;

      const result = await new Promise((resolve, reject) => {
        ssbClient.publish({ type: 'eventAttend', target: rid, on, createdAt: new Date().toISOString() }, (err2, res2) => err2 ? reject(err2) : resolve(res2));
      });

      if (isPrivate && !isLeaving && ownCrypto && tribeCrypto) {
        try {
          const key = lookupKey(rid);
          if (key) {
            const ssbKeys = require("../server/node_modules/ssb-keys");
            const memberKeys = {};
            try { memberKeys[userId] = tribeCrypto.boxKeyForMember(key, userId, ssbKeys); } catch (_) {}
            if (memberKeys[userId]) {
              await new Promise((resolve) => {
                ssbClient.publish({ type: "tribe-keys", tribeId: rid, generation: 1, memberKeys }, () => resolve());
              });
            }
          }
        } catch (_) {}
      }

      if (isPrivate && isLeaving && !isOrganizer && ownCrypto && tribeCrypto) {
        try {
          const remaining = agg.attendees.filter(a => a !== userId);
          const newKey = ownCrypto.generateTribeKey();
          const newGen = ownCrypto.addNewKey(rid, newKey);
          const ssbKeys = require("../server/node_modules/ssb-keys");
          const memberKeys = {};
          for (const m of remaining) {
            try { memberKeys[m] = tribeCrypto.boxKeyForMember(newKey, m, ssbKeys); } catch (_) {}
          }
          if (Object.keys(memberKeys).length) {
            await new Promise((resolve) => {
              ssbClient.publish({ type: "tribe-keys", tribeId: rid, generation: newGen, memberKeys }, () => resolve());
            });
          }
        } catch (_) {}
      }

      return result;
    },

    async deleteEventById(eventId) {
      const ssbClient = await openSsb();
      const userId = await me();
      const ev = await new Promise((res, rej) => ssbClient.get(eventId, (err, ev) => err || !ev || !ev.content ? rej(new Error("Error retrieving event")) : res(ev)));
      const rid = await this.resolveRootId(eventId);
      const c = ev.content && ev.content.encryptedPayload ? decryptEventContent(ev.content, rid) : ev.content;
      if (c && c._undecryptable) throw new Error("Event is encrypted and cannot be decrypted");
      if (c.organizer !== userId) throw new Error("Only the organizer can delete this event");
      const tombstone = { type: 'tombstone', target: eventId, deletedAt: new Date().toISOString(), author: userId };
      return new Promise((resolve, reject) => {
        ssbClient.publish(tombstone, (err, res) => err ? reject(err) : resolve(res));
      });
    },

    async getEventById(eventId) {
      const ssbClient = await openSsb();
      const messages = await readAll(ssbClient);
      const idx = buildEventIndex(messages);
      const rid = idx.rootOf(eventId);
      const contentTip = idx.contentTipOf(rid);
      const msg = await new Promise((res, rej) => ssbClient.get(contentTip, (err, msg) => err || !msg || !msg.content ? rej(new Error("Error retrieving event")) : res(msg)));
      const c = msg.content && msg.content.encryptedPayload ? decryptEventContent(msg.content, rid) : msg.content;
      if (c && c._undecryptable) throw new Error("Event is encrypted and cannot be decrypted with available keys");

      const status = deriveStatus(c);
      const agg = aggregateCollab(c, rid, collectCollab(messages));

      return {
        id: contentTip,
        title: c.title || '',
        description: c.description || '',
        date: c.date || '',
        location: c.location || '',
        price: c.price || 0,
        url: c.url || '',
        attendees: agg.attendees,
        tags: Array.isArray(c.tags) ? c.tags : [],
        createdAt: c.createdAt || new Date().toISOString(),
        updatedAt: c.updatedAt || new Date().toISOString(),
        organizer: c.organizer || '',
        status,
        isPublic: normalizePrivacy(c.isPublic),
        mapUrl: c.mapUrl || "",
        clearnetPublic: !!c.clearnetPublic,
        encrypted: normalizePrivacy(c.isPublic) === 'private',
        opinions: agg.opinions,
        opinions_inhabitants: agg.opinions_inhabitants
      };
    },

    async updateEventById(eventId, updatedData) {
      const ssbClient = await openSsb();
      const userId = await me();
      const ev = await new Promise((res, rej) => ssbClient.get(eventId, (err, ev) => err || !ev || !ev.content ? rej(new Error("Error retrieving event")) : res(ev)));
      const rid = await this.resolveRootId(eventId);
      const c = ev.content && ev.content.encryptedPayload ? decryptEventContent(ev.content, rid) : ev.content;
      if (c && c._undecryptable) throw new Error("Event is encrypted and cannot be decrypted");
      if (c.organizer !== userId) throw new Error("Only the organizer can update this event");
      const status = deriveStatus(c);
      if (status === 'CLOSED') throw new Error("Cannot edit a closed event");

      const tags = updatedData.tags !== undefined
        ? (Array.isArray(updatedData.tags)
            ? updatedData.tags.filter(Boolean)
            : String(updatedData.tags || '').split(',').map(t => t.trim()).filter(Boolean))
        : (Array.isArray(c.tags) ? c.tags : []);

      const date = updatedData.date !== undefined && updatedData.date !== ''
        ? normalizeDate(updatedData.date)
        : c.date;

      if (moment(date).isBefore(moment().startOf('minute'))) throw new Error("Cannot set an event in the past");

      let updated = {
        ...c,
        title: updatedData.title ?? c.title,
        description: updatedData.description ?? c.description,
        date,
        location: updatedData.location ?? c.location,
        price: updatedData.price !== undefined ? normalizePrice(updatedData.price) : c.price,
        url: updatedData.url ?? c.url,
        tags,
        isPublic: updatedData.isPublic !== undefined ? normalizePrivacy(updatedData.isPublic) : normalizePrivacy(c.isPublic),
        clearnetPublic: updatedData.clearnetPublic !== undefined ? (updatedData.clearnetPublic === true || updatedData.clearnetPublic === 'true' || updatedData.clearnetPublic === 'on') : !!c.clearnetPublic,
        attendees: uniq(Array.isArray(c.attendees) ? c.attendees : []),
        updatedAt: new Date().toISOString(),
        replaces: eventId
      };

      const wasPrivate = normalizePrivacy(c.isPublic) === 'private';
      const isPrivate = updated.isPublic === 'private';
      let newKey = null;
      if (isPrivate && ownCrypto && tribeCrypto) {
        let key = lookupKey(rid);
        if (!key) {
          newKey = ownCrypto.generateTribeKey();
          ownCrypto.setKey(rid, newKey, 1);
          key = newKey;
        }
        updated = tribeCrypto.encryptContent(updated, [key], true);
      }

      const result = await new Promise((resolve, reject) => {
        ssbClient.publish(updated, (err2, res2) => err2 ? reject(err2) : resolve(res2));
      });

      if (newKey && tribeCrypto) {
        try {
          const ssbKeys = require("../server/node_modules/ssb-keys");
          const memberKeys = {};
          for (const m of (Array.isArray(c.attendees) ? c.attendees : [userId])) {
            try { memberKeys[m] = tribeCrypto.boxKeyForMember(newKey, m, ssbKeys); } catch (_) {}
          }
          if (Object.keys(memberKeys).length) {
            await new Promise((resolve) => {
              ssbClient.publish({ type: "tribe-keys", tribeId: rid, generation: 1, memberKeys }, () => resolve());
            });
          }
        } catch (_) {}
      }

      return result;
    },

    async createOpinion(id, category) {
      const categories = require('../backend/opinion_categories');
      if (!categories.includes(category)) throw new Error('Invalid opinion category');
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const messages = await readAll(ssbClient);
      const idx = buildEventIndex(messages);
      const rid = idx.rootOf(id);
      const contentTip = idx.contentTipOf(rid);
      const ev = await new Promise((res, rej) => ssbClient.get(contentTip, (err, m) => (err || !m || !m.content) ? rej(new Error('Event not found')) : res(m)));
      const c = ev.content && ev.content.encryptedPayload ? decryptEventContent(ev.content, rid) : ev.content;
      if (c && c._undecryptable) throw new Error('Event is encrypted and cannot be decrypted');
      const agg = aggregateCollab(c, rid, collectCollab(messages));
      if (agg.opinions_inhabitants.includes(userId)) throw new Error('Already opined');
      return new Promise((res, rej) => ssbClient.publish({ type: 'eventOpinion', target: rid, category, createdAt: new Date().toISOString() }, (err, result) => err ? rej(err) : res(result)));
    },

    async listAll(author = null, filter = 'all') {
      const ssbClient = await openSsb();
      const userId = await me();
      return new Promise((resolve, reject) => {
        pull(
          ssbClient.createLogStream({ limit: logLimit }),
          pull.collect((err, results) => {
            if (err) return reject(new Error("Error listing events: " + err.message));
            const tombstoned = buildValidatedTombstoneSet(results);
            const idx = buildEventIndex(results);
            const collab = collectCollab(results);

            const roots = new Set();
            for (const r of results) {
              const rawC = r.value && r.value.content;
              if (!rawC || rawC.type !== 'event') continue;
              if (!idx.eventAuthor.has(r.key)) continue;
              roots.add(idx.rootOf(r.key));
            }

            const byRoot = new Map();
            for (const rid of roots) {
              if (tombstoned.has(rid)) continue;
              const contentTip = idx.contentTipOf(rid);
              if (tombstoned.has(contentTip)) continue;
              const r = results.find(x => x.key === contentTip);
              if (!r) continue;
              const rawC = r.value && r.value.content;
              if (!rawC) continue;
              const c = rawC.encryptedPayload ? decryptEventContent(rawC, rid) : rawC;
              if (!c || c._undecryptable) continue;
              if (author && c.organizer !== author) continue;

              const status = deriveStatus(c);
              const agg = aggregateCollab(c, rid, collab);

              byRoot.set(rid, {
                id: contentTip,
                title: c.title || '',
                description: c.description || '',
                date: c.date || '',
                location: c.location || '',
                price: c.price || 0,
                url: c.url || '',
                attendees: agg.attendees,
                tags: Array.isArray(c.tags) ? c.tags.filter(Boolean) : [],
                createdAt: c.createdAt || new Date().toISOString(),
                organizer: c.organizer || '',
                status,
                isPublic: normalizePrivacy(c.isPublic),
                mapUrl: c.mapUrl || "",
                encrypted: normalizePrivacy(c.isPublic) === 'private',
                opinions: agg.opinions,
                opinions_inhabitants: agg.opinions_inhabitants
              });
            }

            let out = Array.from(byRoot.values());
            out = dedupeBy(out, e => e.title ? [norm(e.organizer), norm(e.title), norm(e.date)].join('|') : null);

            if (filter === 'mine') out = out.filter(e => e.organizer === userId);
            if (filter === 'open') out = out.filter(e => String(e.status).toUpperCase() === 'OPEN');
            if (filter === 'closed') out = out.filter(e => String(e.status).toUpperCase() === 'CLOSED');

            resolve(out);
          })
        );
      });
    }
  };
};

