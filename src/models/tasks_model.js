const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  return {
    async createTask(title, description, startTime, endTime, priority, location = '', tagsRaw = [], isPublic) {
      const ssb = await openSsb();
      const userId = ssb.id;
      const start = moment(startTime);
      const end = moment(endTime);
      if (!start.isValid() || !end.isValid()) throw new Error('Invalid dates');
      if (start.isBefore(moment()) || end.isBefore(start)) throw new Error('Invalid time range');
      const tags = Array.isArray(tagsRaw) ? tagsRaw.filter(Boolean) : tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

      const content = {
        type: 'task',
        title,
        description,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        priority,
        location,
        tags,
        isPublic,
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
      const task = await new Promise((res, rej) => ssb.get(taskId, (err, task) => err ? rej(new Error('Task not found')) : res(task)));
      if (task.content.status === 'CLOSED') throw new Error('Cannot edit a closed task');
      const updated = { ...task.content, ...updatedData, updatedAt: new Date().toISOString(), replaces: taskId };
      const tombstone = { type: 'tombstone', target: taskId, deletedAt: new Date().toISOString(), author: userId };
      await new Promise((res, rej) => ssb.publish(tombstone, err => err ? rej(err) : res()));
      return new Promise((res, rej) => ssb.publish(updated, (err, result) => err ? rej(err) : res(result)));
    },

    async updateTaskStatus(taskId, status) {
      if (!['OPEN', 'IN-PROGRESS', 'CLOSED'].includes(status)) throw new Error('Invalid status');
      return this.updateTaskById(taskId, { status });
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
      if (idx !== -1) {
        assignees.splice(idx, 1);
      } else {
        assignees.push(userId);
      }
      return this.updateTaskById(taskId, { assignees });
    },

    async listAll() {
      const ssb = await openSsb();
      const now = moment();
      return new Promise((resolve, reject) => {
        pull(ssb.createLogStream(), pull.collect((err, results) => {
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
        }));
      });
    }
  };
};

