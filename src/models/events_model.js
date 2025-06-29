const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { config } = require('../server/SSB_server.js');

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
        opinions: {},
        opinions_inhabitants: [],
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

    async listAll(author = null, filter = 'all') {
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        pull(
          ssbClient.createLogStream(),
          pull.collect(async (err, results) => {
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
                if (tombstoned.has(k)) continue;
                if (c.replaces) replaces.set(c.replaces, k);
                if (author && c.organizer !== author) continue;
                let status = c.status || 'OPEN';
                const dateM = moment(c.date);
                if (dateM.isValid() && dateM.isBefore(moment()) && status !== 'CLOSED') {
                  const tombstone = {
                    type: 'tombstone',
                    target: k,
                    deletedAt: new Date().toISOString(),
                    author: c.organizer
                  };
                  const updated = {
                    ...c,
                    status: 'CLOSED',
                    updatedAt: new Date().toISOString(),
                    replaces: k
                  };
                  await new Promise((res, rej) => ssbClient.publish(tombstone, err => err ? rej(err) : res()));
                  await new Promise((res, rej) => ssbClient.publish(updated, err => err ? rej(err) : res()));
                  status = 'CLOSED';
                }
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
                  opinions: c.opinions || {},
                  opinions_inhabitants: c.opinions_inhabitants || [],
                  isPublic: c.isPublic
                });
              }
            }
            for (const replaced of replaces.keys()) {
              byId.delete(replaced);
            }
            let out = Array.from(byId.values());
            if (filter === 'mine') out = out.filter(e => e.organizer === userId);
            if (['features', 'bugs', 'abuse', 'content'].includes(filter)) out = out.filter(e => e.category === filter);
            if (filter === 'confirmed') out = out.filter(e => e.confirmations?.length >= 3);
            if (['open', 'resolved', 'invalid', 'underreview'].includes(filter)) out = out.filter(e => e.status.toLowerCase() === filter);
            resolve(out);
          })
        );
      });
    },

    async updateEventById(eventId, updatedData) {
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        ssbClient.get(eventId, (err, ev) => {
          if (err || !ev || !ev.content) return reject(new Error("Error retrieving event"));
          if (Object.keys(ev.content.opinions || {}).length > 0) return reject(new Error('Cannot edit event after it has received opinions'));
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
            opinions: c.opinions || {},
            opinions_inhabitants: c.opinions_inhabitants || [],
            organizer: c.organizer || '',
            status,
            isPublic: c.isPublic || 'private'
          });
        });
      });
    },

    async createOpinion(id, category) {
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'event') return reject(new Error('Event not found'));
          if (msg.content.opinions_inhabitants?.includes(userId)) return reject(new Error('Already voted'));
          const tombstone = {
            type: 'tombstone',
            target: id,
            deletedAt: new Date().toISOString(),
            author: userId
          };
          const updated = {
            ...msg.content,
            opinions: {
              ...msg.content.opinions,
              [category]: (msg.content.opinions?.[category] || 0) + 1
            },
            opinions_inhabitants: [...(msg.content.opinions_inhabitants || []), userId],
            updatedAt: new Date().toISOString(),
            replaces: id
          };
          ssbClient.publish(tombstone, err => {
            if (err) return reject(err);
            ssbClient.publish(updated, (err2, result) => err2 ? reject(err2) : resolve(result));
          });
        });
      });
    }
  };
};

