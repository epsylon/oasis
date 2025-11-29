const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { getConfig } = require('../configs/config-manager.js');
const categories = require('../backend/opinion_categories');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const getAllMessages = async (ssbClient) =>
    new Promise((resolve, reject) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
      );
    });

  const resolveCurrentId = async (id) => {
    const ssbClient = await openSsb();
    const messages = await getAllMessages(ssbClient);
    const forward = new Map();
    for (const m of messages) {
      const c = m.value?.content;
      if (!c) continue;
      if (c.type === 'transfer' && c.replaces) forward.set(c.replaces, m.key);
    }
    let cur = id;
    while (forward.has(cur)) cur = forward.get(cur);
    return cur;
  };

  const isValidId = (to) => /^@[A-Za-z0-9+/]+={0,2}\.ed25519$/.test(String(to || ''));

  return {
    type: 'transfer',

    async createTransfer(to, concept, amount, deadline, tagsRaw = []) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      if (!isValidId(to)) throw new Error('Invalid recipient ID');
      const num = typeof amount === 'string' ? parseFloat(amount.replace(',', '.')) : amount;
      if (isNaN(num) || num <= 0) throw new Error('Amount must be positive');
      const dl = moment(deadline, moment.ISO_8601, true);
      if (!dl.isValid() || dl.isBefore(moment())) throw new Error('Deadline must be in the future');
      const tags = Array.isArray(tagsRaw) ? tagsRaw.filter(Boolean) : String(tagsRaw).split(',').map(t => t.trim()).filter(Boolean);
      const isSelf = to === userId;

      const content = {
        type: 'transfer',
        from: userId,
        to,
        concept,
        amount: num.toFixed(6),
        createdAt: new Date().toISOString(),
        deadline: dl.toISOString(),
        confirmedBy: isSelf ? [userId, userId] : [userId],
        status: isSelf ? 'CLOSED' : 'UNCONFIRMED',
        tags,
        opinions: {},
        opinions_inhabitants: []
      };

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg));
      });
    },

    async updateTransferById(id, to, concept, amount, deadline, tagsRaw = []) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await resolveCurrentId(id);

      const old = await new Promise((res, rej) =>
        ssbClient.get(tipId, (err, msg) => err || !msg?.content ? rej(err || new Error()) : res(msg))
      );

      if (old.content.type !== 'transfer') throw new Error('Transfer not found');
      if (Object.keys(old.content.opinions || {}).length > 0) throw new Error('Cannot edit transfer after it has received opinions.');
      if (old.content.from !== userId) throw new Error('Not the author');
      if (old.content.status !== 'UNCONFIRMED') throw new Error('Can only edit unconfirmed');
      if (!isValidId(to)) throw new Error('Invalid recipient ID');

      const num = typeof amount === 'string' ? parseFloat(amount.replace(',', '.')) : amount;
      if (isNaN(num) || num <= 0) throw new Error('Amount must be positive');
      const dl = moment(deadline, moment.ISO_8601, true);
      if (!dl.isValid() || dl.isBefore(moment())) throw new Error('Deadline must be in the future');
      const tags = Array.isArray(tagsRaw) ? tagsRaw.filter(Boolean) : String(tagsRaw).split(',').map(t => t.trim()).filter(Boolean);
      const isSelf = to === userId;

      const tombstone = { type: 'tombstone', target: tipId, deletedAt: new Date().toISOString(), author: userId };
      await new Promise((res, rej) => ssbClient.publish(tombstone, err => err ? rej(err) : res()));

      const updated = {
        type: 'transfer',
        from: userId,
        to,
        concept,
        amount: num.toFixed(6),
        createdAt: old.content.createdAt,
        deadline: dl.toISOString(),
        confirmedBy: isSelf ? [userId, userId] : [userId],
        status: isSelf ? 'CLOSED' : 'UNCONFIRMED',
        tags,
        opinions: {},
        opinions_inhabitants: [],
        updatedAt: new Date().toISOString(),
        replaces: tipId
      };

      return new Promise((resolve, reject) => {
        ssbClient.publish(updated, (err, msg) => err ? reject(err) : resolve(msg));
      });
    },

    async confirmTransferById(id) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await resolveCurrentId(id);

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, async (err, msg) => {
          if (err || !msg?.content || msg.content.type !== 'transfer') return reject(new Error('Not found'));
          const t = msg.content;
          if (t.status !== 'UNCONFIRMED') return reject(new Error('Not unconfirmed'));
          if (t.to !== userId) return reject(new Error('Not the recipient'));

          const newConfirmed = [...(t.confirmedBy || []), userId].filter((v, i, a) => a.indexOf(v) === i);
          const newStatus = newConfirmed.length >= 2 ? 'CLOSED' : 'UNCONFIRMED';

          const tombstone = { type: 'tombstone', target: tipId, deletedAt: new Date().toISOString(), author: userId };
          await new Promise((res, rej) => ssbClient.publish(tombstone, e => e ? rej(e) : res()));

          const upd = { ...t, confirmedBy: newConfirmed, status: newStatus, updatedAt: new Date().toISOString(), replaces: tipId };
          ssbClient.publish(upd, (e2, result) => e2 ? reject(e2) : resolve(result));
        });
      });
    },

    async deleteTransferById(id) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await resolveCurrentId(id);

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, msg) => {
          if (err || !msg?.content || msg.content.type !== 'transfer') return reject(new Error('Not found'));
          const t = msg.content;
          if (t.from !== userId) return reject(new Error('Not the author'));
          if (t.status !== 'UNCONFIRMED' || (t.confirmedBy || []).length >= 2) return reject(new Error('Not editable'));

          const tombstone = { type: 'tombstone', target: tipId, deletedAt: new Date().toISOString(), author: userId };
          ssbClient.publish(tombstone, err2 => err2 ? reject(err2) : resolve());
        });
      });
    },

    async listAll(filter = 'all') {
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);

      const tombstoned = new Set();
      const replaces = new Map();
      const latest = new Map();

      for (const m of messages) {
        const c = m.value?.content;
        const k = m.key;
        if (!c) continue;

        if (c.type === 'tombstone') {
          const tgt = c.target || c.id;
          if (tgt) tombstoned.add(tgt);
          continue;
        }

        if (c.type !== 'transfer') continue;

        if (c.replaces) replaces.set(c.replaces, k);
        latest.set(k, {
          id: k,
          from: c.from,
          to: c.to,
          concept: c.concept,
          amount: c.amount,
          createdAt: c.createdAt,
          deadline: c.deadline,
          confirmedBy: c.confirmedBy || [],
          status: c.status,
          tags: c.tags || [],
          opinions: c.opinions || {},
          opinions_inhabitants: c.opinions_inhabitants || []
        });
      }

      for (const oldId of replaces.keys()) latest.delete(oldId);
      for (const delId of tombstoned.values()) latest.delete(delId);

      const now = moment();
      const out = Array.from(latest.values());

      for (const item of out) {
        const dl = moment(item.deadline);
        if (item.status === 'UNCONFIRMED' && dl.isValid() && dl.isBefore(now)) {
          item.status = (item.confirmedBy || []).length >= 2 ? 'CLOSED' : 'DISCARDED';
        }
      }

      return out;
    },

    async getTransferById(id) {
      const ssbClient = await openSsb();
      const tipId = await resolveCurrentId(id);

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, msg) => {
          if (err || !msg?.content || msg.content.type !== 'transfer') return reject(new Error('Not found'));
          const c = msg.content;
          resolve({
            id: tipId,
            from: c.from,
            to: c.to,
            concept: c.concept,
            amount: c.amount,
            createdAt: c.createdAt,
            deadline: c.deadline,
            confirmedBy: c.confirmedBy || [],
            status: c.status,
            tags: c.tags || [],
            opinions: c.opinions || {},
            opinions_inhabitants: c.opinions_inhabitants || []
          });
        });
      });
    },

    async createOpinion(id, category) {
      if (!categories.includes(category)) throw new Error('Invalid voting category');
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const tipId = await resolveCurrentId(id);

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, async (err, msg) => {
          if (err || !msg || msg.content?.type !== 'transfer') return reject(new Error('Transfer not found'));
          if (msg.content.opinions_inhabitants?.includes(userId)) return reject(new Error('Already voted'));

          const updated = {
            ...msg.content,
            opinions: {
              ...msg.content.opinions,
              [category]: (msg.content.opinions?.[category] || 0) + 1
            },
            opinions_inhabitants: [...(msg.content.opinions_inhabitants || []), userId],
            updatedAt: new Date().toISOString(),
            replaces: tipId
          };

          const tombstone = { type: 'tombstone', target: tipId, deletedAt: new Date().toISOString(), author: userId };
          await new Promise((res, rej) => ssbClient.publish(tombstone, e => e ? rej(e) : res()));

          ssbClient.publish(updated, (e2, result) => e2 ? reject(e2) : resolve(result));
        });
      });
    }
  };
};

