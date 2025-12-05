const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { config } = require('../server/SSB_server.js');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const userId = config.keys.id;

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

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

  return {
    type: 'event',

    async createEvent(title, description, date, location, price = 0, url = "", attendees = [], tagsRaw = [], isPublic) {
      const ssbClient = await openSsb();

      const formattedDate = normalizeDate(date);
      if (moment(formattedDate).isBefore(moment().startOf('minute'))) throw new Error("Cannot create an event in the past");

      let attendeeList = attendees;
      if (!Array.isArray(attendeeList)) attendeeList = String(attendeeList || '').split(',').map(s => s.trim()).filter(Boolean);
      attendeeList = uniq([...attendeeList, userId]);

      const tags = Array.isArray(tagsRaw)
        ? tagsRaw.filter(Boolean)
        : String(tagsRaw || '').split(',').map(s => s.trim()).filter(Boolean);

      const content = {
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
        isPublic: normalizePrivacy(isPublic)
      };

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res));
      });
    },

    async toggleAttendee(eventId) {
      const ssbClient = await openSsb();
      const ev = await new Promise((res, rej) => ssbClient.get(eventId, (err, ev) => err || !ev || !ev.content ? rej(new Error("Error retrieving event")) : res(ev)));
      const c = ev.content;

      const status = deriveStatus(c);
      if (status === 'CLOSED') throw new Error("Cannot attend a closed event");

      let attendees = uniq(c.attendees || []);
      const idx = attendees.indexOf(userId);
      if (idx !== -1) attendees.splice(idx, 1); else attendees.push(userId);
      attendees = uniq(attendees);

      const updated = {
        ...c,
        attendees,
        updatedAt: new Date().toISOString(),
        replaces: eventId
      };

      return new Promise((resolve, reject) => {
        ssbClient.publish(updated, (err2, res2) => err2 ? reject(err2) : resolve(res2));
      });
    },

    async deleteEventById(eventId) {
      const ssbClient = await openSsb();
      const ev = await new Promise((res, rej) => ssbClient.get(eventId, (err, ev) => err || !ev || !ev.content ? rej(new Error("Error retrieving event")) : res(ev)));
      if (ev.content.organizer !== userId) throw new Error("Only the organizer can delete this event");
      const tombstone = { type: 'tombstone', target: eventId, deletedAt: new Date().toISOString(), author: userId };
      return new Promise((resolve, reject) => {
        ssbClient.publish(tombstone, (err, res) => err ? reject(err) : resolve(res));
      });
    },

    async getEventById(eventId) {
      const ssbClient = await openSsb();
      const msg = await new Promise((res, rej) => ssbClient.get(eventId, (err, msg) => err || !msg || !msg.content ? rej(new Error("Error retrieving event")) : res(msg)));
      const c = msg.content;

      const status = deriveStatus(c);

      return {
        id: eventId,
        title: c.title || '',
        description: c.description || '',
        date: c.date || '',
        location: c.location || '',
        price: c.price || 0,
        url: c.url || '',
        attendees: Array.isArray(c.attendees) ? c.attendees : [],
        tags: Array.isArray(c.tags) ? c.tags : [],
        createdAt: c.createdAt || new Date().toISOString(),
        updatedAt: c.updatedAt || new Date().toISOString(),
        organizer: c.organizer || '',
        status,
        isPublic: normalizePrivacy(c.isPublic)
      };
    },

    async updateEventById(eventId, updatedData) {
      const ssbClient = await openSsb();
      const ev = await new Promise((res, rej) => ssbClient.get(eventId, (err, ev) => err || !ev || !ev.content ? rej(new Error("Error retrieving event")) : res(ev)));
      if (ev.content.organizer !== userId) throw new Error("Only the organizer can update this event");

      const c = ev.content;
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

      const updated = {
        ...c,
        title: updatedData.title ?? c.title,
        description: updatedData.description ?? c.description,
        date,
        location: updatedData.location ?? c.location,
        price: updatedData.price !== undefined ? normalizePrice(updatedData.price) : c.price,
        url: updatedData.url ?? c.url,
        tags,
        isPublic: updatedData.isPublic !== undefined ? normalizePrivacy(updatedData.isPublic) : normalizePrivacy(c.isPublic),
        attendees: uniq(Array.isArray(c.attendees) ? c.attendees : []),
        updatedAt: new Date().toISOString(),
        replaces: eventId
      };

      return new Promise((resolve, reject) => {
        ssbClient.publish(updated, (err2, res2) => err2 ? reject(err2) : resolve(res2));
      });
    },

    async listAll(author = null, filter = 'all') {
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        pull(
          ssbClient.createLogStream({ limit: logLimit }),
          pull.collect((err, results) => {
            if (err) return reject(new Error("Error listing events: " + err.message));
            const tombstoned = new Set();
            const replaces = new Map();
            const byId = new Map();

            for (const r of results) {
              const k = r.key;
              const c = r.value && r.value.content;
              if (!c) continue;

              if (c.type === 'tombstone' && c.target) {
                tombstoned.add(c.target);
                continue;
              }

              if (c.type === 'event') {
                if (c.replaces) replaces.set(c.replaces, k);
                if (author && c.organizer !== author) continue;

                const status = deriveStatus(c);

                byId.set(k, {
                  id: k,
                  title: c.title || '',
                  description: c.description || '',
                  date: c.date || '',
                  location: c.location || '',
                  price: c.price || 0,
                  url: c.url || '',
                  attendees: Array.isArray(c.attendees) ? uniq(c.attendees) : [],
                  tags: Array.isArray(c.tags) ? c.tags.filter(Boolean) : [],
                  createdAt: c.createdAt || new Date().toISOString(),
                  organizer: c.organizer || '',
                  status,
                  isPublic: normalizePrivacy(c.isPublic)
                });
              }
            }

            replaces.forEach((_, oldId) => byId.delete(oldId));
            tombstoned.forEach(id => byId.delete(id));

            let out = Array.from(byId.values());

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

