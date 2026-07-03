const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { getConfig } = require('../configs/config-manager.js');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { dedupeBy, norm } = require('../backend/dedupe');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler, pmModel }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const uniq = (arr) => Array.from(new Set((Array.isArray(arr) ? arr : []).filter(x => typeof x === 'string' && x.trim().length)));

  const normalizeVisibility = (v) => {
    const vv = String(v || 'PUBLIC').toUpperCase();
    return (vv === 'PUBLIC' || vv === 'PRIVATE') ? vv : 'PUBLIC';
  };

  const normalizeStatus = (v, fallback) => {
    const vv = String(v || '').toUpperCase();
    if (vv === 'OPEN' || vv === 'IN-PROGRESS' || vv === 'CLOSED') return vv;
    return fallback;
  };

  const getAllMessages = async (ssbClient) =>
    new Promise((resolve, reject) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => (err ? reject(err) : resolve(msgs)))
      );
    });

  const getMsg = async (ssbClient, key) =>
    new Promise((resolve, reject) => {
      ssbClient.get(key, (err, msg) => (err ? reject(err) : resolve(msg)));
    });

  const buildIndex = (messages) => {
    const tomb = buildValidatedTombstoneSet(messages);
    const nodes = new Map();
    const parent = new Map();
    const child = new Map();
    const strictChild = new Map();
    const opinionMsgs = [];
    const assignMsgs = [];

    for (const m of messages) {
      const k = m.key;
      const v = m.value || {};
      const c = v.content;
      if (!c) continue;

      if (c.type === 'tombstone') continue;
      if (c.type === 'taskOpinion') { opinionMsgs.push({ target: c.target, author: v.author, category: c.category }); continue; }
      if (c.type === 'taskAssign') { assignMsgs.push({ target: c.target, author: v.author, on: c.on !== false, ts: v.timestamp || m.timestamp || 0 }); continue; }
      if (c.type !== 'task') continue;

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

    const opinionsByRoot = new Map();
    for (const op of opinionMsgs) { if (!nodes.has(op.target)) continue; const r = rootOf(op.target); if (!opinionsByRoot.has(r)) opinionsByRoot.set(r, []); opinionsByRoot.get(r).push(op); }

    const assignByRoot = new Map();
    for (const as of assignMsgs) { if (!nodes.has(as.target)) continue; const r = rootOf(as.target); if (!assignByRoot.has(r)) assignByRoot.set(r, new Map()); const m2 = assignByRoot.get(r); const p = m2.get(as.author); if (!p || as.ts >= p.ts) m2.set(as.author, { on: as.on, ts: as.ts }); }

    const resolveGroup = (root) => {
      const contentTip = contentTipOf(root);
      const contentNode = nodes.get(contentTip) || nodes.get(root);
      const ownerNode = nodes.get(root);
      const oc = ownerNode ? ownerNode.c : {};

      const opinions = { ...(oc.opinions || {}) };
      const voters = uniq(oc.opinions_inhabitants).slice();
      const voterSet = new Set(voters);
      for (const op of (opinionsByRoot.get(root) || [])) {
        if (voterSet.has(op.author)) continue;
        voterSet.add(op.author); voters.push(op.author);
        opinions[op.category] = (opinions[op.category] || 0) + 1;
      }

      const creator = ownerNode ? ownerNode.author : null;
      const asg = new Set(uniq(oc.assignees));
      if (creator) asg.add(creator);
      for (const [au, st] of (assignByRoot.get(root) || new Map())) { if (st.on) asg.add(au); else if (au !== creator) asg.delete(au); }
      const assignees = [...asg];

      return { contentTip, contentNode, opinions, voters, assignees };
    };

    const tipByRoot = new Map();
    for (const r of roots) tipByRoot.set(r, contentTipOf(r));

    return { tomb, nodes, parent, child, rootOf, tipByRoot, resolveGroup };
  };

  const buildTask = (node, rootId, agg, now) => {
    const c = node.c || {};
    const opinions = agg ? agg.opinions : (c.opinions || {});
    const voters = agg ? agg.voters : (Array.isArray(c.opinions_inhabitants) ? c.opinions_inhabitants : []);
    const assignees = agg ? agg.assignees : (Array.isArray(c.assignees) ? c.assignees : []);
    const status = c.status === 'OPEN' && moment(c.endTime).isBefore(now) ? 'CLOSED' : c.status;
    return {
      id: node.key,
      rootId,
      ...c,
      assignees,
      opinions,
      opinions_inhabitants: voters,
      status
    };
  };

  return {
    async createTask(title, description, startTime, endTime, priority, location = '', tagsRaw = [], isPublic) {
      const ssb = await openSsb();
      const userId = ssb.id;

      const start = moment(startTime);
      const end = moment(endTime);
      if (!start.isValid() || !end.isValid()) throw new Error('Invalid dates');

      const nowFloor = moment().startOf('minute');
      if (start.isBefore(nowFloor) || end.isBefore(start)) throw new Error('Invalid time range');

      const tags = Array.isArray(tagsRaw)
        ? tagsRaw.filter(Boolean)
        : String(tagsRaw || '').split(',').map(t => t.trim()).filter(Boolean);

      const visibility = normalizeVisibility(isPublic);

      const content = {
        type: 'task',
        title,
        description,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        priority,
        location,
        tags,
        isPublic: visibility,
        assignees: [userId],
        createdAt: new Date().toISOString(),
        status: 'OPEN',
        author: userId,
        opinions: {},
        opinions_inhabitants: []
      };

      return new Promise((res, rej) => ssb.publish(content, (err, msg) => err ? rej(err) : res(msg)));
    },

    async deleteTaskById(taskId) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const task = await new Promise((res, rej) => ssb.get(taskId, (err, task) => err ? rej(new Error('Task not found')) : res(task)));
      if (task.content.author !== userId) throw new Error('Not the author');
      const tombstone = { type: 'tombstone', target: taskId, deletedAt: new Date().toISOString(), author: userId };
      return new Promise((res, rej) => ssb.publish(tombstone, (err, result) => err ? rej(err) : res(result)));
    },

    async updateTaskById(taskId, updatedData) {
      const ssb = await openSsb();
      const userId = ssb.id;

      const keys = Object.keys(updatedData || {}).filter(k => updatedData[k] !== undefined);
      if (keys.length === 1 && keys[0] === 'assignees') return this.toggleAssignee(taskId);

      const old = await new Promise((res, rej) =>
        ssb.get(taskId, (err, msg) => err || !msg ? rej(new Error('Task not found')) : res(msg))
      );

      const c = old.content;
      if (c.type !== 'task') throw new Error('Invalid type');

      const taskCreator = c.author || old.author;
      if (taskCreator !== userId) throw new Error('Not the author');

      if (c.status === 'CLOSED') throw new Error('Cannot edit a closed task');

      const nextAssignees = Array.isArray(c.assignees) ? uniq(c.assignees) : [];

      let newStart = c.startTime;
      if (updatedData.startTime != null && updatedData.startTime !== '') {
        const m = moment(updatedData.startTime);
        if (!m.isValid()) throw new Error('Invalid startTime');
        newStart = m.toISOString();
      }

      let newEnd = c.endTime;
      if (updatedData.endTime != null && updatedData.endTime !== '') {
        const m = moment(updatedData.endTime);
        if (!m.isValid()) throw new Error('Invalid endTime');
        newEnd = m.toISOString();
      }

      if (moment(newEnd).isBefore(moment(newStart))) throw new Error('Invalid time range');

      let newTags = c.tags || [];
      if (updatedData.tags !== undefined) {
        if (Array.isArray(updatedData.tags)) newTags = updatedData.tags.filter(Boolean);
        else if (typeof updatedData.tags === 'string') newTags = updatedData.tags.split(',').map(t => t.trim()).filter(Boolean);
        else newTags = [];
      }

      let newVisibility = c.isPublic;
      if (updatedData.isPublic !== undefined) {
        newVisibility = normalizeVisibility(updatedData.isPublic);
      }

      let newStatus = c.status;
      if (updatedData.status !== undefined) {
        const normalized = normalizeStatus(updatedData.status, null);
        if (!normalized) throw new Error('Invalid status');
        newStatus = normalized;
      }

      const updated = {
        ...c,
        title: updatedData.title ?? c.title,
        description: updatedData.description ?? c.description,
        startTime: newStart,
        endTime: newEnd,
        priority: updatedData.priority ?? c.priority,
        location: updatedData.location ?? c.location,
        tags: newTags,
        isPublic: newVisibility,
        status: newStatus,
        assignees: nextAssignees,
        updatedAt: new Date().toISOString(),
        replaces: taskId
      };

      return new Promise((res, rej) => ssb.publish(updated, (err, result) => err ? rej(err) : res(result)));
    },

    async updateTaskStatus(taskId, status) {
      const normalized = String(status || '').toUpperCase();
      if (!['OPEN', 'IN-PROGRESS', 'CLOSED'].includes(normalized)) throw new Error('Invalid status');
      return this.updateTaskById(taskId, { status: normalized });
    },

    async getTaskById(taskId) {
      const ssb = await openSsb();
      const now = moment();
      const messages = await getAllMessages(ssb);
      const idx = buildIndex(messages);
      const rootId = idx.rootOf(taskId);
      const agg = idx.resolveGroup(rootId);
      if (!agg.contentNode || idx.tomb.has(agg.contentTip)) throw new Error('Task not found');
      return buildTask(agg.contentNode, rootId, agg, now);
    },

    async createOpinion(id, category) {
      const categories = require('../backend/opinion_categories');
      if (!categories.includes(category)) throw new Error('Invalid opinion category');
      const ssb = await openSsb();
      const userId = ssb.id;
      const task = await this.getTaskById(id);
      const voters = Array.isArray(task.opinions_inhabitants) ? task.opinions_inhabitants : [];
      if (voters.includes(userId)) throw new Error('Already opined');
      const content = { type: 'taskOpinion', target: task.rootId, category, createdAt: new Date().toISOString() };
      return new Promise((res, rej) => ssb.publish(content, (err, result) => err ? rej(err) : res(result)));
    },

    async toggleAssignee(taskId) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const task = await this.getTaskById(taskId);
      if (task.status === 'CLOSED') throw new Error('Cannot assign users to a closed task');
      const on = !(Array.isArray(task.assignees) && task.assignees.includes(userId));
      const content = { type: 'taskAssign', target: task.rootId, on, createdAt: new Date().toISOString() };
      return new Promise((res, rej) => ssb.publish(content, (err, result) => err ? rej(err) : res(result)));
    },

    async listAll() {
      const ssb = await openSsb();
      const now = moment();
      const messages = await getAllMessages(ssb);
      const idx = buildIndex(messages);

      const tasks = [];
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue;
        const node = idx.nodes.get(tipId);
        if (!node) continue;
        tasks.push(buildTask(node, rootId, idx.resolveGroup(rootId), now));
      }

      return dedupeBy(tasks, t => t.title ? [norm(t.author), norm(t.title), norm(t.startTime)].join('|') : null);
    },

    async checkDueReminders() {
      if (!pmModel) return;
      const ssbClient = await openSsb();
      const messages = await getAllMessages(ssbClient);
      const now = Date.now();
      const sent = new Set();
      for (const m of messages) {
        const c = m.value && m.value.content;
        if (!c) continue;
        if (c.type === 'taskReminderSent' && c.target) { sent.add(c.target); continue; }
      }
      const idx = buildIndex(messages);
      const tasks = [];
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue;
        const node = idx.nodes.get(tipId);
        if (!node) continue;
        tasks.push(buildTask(node, rootId, idx.resolveGroup(rootId)));
      }
      const publishMarker = (target) => new Promise((resolve, reject) => {
        ssbClient.publish({ type: 'taskReminderSent', target, sentAt: new Date().toISOString() }, err => err ? reject(err) : resolve());
      });
      for (const t of tasks) {
        if (sent.has(t.id)) continue;
        const status = String(t.status || '').toUpperCase();
        if (status !== 'OPEN') continue;
        const endTime = t.endTime || t.deadline;
        if (!endTime) continue;
        const endTs = new Date(endTime).getTime();
        if (!endTs || endTs > now) continue;
        const assignees = Array.isArray(t.assignees) ? t.assignees.filter(a => typeof a === 'string' && a.length > 0) : [];
        if (assignees.length === 0) continue;
        const subject = `Task Reminder: ${t.title || 'Task'}`;
        const text =
          `Task: ${t.title || ''}\n` +
          (t.description ? `Description: ${t.description}\n` : '') +
          `Deadline: ${endTime}\n` +
          (t.priority ? `Priority: ${t.priority}\n` : '') +
          `\nVisit Task: /tasks/${t.id}`;
        try {
          const chunkSize = 6;
          for (let i = 0; i < assignees.length; i += chunkSize) {
            await pmModel.sendMessage(assignees.slice(i, i + chunkSize), subject, text);
          }
          await publishMarker(t.id);
        } catch (_) {}
      }
    }
  };
};
