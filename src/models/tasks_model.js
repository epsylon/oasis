const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler }) => {
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
        author: userId
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

      const old = await new Promise((res, rej) =>
        ssb.get(taskId, (err, msg) => err || !msg ? rej(new Error('Task not found')) : res(msg))
      );

      const c = old.content;
      if (c.type !== 'task') throw new Error('Invalid type');

      const keys = Object.keys(updatedData || {}).filter(k => updatedData[k] !== undefined);
      const assigneesOnly = keys.length === 1 && keys[0] === 'assignees';

      const taskCreator = c.author || old.author;
      if (!assigneesOnly && taskCreator !== userId) throw new Error('Not the author');

      if (c.status === 'CLOSED') throw new Error('Cannot edit a closed task');

      let nextAssignees = Array.isArray(c.assignees) ? uniq(c.assignees) : [];

      if (assigneesOnly) {
        const proposed = uniq(updatedData.assignees);
        const oldNoSelf = uniq(nextAssignees.filter(x => x !== userId)).sort();
        const newNoSelf = uniq(proposed.filter(x => x !== userId)).sort();
        if (oldNoSelf.length !== newNoSelf.length || oldNoSelf.some((v, i) => v !== newNoSelf[i])) {
          throw new Error('Not allowed');
        }
        const hadSelf = nextAssignees.includes(userId);
        const hasSelfNow = proposed.includes(userId);
        if (hadSelf === hasSelfNow) throw new Error('Not allowed');
        nextAssignees = proposed;
      }

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
        assignees: assigneesOnly ? nextAssignees : (updatedData.assignees !== undefined ? uniq(updatedData.assignees) : nextAssignees),
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
      const task = await new Promise((res, rej) => ssb.get(taskId, (err, task) => err ? rej(new Error('Task not found')) : res(task)));
      const c = task.content;
      const status = c.status === 'OPEN' && moment(c.endTime).isBefore(now) ? 'CLOSED' : c.status;
      return { id: taskId, ...c, status };
    },

    async toggleAssignee(taskId) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const task = await this.getTaskById(taskId);
      if (task.status === 'CLOSED') throw new Error('Cannot assign users to a closed task');
      let assignees = Array.isArray(task.assignees) ? [...task.assignees] : [];
      const idx = assignees.indexOf(userId);
      if (idx !== -1) assignees.splice(idx, 1);
      else assignees.push(userId);
      return this.updateTaskById(taskId, { assignees });
    },

    async listAll() {
      const ssb = await openSsb();
      const now = moment();
      return new Promise((resolve, reject) => {
        pull(ssb.createLogStream({ limit: logLimit }),
          pull.collect((err, results) => {
            if (err) return reject(err);
            const tombstoned = new Set();
            const replaced = new Map();
            const tasks = new Map();

            for (const r of results) {
              const { key, value: { content: c } } = r;
              if (!c) continue;
              if (c.type === 'tombstone') tombstoned.add(c.target);
              if (c.type === 'task') {
                if (c.replaces) replaced.set(c.replaces, key);
                const status = c.status === 'OPEN' && moment(c.endTime).isBefore(now) ? 'CLOSED' : c.status;
                tasks.set(key, { id: key, ...c, status });
              }
            }

            tombstoned.forEach(id => tasks.delete(id));
            replaced.forEach((_, oldId) => tasks.delete(oldId));

            resolve([...tasks.values()]);
          })
        );
      });
    }
  };
};

