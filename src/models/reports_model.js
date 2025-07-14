const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  return {
    async createReport(title, description, category, image, tagsRaw = [], severity = 'low') {
      const ssb = await openSsb();
      const userId = ssb.id;
      let blobId = null;
      if (image) {
        const match = image.match(/\(([^)]+)\)/);
        blobId = match ? match[1] : image;
      }
      const tags = Array.isArray(tagsRaw)
        ? tagsRaw.filter(Boolean)
        : tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

      const content = {
        type: 'report',
        title,
        description,
        category,
        createdAt: new Date().toISOString(),
        author: userId,
        image: blobId,
        tags,
        confirmations: [],
        severity,
        status: 'OPEN'
      };

      return new Promise((res, rej) => ssb.publish(content, (err, msg) => err ? rej(err) : res(msg)));
    },

    async updateReportById(id, updatedContent) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const report = await new Promise((res, rej) => ssb.get(id, (err, report) => err ? rej(new Error('Report not found')) : res(report)));
      if (report.content.author !== userId) throw new Error('Not the author');

      const tags = updatedContent.tags
        ? updatedContent.tags.split(',').map(t => t.trim()).filter(Boolean)
        : report.content.tags;

      let blobId = report.content.image;
      if (updatedContent.image) {
        const match = updatedContent.image.match(/\(([^)]+)\)/);
        blobId = match ? match[1] : updatedContent.image;
      }

      const updated = {
        ...report.content,
        ...updatedContent,
        type: 'report',
        replaces: id,
        image: blobId,
        tags,
        updatedAt: new Date().toISOString(),
        author: report.content.author
      };

      return new Promise((res, rej) => ssb.publish(updated, (err, result) => err ? rej(err) : res(result)));
    },

    async deleteReportById(id) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const report = await new Promise((res, rej) => ssb.get(id, (err, report) => err ? rej(new Error('Report not found')) : res(report)));
      if (report.content.author !== userId) throw new Error('Not the author');
      const tombstone = { type: 'tombstone', target: id, deletedAt: new Date().toISOString(), author: userId };
      return new Promise((res, rej) => ssb.publish(tombstone, (err, result) => err ? rej(err) : res(result)));
    },

    async getReportById(id) {
      const ssb = await openSsb();
      const report = await new Promise((res, rej) => ssb.get(id, (err, report) => err ? rej(new Error('Report not found')) : res(report)));
      const c = report.content;
      return { id, ...c };
    },

    async confirmReportById(id) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const report = await new Promise((res, rej) => ssb.get(id, (err, report) => err ? rej(new Error('Report not found')) : res(report)));
      if (report.content.confirmations.includes(userId)) throw new Error('Already confirmed');
      const updated = {
        ...report.content,
        replaces: id,
        confirmations: [...report.content.confirmations, userId],
        updatedAt: new Date().toISOString()
      };
      return new Promise((res, rej) => ssb.publish(updated, (err, result) => err ? rej(err) : res(result)));
    },

    async listAll() {
      const ssb = await openSsb();
      return new Promise((resolve, reject) => {
        pull(ssb.createLogStream(), pull.collect((err, results) => {
          if (err) return reject(err);
          const tombstoned = new Set();
          const replaced = new Map();
          const reports = new Map();

          for (const r of results) {
            const { key, value: { content: c } } = r;
            if (!c) continue;
            if (c.type === 'tombstone') tombstoned.add(c.target);
            if (c.type === 'report') {
              if (c.replaces) replaced.set(c.replaces, key);
              reports.set(key, { id: key, ...c });
            }
          }

          tombstoned.forEach(id => reports.delete(id));
          replaced.forEach((_, oldId) => reports.delete(oldId));

          resolve([...reports.values()]);
        }));
      });
    }
  };
};
