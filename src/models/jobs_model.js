const pull = require('../server/node_modules/pull-stream')
const moment = require('../server/node_modules/moment')
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler }) => {
  let ssb
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open()
    return ssb
  }

  return {
    type: 'job',

    async createJob(jobData) {
      const ssbClient = await openSsb()
      let blobId = jobData.image
      if (blobId && /\(([^)]+)\)/.test(blobId)) blobId = blobId.match(/\(([^)]+)\)/)[1]
      const content = {
        type: 'job',
        ...jobData,
        image: blobId,
        author: ssbClient.id,
        createdAt: new Date().toISOString(),
        status: 'OPEN',
        subscribers: []
      }
      return new Promise((res, rej) => ssbClient.publish(content, (e, m) => e ? rej(e) : res(m)))
    },

    async updateJob(id, jobData) {
      const ssbClient = await openSsb()
      const job = await this.getJobById(id)
      if (job.author !== ssbClient.id) throw new Error('Unauthorized')
      let blobId = jobData.image || job.image
      if (blobId && /\(([^)]+)\)/.test(blobId)) blobId = blobId.match(/\(([^)]+)\)/)[1]
      const tomb = { type: 'tombstone', target: job.id, deletedAt: new Date().toISOString(), author: ssbClient.id }
      const updated = {
        type: 'job',
        ...job,
        ...jobData,
        image: blobId,
        updatedAt: new Date().toISOString(),
        replaces: job.id
      }
      await new Promise((res, rej) => ssbClient.publish(tomb, e => e ? rej(e) : res()))
      return new Promise((res, rej) => ssbClient.publish(updated, (e, m) => e ? rej(e) : res(m)))
    },

    async updateJobStatus(id, status) {
      return this.updateJob(id, { status })
    },

    async deleteJob(id) {
      const ssbClient = await openSsb();
      const latestId = await this.getJobTipId(id);
      const job = await this.getJobById(latestId);
      if (job.author !== ssbClient.id) throw new Error('Unauthorized');
      const tomb = {
        type: 'tombstone',
        target: latestId,
        deletedAt: new Date().toISOString(),
        author: ssbClient.id
      };
      return new Promise((res, rej) =>
        ssbClient.publish(tomb, (e, r) => e ? rej(e) : res(r))
      );
    },

    async listJobs(filter) {
      const ssbClient = await openSsb();
      const currentUserId = ssbClient.id;
      return new Promise((res, rej) => {
      pull(
      ssbClient.createLogStream({ limit: logLimit }),
      pull.collect((e, msgs) => {
        if (e) return rej(e);
        const tomb = new Set();
        const replaces = new Map();
        const referencedAsReplaces = new Set();
        const jobs = new Map();
        msgs.forEach(m => {
          const k = m.key;
          const c = m.value.content;
          if (!c) return;
          if (c.type === 'tombstone' && c.target) { tomb.add(c.target); return; }
          if (c.type !== 'job') return;
          if (c.replaces) { replaces.set(c.replaces, k); referencedAsReplaces.add(c.replaces); }
          jobs.set(k, { key: k, content: c });
        });
        const tipJobs = [];
        for (const [id, job] of jobs.entries()) {
          if (!referencedAsReplaces.has(id)) tipJobs.push(job);
        }
        const groups = {};
        for (const job of tipJobs) {
          const ancestor = job.content.replaces || job.key;
          if (!groups[ancestor]) groups[ancestor] = [];
          groups[ancestor].push(job);
        }

        const liveTipIds = new Set();
        for (const groupJobs of Object.values(groups)) {
          let best = groupJobs[0];
          for (const job of groupJobs) {
            if (
              job.content.status === 'CLOSED' ||
              (best.content.status !== 'CLOSED' &&
               new Date(job.content.updatedAt || job.content.createdAt || 0) >
               new Date(best.content.updatedAt || best.content.createdAt || 0))
            ) {
              best = job;
            }
          }
          liveTipIds.add(best.key);
        }
        let list = Array.from(jobs.values())
          .filter(j => liveTipIds.has(j.key) && !tomb.has(j.key))
          .map(j => ({ id: j.key, ...j.content }));
        const F = String(filter).toUpperCase();
        if (F === 'MINE')           list = list.filter(j => j.author === currentUserId);
        else if (F === 'REMOTE')    list = list.filter(j => (j.location||'').toUpperCase() === 'REMOTE');
        else if (F === 'PRESENCIAL')list = list.filter(j => (j.location||'').toUpperCase() === 'PRESENCIAL');
        else if (F === 'FREELANCER')list = list.filter(j => (j.job_type||'').toUpperCase() === 'FREELANCER');
        else if (F === 'EMPLOYEE')  list = list.filter(j => (j.job_type||'').toUpperCase() === 'EMPLOYEE');
        else if (F === 'OPEN')      list = list.filter(j => (j.status||'').toUpperCase() === 'OPEN');
        else if (F === 'CLOSED')    list = list.filter(j => (j.status||'').toUpperCase() === 'CLOSED');
        else if (F === 'RECENT')    list = list.filter(j => moment(j.createdAt).isAfter(moment().subtract(24, 'hours')));
        if (F === 'TOP') list.sort((a, b) => parseFloat(b.salary||0) - parseFloat(a.salary||0));
        else list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res(list);
        })
        );
      });
    },

    async getJobById(id) {
      const ssbClient = await openSsb();
      const all = await new Promise((r, j) => {
        pull(
            ssbClient.createLogStream({ limit: logLimit }),
            pull.collect((e, m) => e ? j(e) : r(m))
        )
      });
      const tomb = new Set();
      const replaces = new Map();
      all.forEach(m => {
        const c = m.value.content;
        if (!c) return;
        if (c.type === 'tombstone' && c.target) {
            tomb.add(c.target);
        } else if (c.type === 'job' && c.replaces) {
            replaces.set(c.replaces, m.key);
        }
      });
      let key = id;
      while (replaces.has(key)) key = replaces.get(key);
      if (tomb.has(key)) throw new Error('Job not found');
      const msg = await new Promise((r, j) => ssbClient.get(key, (e, m) => e ? j(e) : r(m)));
      if (!msg) throw new Error('Job not found');
      return { id: key, ...msg.content };
    },
    
    async getJobTipId(id) {
      const ssbClient = await openSsb();
      const all = await new Promise((r, j) => {
        pull(
            ssbClient.createLogStream({ limit: logLimit }),
            pull.collect((e, m) => e ? j(e) : r(m))
        )
    });
      const tomb = new Set();
      const replaces = new Map();
      all.forEach(m => {
        const c = m.value.content;
        if (!c) return;
        if (c.type === 'tombstone' && c.target) {
            tomb.add(c.target);
        } else if (c.type === 'job' && c.replaces) {
            replaces.set(c.replaces, m.key);
        }
    });
    let key = id;
    while (replaces.has(key)) key = replaces.get(key);
    if (tomb.has(key)) throw new Error('Job not found');
      return key;
    },

    async subscribeToJob(id, userId) {
      const latestId = await this.getJobTipId(id);
      const job = await this.getJobById(latestId);
      if (!job.subscribers) job.subscribers = [];
      if (job.subscribers.includes(userId)) throw new Error('Already subscribed');
      job.subscribers.push(userId);
      return this.updateJob(latestId, { subscribers: job.subscribers });
    },

    async unsubscribeFromJob(id, userId) {
      const latestId = await this.getJobTipId(id);
      const job = await this.getJobById(latestId);
      if (!job.subscribers) job.subscribers = [];
      if (!job.subscribers.includes(userId)) throw new Error('Not subscribed');
      job.subscribers = job.subscribers.filter(uid => uid !== userId);
      return this.updateJob(latestId, { subscribers: job.subscribers });
    }
    
  }
}
