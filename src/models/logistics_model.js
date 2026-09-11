const pull = require('../server/node_modules/pull-stream');
const { readTyped } = require('./typed_log');
const categories = require('../backend/opinion_categories');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const ROUTE_TYPE = 'logisticsRoute';
const RATING_TYPE = 'logisticsRating';
const BOOKING_TYPE = 'logistics-booking';
const BOOKING_STATUS_TYPE = 'logistics-booking-status';
const OPINION_TYPE = 'logisticsOpinion';
const PUBLIC_TYPES = [ROUTE_TYPE, RATING_TYPE, OPINION_TYPE, 'tombstone'];
const KINDS = ['TRIP', 'SHIPMENT'];
const MODES = ['OFFER', 'REQUEST'];
const PRICE_TYPES = ['FREE', 'ECO', 'TIME'];
const RECURRENCES = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'];
const STATUSES = ['OPEN', 'CLOSED'];
const BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'DELIVERED'];
const OWNER_BOOKING_STATUSES = ['CONFIRMED', 'REJECTED', 'DELIVERED'];
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ZONES = 8;

const safeText = (v) => String(v == null ? '' : v).trim();
const normU = (v) => String(v || '').trim().toUpperCase();
const pick = (list, v, fallback) => (list.includes(normU(v)) ? normU(v) : fallback);
const normalizeTags = (raw) => {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(',');
  return Array.from(new Set(arr.map(t => String(t || '').trim()).filter(Boolean)));
};
const toIso = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString() : ''; };
const num = (v, min = 0) => { const n = Number(v); return Number.isFinite(n) && n >= min ? n : 0; };
const MEDIA_RE = /!?\[(image|video):[^\]]*\]\((&[^)]+)\)/;
const mediaOf = (text) => { const m = safeText(text).match(MEDIA_RE); return m ? { kind: m[1], blobId: m[2] } : null; };
const zoneKey = (s) => safeText(s).toLowerCase();

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const publish = (ssbClient, content) => new Promise((resolve, reject) => ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res)));
  const publishPrivate = (ssbClient, content, recps) => new Promise((resolve, reject) => ssbClient.private.publish(content, recps, (err, res) => err ? reject(err) : resolve(res)));

  const readPublic = async (ssbClient) => readTyped(ssbClient, PUBLIC_TYPES, { limit: logLimit });

  const readPrivate = async (ssbClient) => {
    const raw = await new Promise((resolve, reject) => {
      pull(ssbClient.createLogStream({ reverse: false }), pull.collect((err, arr) => err ? reject(err) : resolve(arr)));
    });
    const bookings = [];
    const statuses = [];
    for (const m of raw) {
      if (!m || !m.value || typeof m.value.content !== 'string') continue;
      let dec;
      try { dec = ssbClient.private.unbox({ key: m.key, value: m.value, timestamp: m.timestamp || m.value.timestamp }); } catch (_) { continue; }
      const v = (dec && dec.value) || {};
      const c = v.content;
      if (!c || typeof c !== 'object') continue;
      const ts = v.timestamp || m.timestamp || 0;
      if (c.type === BOOKING_TYPE && c.routeId) bookings.push({ id: m.key, author: v.author, ts, c });
      else if (c.type === BOOKING_STATUS_TYPE && c.bookingId) statuses.push({ key: m.key, author: v.author, ts, c });
    }
    return { bookings, statuses };
  };

  const buildIndex = (messages) => {
    const tomb = buildValidatedTombstoneSet(messages);
    const nodes = new Map();
    const parentOf = new Map();
    const ratings = [];
    const opinions = [];
    for (const m of messages) {
      const v = m.value || {};
      const c = v.content;
      if (!c || typeof c !== 'object') continue;
      if (c.type === ROUTE_TYPE) {
        nodes.set(m.key, { key: m.key, author: v.author, ts: v.timestamp || m.timestamp || 0, c });
        if (typeof c.replaces === 'string') parentOf.set(m.key, c.replaces);
      } else if (c.type === OPINION_TYPE && typeof c.target === 'string') {
        opinions.push({ target: c.target, author: v.author, category: String(c.category || ''), ts: v.timestamp || 0 });
      } else if (c.type === RATING_TYPE && typeof c.target === 'string') {
        ratings.push({ key: m.key, target: c.target, author: v.author, ts: v.timestamp || 0, score: Math.min(5, Math.max(1, num(c.score, 1) || 1)), text: safeText(c.text), createdAt: c.createdAt || new Date(v.timestamp || 0).toISOString() });
      }
    }
    const rootOf = (key) => {
      const seen = new Set();
      let cur = key;
      while (parentOf.has(cur) && !seen.has(cur)) { seen.add(cur); cur = parentOf.get(cur); }
      return cur;
    };
    const versionsByRoot = new Map();
    for (const node of nodes.values()) {
      const root = rootOf(node.key);
      if (tomb.has(root)) continue;
      if (!versionsByRoot.has(root)) versionsByRoot.set(root, []);
      versionsByRoot.get(root).push(node);
    }
    const routes = new Map();
    const now = Date.now();
    for (const [root, versions] of versionsByRoot) {
      versions.sort((a, b) => a.ts - b.ts);
      const first = versions[0];
      const own = versions.filter(v => v.author === first.author);
      const tip = own[own.length - 1];
      const c = tip.c;
      const dateIso = toIso(c.date);
      const dateTs = Date.parse(dateIso) || 0;
      const recurrence = pick(RECURRENCES, c.recurrence, 'NONE');
      const past = !!dateTs && dateTs < now && recurrence === 'NONE';
      const status = pick(STATUSES, c.status, 'OPEN') === 'CLOSED' ? 'CLOSED' : (past ? 'PAST' : 'OPEN');
      const byAuthor = new Map();
      for (const r of ratings.filter(r => nodes.has(r.target) && rootOf(r.target) === root)) {
        const prev = byAuthor.get(r.author);
        if (!prev || r.ts >= prev.ts) byAuthor.set(r.author, r);
      }
      const routeRatings = Array.from(byAuthor.values()).sort((a, b) => b.ts - a.ts);
      const ops = {};
      const voters = [];
      for (const op of opinions.filter(o => nodes.has(o.target) && rootOf(o.target) === root).sort((a, b) => a.ts - b.ts)) {
        if (voters.includes(op.author) || !categories.includes(op.category)) continue;
        voters.push(op.author);
        ops[op.category] = (ops[op.category] || 0) + 1;
      }
      const ratingAvg = routeRatings.length ? Math.round((routeRatings.reduce((s, r) => s + r.score, 0) / routeRatings.length) * 10) / 10 : 0;
      routes.set(root, {
        id: root, rootId: root, tipId: tip.key,
        kind: pick(KINDS, c.kind, 'TRIP'), mode: pick(MODES, c.mode, 'OFFER'),
        title: safeText(c.title), description: safeText(c.description),
        origin: safeText(c.origin), destination: safeText(c.destination), mapUrl: safeText(c.mapUrl),
        date: dateIso, dateTs, recurrence,
        seats: num(c.seats), seatsTaken: num(c.seatsTaken), size: safeText(c.size), weight: safeText(c.weight), media: mediaOf(c.description),
        priceType: pick(PRICE_TYPES, c.priceType, 'FREE'), price: num(c.price),
        orderRef: safeText(c.orderRef), tags: normalizeTags(c.tags),
        status, closed: status !== 'OPEN',
        author: first.author, createdAt: first.c.createdAt || new Date(first.ts).toISOString(),
        updatedAt: c.updatedAt || new Date(tip.ts).toISOString(), ts: tip.ts,
        ratings: routeRatings, ratingCount: routeRatings.length, ratingAvg,
        opinions: ops, opinions_inhabitants: voters, opinionCount: voters.length
      });
    }
    return { routes, rootOf, nodes };
  };

  const bookingsFor = (priv, routeId, me) => {
    const statusById = new Map();
    for (const s of priv.statuses) {
      const prev = statusById.get(s.c.bookingId);
      if (!prev || s.ts >= prev.ts) statusById.set(s.c.bookingId, { status: pick(BOOKING_STATUSES, s.c.status, 'PENDING'), ts: s.ts, by: s.author, receipt: safeText(s.c.receipt) });
    }
    return priv.bookings
      .filter(b => String(b.c.routeId) === String(routeId))
      .map(b => {
        const st = statusById.get(b.id) || null;
        return {
          id: b.id, routeId: String(b.c.routeId), booker: b.author, owner: safeText(b.c.owner),
          seats: num(b.c.seats), notes: safeText(b.c.notes), orderRef: safeText(b.c.orderRef),
          createdAt: b.c.createdAt || new Date(b.ts).toISOString(), ts: b.ts,
          status: st ? st.status : 'PENDING', statusAt: st ? new Date(st.ts).toISOString() : null, receipt: st ? st.receipt : '',
          mine: b.author === me
        };
      })
      .sort((a, b) => b.ts - a.ts);
  };

  const load = async () => {
    const ssbClient = await openSsb();
    const [pub, priv] = await Promise.all([readPublic(ssbClient), readPrivate(ssbClient)]);
    return { ssbClient, idx: buildIndex(pub), priv };
  };

  const find = (idx, id) => {
    const key = String(id || '');
    if (idx.routes.has(key)) return idx.routes.get(key);
    if (idx.nodes.has(key)) return idx.routes.get(idx.rootOf(key)) || null;
    return null;
  };

  const decorate = (route, priv, me) => {
    const bookings = bookingsFor(priv, route.id, me);
    const confirmed = bookings.filter(b => b.status === 'CONFIRMED' || b.status === 'DELIVERED');
    const taken = Math.max(route.seatsTaken || 0, confirmed.reduce((s, b) => s + (b.seats || 1), 0));
    const myBooking = bookings.find(b => b.mine && b.status !== 'CANCELLED' && b.status !== 'REJECTED') || null;
    const isOwner = route.author === me;
    const participated = isOwner || confirmed.some(b => b.mine);
    const myRating = route.ratings.find(r => r.author === me) || null;
    return {
      ...route,
      bookings: isOwner ? bookings : bookings.filter(b => b.mine),
      bookingCount: bookings.filter(b => b.status !== 'CANCELLED' && b.status !== 'REJECTED').length,
      confirmedCount: confirmed.length, seatsTaken: taken,
      seatsLeft: route.kind === 'TRIP' && route.seats ? Math.max(0, route.seats - taken) : null,
      myBooking, isOwner, participated,
      canBook: !isOwner && !route.closed && !myBooking,
      canRate: participated && route.closed && !myRating,
      myRating,
      lastActivityTs: Math.max(route.ts, ...bookings.map(b => b.ts), ...route.ratings.map(r => r.ts))
    };
  };

  const routeContent = (userId, data, base = null) => ({
    type: ROUTE_TYPE,
    kind: pick(KINDS, data.kind, base ? base.kind : 'TRIP'),
    mode: pick(MODES, data.mode, base ? base.mode : 'OFFER'),
    title: safeText(data.title) || (base ? base.title : ''),
    description: data.description !== undefined ? safeText(data.description) : (base ? base.description : ''),
    origin: data.origin !== undefined ? safeText(data.origin) : (base ? base.origin : ''),
    destination: data.destination !== undefined ? safeText(data.destination) : (base ? base.destination : ''),
    mapUrl: data.mapUrl !== undefined ? safeText(data.mapUrl) : (base ? base.mapUrl : ''),
    date: data.date !== undefined ? toIso(data.date) : (base ? base.date : ''),
    recurrence: pick(RECURRENCES, data.recurrence, base ? base.recurrence : 'NONE'),
    seats: data.seats !== undefined ? num(data.seats) : (base ? base.seats : 0),
    size: data.size !== undefined ? safeText(data.size) : (base ? base.size : ''),
    weight: data.weight !== undefined ? safeText(data.weight) : (base ? base.weight : ''),
    priceType: pick(PRICE_TYPES, data.priceType, base ? base.priceType : 'FREE'),
    price: data.price !== undefined ? num(data.price) : (base ? base.price : 0),
    orderRef: data.orderRef !== undefined ? safeText(data.orderRef) : (base ? base.orderRef : ''),
    tags: data.tags !== undefined ? normalizeTags(data.tags) : (base ? base.tags : []),
    status: data.status !== undefined ? pick(STATUSES, data.status, 'OPEN') : (base ? (base.status === 'CLOSED' ? 'CLOSED' : 'OPEN') : 'OPEN'),
    seatsTaken: data.seatsTaken !== undefined ? num(data.seatsTaken) : (base ? base.seatsTaken : 0),
    author: userId,
    createdAt: base ? base.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  return {
    KINDS, MODES, PRICE_TYPES, RECURRENCES, STATUSES, BOOKING_STATUSES,

    async createRoute(data = {}) {
      const ssbClient = await openSsb();
      const content = routeContent(ssbClient.id, data);
      if (!content.title) throw new Error('Title is required');
      if (!content.origin || !content.destination) throw new Error('Origin and destination are required');
      if (!content.date) throw new Error('A valid date is required');
      if (!(content.price > 0)) { content.price = 0; content.priceType = 'FREE'; } else if (content.priceType === 'FREE') content.priceType = 'ECO';
      return publish(ssbClient, content);
    },

    async updateRoute(id, data = {}) {
      const { ssbClient, idx } = await load();
      const route = find(idx, id);
      if (!route) throw new Error('Route not found');
      if (route.author !== ssbClient.id) throw new Error('Only the author can update this route');
      const content = { ...routeContent(ssbClient.id, data, route), replaces: route.tipId };
      if (!(content.price > 0)) { content.price = 0; content.priceType = 'FREE'; } else if (content.priceType === 'FREE') content.priceType = 'ECO';
      const res = await publish(ssbClient, content);
      return { key: res.key, rootId: route.id };
    },

    async createOpinion(id, category) {
      if (!categories.includes(category)) throw new Error('Invalid voting category');
      const { ssbClient, idx } = await load();
      const route = find(idx, id);
      if (!route) throw new Error('Route not found');
      if (route.opinions_inhabitants.includes(ssbClient.id)) throw new Error('Already voted');
      return publish(ssbClient, { type: OPINION_TYPE, target: route.id, category, createdAt: new Date().toISOString() });
    },

    async closeRoute(id) { return this.updateRoute(id, { status: 'CLOSED' }); },
    async reopenRoute(id) { return this.updateRoute(id, { status: 'OPEN' }); },

    async deleteRoute(id) {
      const { ssbClient, idx } = await load();
      const route = find(idx, id);
      if (!route) throw new Error('Route not found');
      if (route.author !== ssbClient.id) throw new Error('Only the author can delete this route');
      await publish(ssbClient, { type: 'tombstone', target: route.id, deletedAt: new Date().toISOString(), author: ssbClient.id });
      return { key: route.id };
    },

    async book(id, { seats = 1, notes = '', orderRef = '' } = {}) {
      const { ssbClient, idx, priv } = await load();
      const me = ssbClient.id;
      const route = find(idx, id);
      if (!route) throw new Error('Route not found');
      const view = decorate(route, priv, me);
      if (view.isOwner) throw new Error('You cannot book your own route');
      if (view.closed) throw new Error('This route is closed');
      if (view.myBooking) throw new Error('You already booked this route');
      const n = route.kind === 'TRIP' ? Math.max(1, Math.floor(num(seats, 1) || 1)) : 1;
      if (view.seatsLeft !== null && n > view.seatsLeft) throw new Error('Not enough seats left');
      const content = { type: BOOKING_TYPE, routeId: route.id, owner: route.author, seats: n, notes: safeText(notes), orderRef: safeText(orderRef), createdAt: new Date().toISOString() };
      const res = await publishPrivate(ssbClient, content, [me, route.author]);
      return { ...res, routeId: route.id, owner: route.author, booker: me };
    },

    async setBookingStatus(bookingId, status, { receipt = '' } = {}) {
      const { ssbClient, priv } = await load();
      const me = ssbClient.id;
      const st = pick(BOOKING_STATUSES, status, '');
      if (!st || st === 'PENDING') throw new Error('Invalid status');
      const b = priv.bookings.find(x => x.id === bookingId);
      if (!b) throw new Error('Booking not found');
      const owner = safeText(b.c.owner);
      if (OWNER_BOOKING_STATUSES.includes(st)) { if (me !== owner) throw new Error('Only the route owner can set this status'); }
      else if (me !== b.author) throw new Error('Only the booker can cancel');
      const content = { type: BOOKING_STATUS_TYPE, bookingId, routeId: String(b.c.routeId), status: st, ...(st === 'DELIVERED' ? { receipt: safeText(receipt) || `Delivered ${new Date().toISOString()}` } : {}), updatedAt: new Date().toISOString() };
      const res = await publishPrivate(ssbClient, content, Array.from(new Set([me, b.author, owner].filter(Boolean))));
      if (me === owner) {
        try {
          const fresh = await load();
          const route = find(fresh.idx, b.c.routeId);
          if (route && route.kind === 'TRIP' && route.seats) {
            const taken = bookingsFor(fresh.priv, route.id, me).filter(x => x.status === 'CONFIRMED' || x.status === 'DELIVERED').reduce((sum, x) => sum + (x.seats || 1), 0);
            if (taken !== route.seatsTaken) await publish(ssbClient, { ...routeContent(me, { seatsTaken: taken }, route), replaces: route.tipId });
          }
        } catch (_) {}
      }
      return { ...res, routeId: String(b.c.routeId), owner, booker: b.author, status: st };
    },

    async rate(id, { score, text = '' } = {}) {
      const { ssbClient, idx, priv } = await load();
      const me = ssbClient.id;
      const route = find(idx, id);
      if (!route) throw new Error('Route not found');
      const view = decorate(route, priv, me);
      if (!view.participated) throw new Error('Only participants can rate a route');
      if (!view.closed) throw new Error('Routes are rated once they are closed');
      if (view.myRating) throw new Error('You already rated this route');
      const s = Math.min(5, Math.max(1, Math.round(num(score, 1) || 1)));
      return publish(ssbClient, { type: RATING_TYPE, target: route.id, score: s, text: safeText(text), createdAt: new Date().toISOString() });
    },

    async getRouteById(id) {
      const { ssbClient, idx, priv } = await load();
      const route = find(idx, id);
      return route ? decorate(route, priv, ssbClient.id) : null;
    },

    async myBookings() {
      const { ssbClient, idx, priv } = await load();
      const me = ssbClient.id;
      const out = [];
      for (const b of priv.bookings) {
        if (b.author !== me) continue;
        const route = find(idx, b.c.routeId);
        if (!route) continue;
        const view = decorate(route, priv, me);
        const mine = view.bookings.find(x => x.id === b.id);
        if (mine) out.push({ ...mine, route: view });
      }
      return out.sort((a, b) => b.ts - a.ts);
    },

    zonesOf(list) {
      const counts = new Map();
      for (const r of list || []) {
        for (const z of [r.origin, r.destination]) {
          const k = zoneKey(z);
          if (!k) continue;
          const prev = counts.get(k) || { label: safeText(z), count: 0 };
          prev.count += 1;
          counts.set(k, prev);
        }
      }
      return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, MAX_ZONES);
    },

    async listAll({ filter = 'all', q = '', zone = '' } = {}) {
      const { ssbClient, idx, priv } = await load();
      const me = ssbClient.id;
      const f = String(filter || 'all').toLowerCase();
      const needle = String(q || '').trim().toLowerCase();
      const z = zoneKey(zone);
      let out = Array.from(idx.routes.values()).map(r => decorate(r, priv, me));
      if (f === 'mine') out = out.filter(r => r.isOwner);
      else if (f === 'booked') out = out.filter(r => !!r.myBooking);
      else if (f === 'recent') out = out.filter(r => r.lastActivityTs >= Date.now() - RECENT_MS);
      else if (f === 'trips') out = out.filter(r => r.kind === 'TRIP');
      else if (f === 'shipments') out = out.filter(r => r.kind === 'SHIPMENT');
      else if (f === 'offers') out = out.filter(r => r.mode === 'OFFER');
      else if (f === 'requests') out = out.filter(r => r.mode === 'REQUEST');
      else if (f === 'upcoming') out = out.filter(r => r.status === 'OPEN');
      else if (f === 'past') out = out.filter(r => r.status === 'PAST');
      else if (f === 'closed') out = out.filter(r => r.status === 'CLOSED');
      else if (f === 'history') out = out.filter(r => r.closed && r.participated);
      else if (f === 'free') out = out.filter(r => r.priceType === 'FREE');
      else if (f === 'eco') out = out.filter(r => r.priceType === 'ECO');
      else if (f === 'time') out = out.filter(r => r.priceType === 'TIME');
      else if (f === 'top') out = out.filter(r => r.ratingCount > 0);
      if (z) out = out.filter(r => zoneKey(r.origin) === z || zoneKey(r.destination) === z);
      if (needle) out = out.filter(r => [r.title, r.description, r.origin, r.destination, r.kind, r.mode, ...r.tags].some(v => String(v || '').toLowerCase().includes(needle)));
      if (f === 'top') out.sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount);
      else out.sort((a, b) => (a.closed === b.closed ? 0 : (a.closed ? 1 : -1)) || (a.dateTs && b.dateTs ? a.dateTs - b.dateTs : b.lastActivityTs - a.lastActivityTs));
      return out;
    },

    async resolveRootId(id) {
      const { idx } = await load();
      const route = find(idx, id);
      return route ? route.id : String(id || '');
    }
  };
};
