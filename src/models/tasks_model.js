const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  return {
    type: 'task',

    async createTask(title, description, startTime, endTime, priority, location = '', tagsRaw = [], isPublic) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const start = moment(startTime);
      const end = moment(endTime);
      if (!start.isValid()) throw new Error('Invalid starting date');
      if (!end.isValid()) throw new Error('Invalid ending date');
      if (start.isBefore(moment())) throw new Error('Start time is in the past');
      if (end.isBefore(start)) throw new Error('End time is before start time');
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
        author: userId,
        opinions: {},
        opinions_inhabitants: []
      };
      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res));
      });
    },

    async toggleAssignee(taskId) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const task = await this.getTaskById(taskId);
      let assignees = Array.isArray(task.assignees) ? [...task.assignees] : [];
      if (task.status === 'CLOSED') throw new Error('Cannot assign users to a closed task');
      const idx = assignees.indexOf(userId);
      if (idx !== -1) {
        assignees.splice(idx, 1);
      } else {
        assignees.push(userId);
      }
      return this.updateTaskById(taskId, { assignees });
    },

    async updateTaskStatus(taskId, status) {
      if (!['OPEN', 'IN-PROGRESS', 'CLOSED'].includes(status)) throw new Error('Invalid status');
      return this.updateTaskById(taskId, { status });
    },

    async deleteTaskById(taskId) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      return new Promise((resolve, reject) => {
        ssbClient.get(taskId, (err, task) => {
          if (err || !task || !task.content) return reject(new Error('Task not found'));
          if (task.content.author !== userId) return reject(new Error('Only the author can delete the task'));
          const tombstone = {
            type: 'tombstone',
            target: taskId,
            deletedAt: new Date().toISOString(),
            author: userId
          };
          ssbClient.publish(tombstone, (pubErr, res) => pubErr ? reject(pubErr) : resolve(res));
        });
      });
    },

  async updateTaskById(taskId, updatedData) {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;

    return new Promise((resolve, reject) => {
      ssbClient.get(taskId, (err, task) => {
        if (err || !task || !task.content) return reject(new Error('Task not found'));
        if (Object.keys(task.content.opinions || {}).length > 0) return reject(new Error('Cannot edit task after it has received opinions.'));
        if (task.content.status === 'CLOSED') return reject(new Error('Cannot edit a closed task.'));
        if (updatedData.tags) {
          updatedData.tags = Array.isArray(updatedData.tags) ? updatedData.tags : updatedData.tags.split(',').map(tag => tag.trim());
        }

        const tombstone = {
          type: 'tombstone',
          target: taskId,
          deletedAt: new Date().toISOString(),
          author: userId
        };

        const updated = {
          ...task.content,
          ...updatedData,
          updatedAt: new Date().toISOString(),
          replaces: taskId
        };

        ssbClient.publish(tombstone, (err) => {
          if (err) return reject(err);
          ssbClient.publish(updated, (err2, result) => err2 ? reject(err2) : resolve(result));
        });
      });
    });
  },

    async getTaskById(taskId) {
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        ssbClient.get(taskId, (err, task) => {
          if (err || !task || !task.content || task.content.type === 'tombstone') return reject(new Error('Task not found'));
          const c = task.content;
          resolve({
            id: taskId,
            title: c.title,
            description: c.description,
            startTime: c.startTime,
            endTime: c.endTime,
            priority: c.priority,
            location: c.location,
            tags: Array.isArray(c.tags) ? c.tags : [],
            isPublic: c.isPublic,
            assignees: Array.isArray(c.assignees) ? c.assignees : [],
            createdAt: c.createdAt,
            status: c.status || 'OPEN',
            author: c.author,
            opinions: c.opinions || {},
            opinions_inhabitants: c.opinions_inhabitants || []
          });
        });
      });
    },

    async listAll(filter = 'all') {
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        pull(
          ssbClient.createLogStream(),
          pull.collect((err, results) => {
            if (err) return reject(err);
            const tombstoned = new Set();
            const replaces = new Map();
            const byId = new Map();
            for (const msg of results) {
              const k = msg.key;
              const c = msg.value.content;
              if (!c) continue;
              if (c.type === 'tombstone' && c.target) {
                tombstoned.add(c.target);
                continue;
              }
              if (c.type === 'task') {
                if (tombstoned.has(k)) continue;
                if (c.replaces) replaces.set(c.replaces, k);
                byId.set(k, {
                  id: k,
                  title: c.title,
                  description: c.description,
                  startTime: c.startTime,
                  endTime: c.endTime,
                  priority: c.priority,
                  location: c.location,
                  tags: Array.isArray(c.tags) ? c.tags : [],
                  isPublic: c.isPublic,
                  assignees: Array.isArray(c.assignees) ? c.assignees : [],
                  createdAt: c.createdAt,
                  status: c.status || 'OPEN',
                  author: c.author,
                  opinions: c.opinions || {},
                  opinions_inhabitants: c.opinions_inhabitants || []
                });
              }
            }
            for (const replaced of replaces.keys()) {
              byId.delete(replaced);
            }
            resolve(Array.from(byId.values()));
          })
        );
      });
    },

    async createOpinion(id, category) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      return new Promise((resolve, reject) => {
        ssbClient.get(id, (err, msg) => {
          if (err || !msg || msg.content?.type !== 'task') return reject(new Error('Task not found'));
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
          ssbClient.publish(tombstone, (err) => {
            if (err) return reject(err);
            ssbClient.publish(updated, (err2, result) => err2 ? reject(err2) : resolve(result));
          });
        });
      });
    }
  };
};

