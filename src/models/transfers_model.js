const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  return {
    type: 'transfer',

    async createTransfer(to, concept, amount, deadline, tagsRaw = []) {
      const ssb = await openSsb();
      const userId = ssb.id;
      if (!/^@[A-Za-z0-9+\/]+= {0,2}\.ed25519$/.test(to)) throw new Error('Invalid recipient ID');
      const num = typeof amount === 'string' ? parseFloat(amount.replace(',', '.')) : amount;
      if (isNaN(num) || num <= 0) throw new Error('Amount must be positive');
      const dl = moment(deadline, moment.ISO_8601, true);
      if (!dl.isValid() || dl.isBefore(moment())) throw new Error('Deadline must be in the future');
      const tags = Array.isArray(tagsRaw) ? tagsRaw.filter(Boolean) : tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
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
        ssb.publish(content, (err, msg) => err ? reject(err) : resolve(msg));
      });
    },

    async updateTransferById(id, to, concept, amount, deadline, tagsRaw = []) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const old = await new Promise((res, rej) => ssb.get(id, (err, msg) => err || !msg?.content ? rej(err || new Error()) : res(msg)));
      if (Object.keys(old.content.opinions || {}).length > 0) throw new Error('Cannot edit transfer after it has received opinions.');
      if (old.content.from !== userId) throw new Error('Not the author');
      if (old.content.status !== 'UNCONFIRMED') throw new Error('Can only edit unconfirmed');

      const tomb = { type: 'tombstone', id, deletedAt: new Date().toISOString() };
      await new Promise((res, rej) => ssb.publish(tomb, err => err ? rej(err) : res()));

      if (!/^@[A-Za-z0-9+\/]+= {0,2}\.ed25519$/.test(to)) throw new Error('Invalid recipient ID');
      const num = typeof amount === 'string' ? parseFloat(amount.replace(',', '.')) : amount;
      if (isNaN(num) || num <= 0) throw new Error('Amount must be positive');
      const dl = moment(deadline, moment.ISO_8601, true);
      if (!dl.isValid() || dl.isBefore(moment())) throw new Error('Deadline must be in the future');
      const tags = Array.isArray(tagsRaw) ? tagsRaw.filter(Boolean) : tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      const isSelf = to === userId;
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
        replaces: id
      };
      return new Promise((resolve, reject) => {
        ssb.publish(updated, (err, msg) => err ? reject(err) : resolve(msg));
      });
    },

    async confirmTransferById(id) {
      const ssb = await openSsb();
      const userId = ssb.id;
      return new Promise((resolve, reject) => {
        ssb.get(id, async (err, msg) => {
          if (err || !msg?.content) return reject(new Error('Not found'));
          const t = msg.content;
          if (t.status !== 'UNCONFIRMED') return reject(new Error('Not unconfirmed'));
          if (t.to !== userId) return reject(new Error('Not the recipient'));

          const newConfirmed = [...t.confirmedBy, userId].filter((v, i, a) => a.indexOf(v) === i);
          const newStatus = newConfirmed.length >= 2 ? 'CLOSED' : 'UNCONFIRMED';
          const upd = { ...t, confirmedBy: newConfirmed, status: newStatus, updatedAt: new Date().toISOString(), replaces: id };
          const tombstone = { type: 'tombstone', id, deletedAt: new Date().toISOString() };
          await new Promise((res, rej) => ssb.publish(tombstone, (err) => err ? rej(err) : res()));
          ssb.publish(upd, (err, result) => err ? reject(err) : resolve(result));
        });
      });
    },

    async deleteTransferById(id) {
      const ssb = await openSsb();
      const userId = ssb.id;
      return new Promise((resolve, reject) => {
        ssb.get(id, (err, msg) => {
          if (err || !msg?.content) return reject(new Error('Not found'));
          const t = msg.content;
          if (t.from !== userId) return reject(new Error('Not the author'));
          if (t.status !== 'UNCONFIRMED' || t.confirmedBy.length >= 2) return reject(new Error('Not editable'));

          const tomb = { type: 'tombstone', id, deletedAt: new Date().toISOString() };
          ssb.publish(tomb, err => err ? reject(err) : resolve());
        });
      });
    },

	async listAll(filter = 'all') {
	  const ssb = await openSsb();
	  return new Promise((resolve, reject) => {
	    pull(
	      ssb.createLogStream({ limit: logLimit }),
	      pull.collect(async (err, results) => {
		if (err) return reject(err);
		const tombstoned = new Set();
		const replaces = new Map();
		const transfersById = new Map();
		const now = moment();

		for (const r of results) {
		  const c = r.value?.content;
		  const k = r.key;
		  if (!c) continue;
		  if (c.type === 'tombstone' && c.id) {
		    tombstoned.add(c.id);
		    continue;
		  }
		  if (c.type === 'transfer') {
		    if (tombstoned.has(k)) continue;
		    if (c.replaces) replaces.set(c.replaces, k);
		    transfersById.set(k, { id: k, ...c });
		  }
		}

		for (const replacedId of replaces.keys()) {
		  transfersById.delete(replacedId);
		}

		const deduped = Array.from(transfersById.values());

		for (const item of deduped) {
		  const dl = moment(item.deadline);
		  if (item.status === 'UNCONFIRMED' && dl.isBefore(now)) {
		    item.status = (item.confirmedBy || []).length >= 2 ? 'CLOSED' : 'DISCARDED';
		  }
		}

		resolve(deduped);
	      })
	    );
	  });
	},

    async getTransferById(id) {
      const ssb = await openSsb();
      return new Promise((resolve, reject) => {
        ssb.get(id, (err, msg) => {
          if (err || !msg?.content || msg.content.type === 'tombstone') return reject(new Error('Not found'));
          const c = msg.content;
          resolve({
            id,
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
      const ssb = await openSsb();
      const userId = ssb.id;
      return new Promise((resolve, reject) => {
        ssb.get(id, (err, msg) => {
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
            replaces: id
          };
          ssb.publish(updated, (err2, result) => err2 ? reject(err2) : resolve(result));
        });
      });
    }
  };
};

