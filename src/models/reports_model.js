const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const normU = (v) => String(v || '').trim().toUpperCase();
const normalizeStatus = (v) => normU(v).replace(/\s+/g, '_').replace(/-+/g, '_');
const normalizeSeverity = (v) => String(v || '').trim().toLowerCase();
const ensureArray = (v) => Array.isArray(v) ? v.filter(Boolean) : [];

const trimStr = (v) => String(v || '').trim();

const normalizeTemplate = (category, tpl) => {
  const cat = normU(category);
  const t = tpl && typeof tpl === 'object' ? tpl : {};

  const pick = (keys) => {
    const out = {};
    for (const k of keys) {
      const val = trimStr(t[k]);
      if (val) out[k] = val;
    }
    return out;
  };

  if (cat === 'BUGS') {
    const out = pick(['stepsToReproduce', 'expectedBehavior', 'actualBehavior', 'environment', 'reproduceRate']);
    if (out.reproduceRate) out.reproduceRate = normU(out.reproduceRate);
    return out;
  }

  if (cat === 'FEATURES') {
    return pick(['problemStatement', 'userStory', 'acceptanceCriteria']);
  }

  if (cat === 'ABUSE') {
    return pick(['whatHappened', 'reportedUser', 'evidenceLinks']);
  }

  if (cat === 'CONTENT') {
    return pick(['contentLocation', 'whyInappropriate', 'requestedAction', 'evidenceLinks']);
  }

  return {};
};

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  return {
    async createReport(title, description, category, image, tagsRaw = [], severity = 'low', template = {}) {
      const ssb = await openSsb();
      const userId = ssb.id;

      let blobId = null;
      if (image) {
        const match = String(image).match(/\(([^)]+)\)/);
        blobId = match ? match[1] : image;
      }

      const tags = Array.isArray(tagsRaw)
        ? tagsRaw.filter(Boolean)
        : String(tagsRaw || '').split(',').map(t => t.trim()).filter(Boolean);

      const cat = normU(category);
      const content = {
        type: 'report',
        title,
        description,
        category: cat,
        createdAt: new Date().toISOString(),
        author: userId,
        image: blobId,
        tags,
        confirmations: [],
        severity: normalizeSeverity(severity) || 'low',
        status: 'OPEN',
        template: normalizeTemplate(cat, template)
      };

      return new Promise((res, rej) => ssb.publish(content, (err, msg) => err ? rej(err) : res(msg)));
    },

    async updateReportById(id, updatedContent) {
      const ssb = await openSsb();
      const userId = ssb.id;

      const report = await new Promise((res, rej) =>
        ssb.get(id, (err, r) => err ? rej(new Error('Report not found')) : res(r))
      );

      if (report.content.author !== userId) throw new Error('Not the author');

      const tags = Object.prototype.hasOwnProperty.call(updatedContent, 'tags')
        ? String(updatedContent.tags || '').split(',').map(t => t.trim()).filter(Boolean)
        : ensureArray(report.content.tags);

      let blobId = report.content.image || null;
      if (updatedContent.image) {
        const match = String(updatedContent.image).match(/\(([^)]+)\)/);
        blobId = match ? match[1] : updatedContent.image;
      }

      const nextStatus = Object.prototype.hasOwnProperty.call(updatedContent, 'status')
        ? normalizeStatus(updatedContent.status)
        : normalizeStatus(report.content.status || 'OPEN');

      const nextSeverity = Object.prototype.hasOwnProperty.call(updatedContent, 'severity')
        ? (normalizeSeverity(updatedContent.severity) || 'low')
        : (normalizeSeverity(report.content.severity) || 'low');

      const nextCategory = Object.prototype.hasOwnProperty.call(updatedContent, 'category')
        ? normU(updatedContent.category)
        : normU(report.content.category);

      const confirmations = ensureArray(report.content.confirmations);

      const baseTemplate = Object.prototype.hasOwnProperty.call(updatedContent, 'template')
        ? updatedContent.template
        : (report.content.template || {});

      const nextTemplate = normalizeTemplate(nextCategory, baseTemplate);

      const updated = {
        ...report.content,
        ...updatedContent,
        type: 'report',
        replaces: id,
        image: blobId,
        tags,
        confirmations,
        severity: nextSeverity,
        status: nextStatus,
        category: nextCategory,
        template: nextTemplate,
        updatedAt: new Date().toISOString(),
        author: report.content.author
      };

      return new Promise((res, rej) => ssb.publish(updated, (err, result) => err ? rej(err) : res(result)));
    },

    async deleteReportById(id) {
      const ssb = await openSsb();
      const userId = ssb.id;

      const report = await new Promise((res, rej) =>
        ssb.get(id, (err, r) => err ? rej(new Error('Report not found')) : res(r))
      );

      if (report.content.author !== userId) throw new Error('Not the author');

      const tombstone = { type: 'tombstone', target: id, deletedAt: new Date().toISOString(), author: userId };
      return new Promise((res, rej) => ssb.publish(tombstone, (err, result) => err ? rej(err) : res(result)));
    },

    async getReportById(id) {
      const ssb = await openSsb();

      const report = await new Promise((res, rej) =>
        ssb.get(id, (err, r) => err ? rej(new Error('Report not found')) : res(r))
      );

      const c = report.content || {};
      const cat = normU(c.category);
      return {
        id,
        ...c,
        category: cat,
        status: normalizeStatus(c.status || 'OPEN'),
        severity: normalizeSeverity(c.severity) || 'low',
        confirmations: ensureArray(c.confirmations),
        tags: ensureArray(c.tags),
        template: normalizeTemplate(cat, c.template || {})
      };
    },

    async confirmReportById(id) {
      const ssb = await openSsb();
      const userId = ssb.id;

      const report = await new Promise((res, rej) =>
        ssb.get(id, (err, r) => err ? rej(new Error('Report not found')) : res(r))
      );

      const confirmations = ensureArray(report.content.confirmations);
      if (confirmations.includes(userId)) throw new Error('Already confirmed');

      const cat = normU(report.content.category);
      const updated = {
        ...report.content,
        type: 'report',
        replaces: id,
        confirmations: [...confirmations, userId],
        updatedAt: new Date().toISOString(),
        status: normalizeStatus(report.content.status || 'OPEN'),
        category: cat,
        severity: normalizeSeverity(report.content.severity) || 'low',
        template: normalizeTemplate(cat, report.content.template || {})
      };

      return new Promise((res, rej) => ssb.publish(updated, (err, result) => err ? rej(err) : res(result)));
    },

    async listAll() {
      const ssb = await openSsb();

      return new Promise((resolve, reject) => {
        pull(
          ssb.createLogStream({ limit: logLimit }),
          pull.collect((err, results) => {
            if (err) return reject(err);

            const tombstoned = new Set();
            const replaced = new Map();
            const reports = new Map();

            for (const r of results) {
              const key = r && r.key;
              const c = r && r.value && r.value.content ? r.value.content : null;
              if (!key || !c) continue;

              if (c.type === 'tombstone' && c.target) tombstoned.add(c.target);

              if (c.type === 'report') {
                if (c.replaces) replaced.set(c.replaces, key);

                const cat = normU(c.category);
                reports.set(key, {
                  id: key,
                  ...c,
                  category: cat,
                  status: normalizeStatus(c.status || 'OPEN'),
                  severity: normalizeSeverity(c.severity) || 'low',
                  confirmations: ensureArray(c.confirmations),
                  tags: ensureArray(c.tags),
                  template: normalizeTemplate(cat, c.template || {})
                });
              }
            }

            tombstoned.forEach(id => reports.delete(id));
            replaced.forEach((_, oldId) => reports.delete(oldId));

            resolve([...reports.values()]);
          })
        );
      });
    }
  };
};

