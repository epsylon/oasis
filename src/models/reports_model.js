const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { dedupeBy, norm } = require('../backend/dedupe');
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

  const getAllMessages = async (ssbClient) =>
    new Promise((resolve, reject) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
      );
    });

  const buildIndex = (messages) => {
    const tomb = buildValidatedTombstoneSet(messages);
    const nodes = new Map();
    const parent = new Map();
    const child = new Map();
    const strictChild = new Map();
    const confirms = [];
    const opinionMsgs = [];

    for (const m of messages) {
      const k = m.key;
      const v = m.value || {};
      const c = v.content;
      if (!c) continue;

      if (c.type === 'tombstone') continue;
      if (c.type === 'reportConfirm') { confirms.push({ target: c.target, author: v.author }); continue; }
      if (c.type === 'reportOpinion') { opinionMsgs.push({ target: c.target, author: v.author, category: c.category }); continue; }
      if (c.type !== 'report') continue;

      const ts = v.timestamp || m.timestamp || 0;
      nodes.set(k, { key: k, ts, c, author: v.author });

      if (c.replaces) {
        parent.set(k, c.replaces);
        child.set(c.replaces, k);
      }
    }

    for (const [k, node] of nodes) {
      const t = node.c.replaces;
      if (t) { const orig = nodes.get(t); if (orig && orig.author === node.author) strictChild.set(t, k); }
    }

    const rootOf = (id) => {
      let cur = id, g = 0;
      while (parent.has(cur) && nodes.has(parent.get(cur)) && g++ < 100000) cur = parent.get(cur);
      return cur;
    };

    const contentTipOf = (root) => {
      let cur = root, g = 0;
      while (strictChild.has(cur) && g++ < 100000) cur = strictChild.get(cur);
      const n = nodes.get(cur), rn = nodes.get(root);
      return (n && rn && n.author === rn.author) ? cur : root;
    };

    const roots = new Set();
    for (const id of nodes.keys()) roots.add(rootOf(id));

    const confirmsByRoot = new Map(), opinionsByRoot = new Map();
    for (const cf of confirms) { if (!nodes.has(cf.target)) continue; const r = rootOf(cf.target); if (!confirmsByRoot.has(r)) confirmsByRoot.set(r, []); confirmsByRoot.get(r).push(cf); }
    for (const op of opinionMsgs) { if (!nodes.has(op.target)) continue; const r = rootOf(op.target); if (!opinionsByRoot.has(r)) opinionsByRoot.set(r, []); opinionsByRoot.get(r).push(op); }

    const tipByRoot = new Map();
    for (const r of roots) tipByRoot.set(r, contentTipOf(r));

    const resolveGroup = (root) => {
      const contentTip = contentTipOf(root);
      const contentNode = nodes.get(contentTip) || nodes.get(root);
      if (!contentNode) return null;
      const rootAuthor = nodes.get(root) ? nodes.get(root).author : null;
      const lc = contentNode.c || {};

      const opinions = { ...(lc.opinions || {}) };
      const voterSet = new Set(ensureArray(lc.opinions_inhabitants));
      const confirmSet = new Set(ensureArray(lc.confirmations));

      const groupKeys = []; { let x = root, g = 0; groupKeys.push(x); while (child.has(x) && g++ < 100000) { x = child.get(x); groupKeys.push(x); } }
      for (const k of groupKeys) {
        const n = nodes.get(k); if (!n) continue; if (n.author !== rootAuthor) continue; const c = n.c || {};
        for (const cb of ensureArray(c.confirmations)) confirmSet.add(cb);
        for (const vv of ensureArray(c.opinions_inhabitants)) voterSet.add(vv);
        if (c.opinions && typeof c.opinions === 'object') for (const kk of Object.keys(c.opinions)) opinions[kk] = Math.max(opinions[kk] || 0, Number(c.opinions[kk]) || 0);
      }

      for (const op of (opinionsByRoot.get(root) || [])) {
        if (voterSet.has(op.author)) continue;
        voterSet.add(op.author);
        opinions[op.category] = (opinions[op.category] || 0) + 1;
      }
      for (const cf of (confirmsByRoot.get(root) || [])) confirmSet.add(cf.author);

      return {
        contentTip,
        contentNode,
        opinions,
        opinions_inhabitants: [...voterSet],
        confirmations: [...confirmSet],
        tombstoned: tomb.has(contentTip)
      };
    };

    return { tomb, nodes, parent, child, rootOf, tipByRoot, resolveGroup };
  };

  const buildReport = (node, agg) => {
    const c = node.c || {};
    const cat = normU(c.category);
    const opinions = agg ? agg.opinions : (c.opinions || {});
    const voters = agg ? agg.opinions_inhabitants : ensureArray(c.opinions_inhabitants);
    const confirmations = agg ? agg.confirmations : ensureArray(c.confirmations);
    return {
      id: node.key,
      ...c,
      category: cat,
      status: normalizeStatus(c.status || 'OPEN'),
      severity: normalizeSeverity(c.severity) || 'low',
      confirmations,
      tags: ensureArray(c.tags),
      template: normalizeTemplate(cat, c.template || {}),
      opinions,
      opinions_inhabitants: voters
    };
  };

  return {
    async createReport(title, description, category, image, tagsRaw = [], severity = 'low', template = {}) {
      const ssb = await openSsb();
      const userId = ssb.id;

      let blobId = null;
      if (image) {
        blobId = String(image).trim() || null;
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
        template: normalizeTemplate(cat, template),
        opinions: {},
        opinions_inhabitants: []
      };

      return new Promise((res, rej) => ssb.publish(content, (err, msg) => err ? rej(err) : res(msg)));
    },

    async updateReportById(id, updatedContent) {
      const ssb = await openSsb();
      const userId = ssb.id;

      const messages = await getAllMessages(ssb);
      const idx = buildIndex(messages);
      const root = idx.rootOf(id);
      const agg = idx.resolveGroup(root);
      if (!agg || agg.tombstoned) throw new Error('Report not found');

      const report = { content: agg.contentNode.c };
      const tipId = agg.contentTip;

      if (agg.contentNode.author !== userId) throw new Error('Not the author');

      const tags = Object.prototype.hasOwnProperty.call(updatedContent, 'tags')
        ? String(updatedContent.tags || '').split(',').map(t => t.trim()).filter(Boolean)
        : ensureArray(report.content.tags);

      let blobId = report.content.image || null;
      if (updatedContent.image) {
        blobId = String(updatedContent.image).trim() || null;
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

      const confirmations = ensureArray(agg.confirmations);

      const baseTemplate = Object.prototype.hasOwnProperty.call(updatedContent, 'template')
        ? updatedContent.template
        : (report.content.template || {});

      const nextTemplate = normalizeTemplate(nextCategory, baseTemplate);

      const updated = {
        ...report.content,
        ...updatedContent,
        type: 'report',
        replaces: tipId,
        image: blobId,
        tags,
        confirmations,
        opinions: agg.opinions,
        opinions_inhabitants: agg.opinions_inhabitants,
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

      const messages = await getAllMessages(ssb);
      const idx = buildIndex(messages);
      const root = idx.rootOf(id);
      const agg = idx.resolveGroup(root);
      if (!agg || agg.tombstoned) throw new Error('Report not found');

      if (agg.contentNode.author !== userId) throw new Error('Not the author');

      const tombstone = { type: 'tombstone', target: agg.contentTip, deletedAt: new Date().toISOString(), author: userId };
      return new Promise((res, rej) => ssb.publish(tombstone, (err, result) => err ? rej(err) : res(result)));
    },

    async getReportById(id) {
      const ssb = await openSsb();

      const messages = await getAllMessages(ssb);
      const idx = buildIndex(messages);
      const root = idx.rootOf(id);
      const agg = idx.resolveGroup(root);
      if (!agg || agg.tombstoned) throw new Error('Report not found');

      return buildReport(agg.contentNode, agg);
    },

    async confirmReportById(id) {
      const ssb = await openSsb();
      const userId = ssb.id;

      const messages = await getAllMessages(ssb);
      const idx = buildIndex(messages);
      const root = idx.rootOf(id);
      const agg = idx.resolveGroup(root);
      if (!agg || agg.tombstoned) throw new Error('Report not found');

      if (agg.contentNode.author === userId) throw new Error('Cannot confirm own report');
      if (ensureArray(agg.confirmations).includes(userId)) throw new Error('Already confirmed');

      const content = { type: 'reportConfirm', target: root, createdAt: new Date().toISOString() };
      return new Promise((res, rej) => ssb.publish(content, (err, result) => err ? rej(err) : res(result)));
    },

    async createOpinion(id, category) {
      const categories = require('../backend/opinion_categories');
      if (!categories.includes(category)) throw new Error('Invalid opinion category');
      const ssb = await openSsb();
      const userId = ssb.id;

      const messages = await getAllMessages(ssb);
      const idx = buildIndex(messages);
      const root = idx.rootOf(id);
      const agg = idx.resolveGroup(root);
      if (!agg || agg.tombstoned) throw new Error('Report not found');
      if (ensureArray(agg.opinions_inhabitants).includes(userId)) throw new Error('Already opined');

      const content = { type: 'reportOpinion', target: root, category, createdAt: new Date().toISOString() };
      return new Promise((res, rej) => ssb.publish(content, (err, result) => err ? rej(err) : res(result)));
    },

    async listAll() {
      const ssb = await openSsb();
      const messages = await getAllMessages(ssb);
      const idx = buildIndex(messages);

      const reports = [];
      for (const root of idx.tipByRoot.keys()) {
        const agg = idx.resolveGroup(root);
        if (!agg || agg.tombstoned) continue;
        reports.push(buildReport(agg.contentNode, agg));
      }

      return dedupeBy(reports, x => x.title ? [norm(x.author), norm(x.title), norm(x.category)].join('|') : null);
    }
  };
};
