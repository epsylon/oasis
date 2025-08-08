const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { config } = require('../server/SSB_server.js');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const userId = config.keys.id;

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  return {
    type: 'event',

    async createEvent(title, description, date, location, price = 0, url = "", attendees = [], tagsRaw = [], isPublic) {
      const ssbClient = await openSsb();
      const formattedDate = date ? moment(date, moment.ISO_8601, true).toISOString() : moment().toISOString();
      if (!moment(formattedDate, moment.ISO_8601, true).isValid()) throw new Error("Invalid date format");
      if (moment(formattedDate).isBefore(moment(), 'minute')) throw new Error("Cannot create an event in the past");
      if (!Array.isArray(attendees)) attendees = attendees.split(',').map(s => s.trim()).filter(Boolean);
      attendees.push(userId);
      const tags = Array.isArray(tagsRaw) ? tagsRaw.filter(Boolean) : tagsRaw.split(',').map(s => s.trim()).filter(Boolean);
      let p = typeof price === 'string' ? parseFloat(price.replace(',', '.')) : price;
      if (isNaN(p)) p = 0;
      const content = {
        type: 'event',
        title,
        description,
        date: formattedDate,
        location,
        price: p.toFixed(6),
        url,
        attendees,
        tags,
        createdAt: new Date().toISOString(),
        organizer: userId,
        status: 'OPEN',
        isPublic
      };
      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res));
      });
    },

    async toggleAttendee(eventId) {
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        ssbClient.get(eventId, async (err, ev) => {
          if (err || !ev || !ev.content) return reject(new Error("Error retrieving event"));
          let attendees = Array.isArray(ev.content.attendees) ? [...ev.content.attendees] : [];
          const idx = attendees.indexOf(userId);
          if (idx !== -1) attendees.splice(idx, 1); else attendees.push(userId);
          const tombstone = {
            type: 'tombstone',
            target: eventId,
            deletedAt: new Date().toISOString(),
            author: userId
          };
          const updated = {
            ...ev.content,
            attendees,
            updatedAt: new Date().toISOString(),
            replaces: eventId
          };
          ssbClient.publish(tombstone, err => {
            if (err) return reject(err);
            ssbClient.publish(updated, (err2, res) => err2 ? reject(err2) : resolve(res));
          });
        });
      });
    },

    async deleteEventById(eventId) {
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        ssbClient.get(eventId, (err, ev) => {
          if (err || !ev || !ev.content) return reject(new Error("Error retrieving event"));
          if (ev.content.organizer !== userId) return reject(new Error("Only the organizer can delete this event"));
          const tombstone = {
            type: 'tombstone',
            target: eventId,
            deletedAt: new Date().toISOString(),
            author: userId
          };
          ssbClient.publish(tombstone, (err, res) => err ? reject(err) : resolve(res));
        });
      });
    },

    async getEventById(eventId) {
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        ssbClient.get(eventId, async (err, msg) => {
          if (err || !msg || !msg.content) return reject(new Error("Error retrieving event"));
          const c = msg.content;
          const dateM = moment(c.date);
          let status = c.status || 'OPEN';
          if (dateM.isValid() && dateM.isBefore(moment()) && status !== 'CLOSED') {
            const tombstone = {
              type: 'tombstone',
              target: eventId,
              deletedAt: new Date().toISOString(),
              author: userId
            };
            const updated = {
              ...c,
              status: 'CLOSED',
              updatedAt: new Date().toISOString(),
              replaces: eventId
            };
            await ssbClient.publish(tombstone);
            await ssbClient.publish(updated);
            status = 'CLOSED';
          }
          resolve({
            id: eventId,
            title: c.title || '',
            description: c.description || '',
            date: c.date || '',
            location: c.location || '',
            price: c.price || 0,
            url: c.url || '',
            attendees: c.attendees || [],
            tags: c.tags || [],
            createdAt: c.createdAt || new Date().toISOString(),
            updatedAt: c.updatedAt || new Date().toISOString(),
            organizer: c.organizer || '',
            status,
            isPublic: c.isPublic || false
          });
        });
      });
    },
    
    
    async updateEventById(eventId, updatedData) {
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        ssbClient.get(eventId, (err, ev) => {
          if (err || !ev || !ev.content) return reject(new Error("Error retrieving event"));
          if (ev.content.organizer !== userId) return reject(new Error("Only the organizer can update this event"));
          const tags = updatedData.tags ? updatedData.tags.split(',').map(t => t.trim()).filter(Boolean) : ev.content.tags;
          const attendees = updatedData.attendees ? updatedData.attendees.split(',').map(t => t.trim()).filter(Boolean) : ev.content.attendees;
          const tombstone = {
            type: 'tombstone',
            target: eventId,
            deletedAt: new Date().toISOString(),
            author: userId
          };
          const updated = {
            ...ev.content,
            ...updatedData,
            attendees,
            tags,
            updatedAt: new Date().toISOString(),
            replaces: eventId
          };
          ssbClient.publish(tombstone, err => {
            if (err) return reject(err);
            ssbClient.publish(updated, (err2, res) => err2 ? reject(err2) : resolve(res));
          });
        });
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
          const c = r.value.content;
          if (!c) continue;

          if (c.type === 'tombstone' && c.target) {
            tombstoned.add(c.target);
            continue;
          }

          if (c.type === 'event') {
            if (c.replaces) replaces.set(c.replaces, k);
            if (author && c.organizer !== author) continue;

            let status = c.status || 'OPEN';
            const dateM = moment(c.date);
            if (dateM.isValid() && dateM.isBefore(moment())) status = 'CLOSED';

            byId.set(k, {
              id: k,
              title: c.title,
              description: c.description,
              date: c.date,
              location: c.location,
              price: c.price,
              url: c.url,
              attendees: c.attendees || [],
              tags: c.tags || [],
              createdAt: c.createdAt,
              organizer: c.organizer,
              status,
              isPublic: c.isPublic
            });
          }
        }
        replaces.forEach((_, oldId) => byId.delete(oldId));
        tombstoned.forEach((id) => byId.delete(id));

        let out = Array.from(byId.values());
        if (filter === 'mine') out = out.filter(e => e.organizer === userId);
        if (filter === 'open') out = out.filter(e => e.status === 'OPEN');
        if (filter === 'closed') out = out.filter(e => e.status === 'CLOSED');
        resolve(out);
        })
       );
     });
    }

  };
};

