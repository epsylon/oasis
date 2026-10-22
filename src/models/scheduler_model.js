const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEDULED_FILE = 'scheduled.json';
const SCHEDULED_DIR = ['oasis', 'content'];
const SCHEDULED_PREFIX = 'scheduled:';
const ID_BYTES = 8;

module.exports = ({ cooler, isPublic = false, configPath = null, stateFile = null }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };
  const filePath = () => stateFile || (configPath ? path.join(configPath, ...SCHEDULED_DIR, SCHEDULED_FILE) : null);
  let unreadable = false;
  const readAll = () => {
    const p = filePath();
    if (!p) return [];
    let raw = null;
    try { raw = fs.readFileSync(p, 'utf8'); } catch (_) { unreadable = false; return []; }
    try { const list = JSON.parse(raw); unreadable = false; return Array.isArray(list) ? list : []; } catch (_) { unreadable = raw.trim() !== ''; return []; }
  };
  const writeAll = (list) => {
    const p = filePath();
    if (!p) return;
    if (unreadable) throw new Error(`${SCHEDULED_FILE} could not be read, refusing to overwrite it`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8');
    fs.renameSync(tmp, p);
  };
  const isScheduledId = (id) => typeof id === 'string' && id.startsWith(SCHEDULED_PREFIX);

  return {
    isScheduledId,

    async schedule(kind, data, publishAt) {
      if (isPublic) throw new Error('Not available in public mode');
      const when = Date.parse(publishAt || '');
      if (!Number.isFinite(when) || when <= Date.now()) throw new Error('The publish date must be in the future');
      const ssbClient = await openSsb();
      const entry = {
        id: SCHEDULED_PREFIX + crypto.randomBytes(ID_BYTES).toString('hex'),
        kind: String(kind),
        author: ssbClient.id,
        createdAt: new Date().toISOString(),
        publishAt: new Date(when).toISOString(),
        data: data && typeof data === 'object' ? data : {}
      };
      writeAll(readAll().concat(entry));
      return entry;
    },

    async listMine(kind) {
      if (isPublic) return [];
      const ssbClient = await openSsb();
      return readAll().filter(e => e.author === ssbClient.id && (!kind || e.kind === kind));
    },

    async get(id) {
      if (isPublic || !isScheduledId(id)) return null;
      const ssbClient = await openSsb();
      return readAll().find(e => e.id === id && e.author === ssbClient.id) || null;
    },

    async update(id, data, publishAt) {
      if (isPublic) throw new Error('Not available in public mode');
      const when = Date.parse(publishAt || '');
      if (!Number.isFinite(when) || when <= Date.now()) throw new Error('The publish date must be in the future');
      const ssbClient = await openSsb();
      const list = readAll();
      const entry = list.find(e => e.id === id);
      if (!entry) throw new Error('Not found');
      if (entry.author !== ssbClient.id) throw new Error('Not the author');
      const next = { ...entry, publishAt: new Date(when).toISOString(), data: { ...entry.data, ...(data && typeof data === 'object' ? data : {}) } };
      delete next.error;
      delete next.failedAt;
      writeAll(list.map(e => (e.id === id ? next : e)));
      return next;
    },

    async fail(id, message) {
      const list = readAll();
      if (!list.some(e => e.id === id)) return;
      writeAll(list.map(e => (e.id === id ? { ...e, error: String(message || 'failed'), failedAt: new Date().toISOString() } : e)));
    },

    async cancel(id) {
      if (isPublic) throw new Error('Not available in public mode');
      const ssbClient = await openSsb();
      const list = readAll();
      const entry = list.find(e => e.id === id);
      if (!entry) throw new Error('Not found');
      if (entry.author !== ssbClient.id) throw new Error('Not the author');
      writeAll(list.filter(e => e.id !== id));
    },

    async due(kind, now = Date.now()) {
      if (isPublic) return [];
      const ssbClient = await openSsb();
      return readAll().filter(e => e.author === ssbClient.id && (!kind || e.kind === kind) && !e.error && Date.parse(e.publishAt || '') <= now);
    },

    async remove(id) {
      writeAll(readAll().filter(e => e.id !== id));
    }
  };
};
