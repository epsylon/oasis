const fs = require('fs');
const path = require('path');
const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');

const agendaConfigPath = path.join(__dirname, '../configs/agenda-config.json');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

function readAgendaConfig() {
  if (!fs.existsSync(agendaConfigPath)) {
    fs.writeFileSync(agendaConfigPath, JSON.stringify({ discardedItems: [] }));
  }
  return JSON.parse(fs.readFileSync(agendaConfigPath));
}

function writeAgendaConfig(cfg) {
  fs.writeFileSync(agendaConfigPath, JSON.stringify(cfg, null, 2));
}

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const STATUS_ORDER = ['FOR SALE', 'OPEN', 'RESERVED', 'CLOSED', 'SOLD'];
  const sIdx = s => STATUS_ORDER.indexOf(String(s || '').toUpperCase());

  const fetchItems = (targetType) =>
    new Promise((resolve, reject) => {
      openSsb().then((ssbClient) => {
        pull(
          ssbClient.createLogStream({ limit: logLimit }),
          pull.collect((err, msgs) => {
            if (err) return reject(err);

            const tomb = new Set();
            const nodes = new Map();
            const parent = new Map();
            const child = new Map();

            for (const m of msgs) {
              const k = m.key;
              const v = m.value;
              const c = v?.content;
              if (!c) continue;
              if (c.type === 'tombstone' && c.target) { tomb.add(c.target); continue; }
              if (c.type !== targetType) continue;
              nodes.set(k, { key: k, ts: v.timestamp || 0, content: c });
              if (c.replaces) { parent.set(k, c.replaces); child.set(c.replaces, k); }
            }

            const rootOf = (id) => { let cur = id; while (parent.has(cur)) cur = parent.get(cur); return cur; };

            const groups = new Map();
            for (const id of nodes.keys()) {
              const r = rootOf(id);
              if (!groups.has(r)) groups.set(r, new Set());
              groups.get(r).add(id);
            }

            const statusOrder = ['FOR SALE', 'OPEN', 'RESERVED', 'CLOSED', 'SOLD'];
            const sIdx = s => statusOrder.indexOf(String(s || '').toUpperCase());

            const out = [];

            for (const [root, ids] of groups.entries()) {
              const items = Array.from(ids).map(id => nodes.get(id)).filter(n => n && !tomb.has(n.key));
              if (!items.length) continue;

              let tipId = Array.from(ids).find(id => !child.has(id));
              let tip = tipId ? nodes.get(tipId) : items.reduce((a, b) => a.ts > b.ts ? a : b);

              if (targetType === 'market') {
                let chosen = items[0];
                for (const n of items) {
                  const a = sIdx(n.content.status);
                  const b = sIdx(chosen.content.status);
                  if (a > b || (a === b && n.ts > chosen.ts)) chosen = n;
                }
                const c = chosen.content;
                let status = c.status;
                if (c.deadline) {
                  const dl = moment(c.deadline);
                  if (dl.isValid() && dl.isBefore(moment()) && String(status).toUpperCase() !== 'SOLD') status = 'DISCARDED';
                }
                if (status === 'FOR SALE' && (c.stock || 0) === 0) continue;

                out.push({
                  ...c,
                  status,
                  id: chosen.key,
                  tipId: chosen.key,
                  createdAt: c.createdAt || chosen.ts
                });
                continue;
              }

              if (targetType === 'job') {
                const latest = items.sort((a, b) => b.ts - a.ts)[0];
                const withSubsNode = items
                  .filter(n => Array.isArray(n.content.subscribers))
                  .sort((a, b) => b.ts - a.ts)[0];
                const subscribers = withSubsNode ? withSubsNode.content.subscribers : [];
                const latestWithStatus = items
                  .filter(n => typeof n.content.status !== 'undefined')
                  .sort((a, b) => b.ts - a.ts)[0];
                const resolvedStatus = latestWithStatus
                  ? latestWithStatus.content.status
                  : latest.content.status;

                const c = { ...latest.content, status: resolvedStatus, subscribers };

                out.push({
                  ...c,
                  id: latest.key,
                  tipId: latest.key,
                  createdAt: c.createdAt || latest.ts
                });
                continue;
              }

              out.push({
                ...tip.content,
                id: tip.key,
                tipId: tip.key,
                createdAt: tip.content.createdAt || tip.ts
              });
            }

            resolve(out);
          })
        );
      }).catch(reject);
    });

  return {
    async listAgenda(filter = 'all') {
      const agendaConfig = readAgendaConfig();
      const discardedItems = agendaConfig.discardedItems || [];
      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      const [tasksAll, eventsAll, transfersAll, tribesAll, marketAll, reportsAll, jobsAll] = await Promise.all([
        fetchItems('task'),
        fetchItems('event'),
        fetchItems('transfer'),
        fetchItems('tribe'),
        fetchItems('market'),
        fetchItems('report'),
        fetchItems('job')
      ]);

      const tasks = tasksAll.filter(c => Array.isArray(c.assignees) && c.assignees.includes(userId)).map(t => ({ ...t, type: 'task' }));
      const events = eventsAll.filter(c => Array.isArray(c.attendees) && c.attendees.includes(userId)).map(e => ({ ...e, type: 'event' }));
      const transfers = transfersAll.filter(c => c.from === userId || c.to === userId).map(tr => ({ ...tr, type: 'transfer' }));
      const tribes = tribesAll.filter(c => Array.isArray(c.members) && c.members.includes(userId)).map(t => ({ ...t, type: 'tribe', title: t.title }));
      const marketItems = marketAll.filter(c =>
        c.seller === userId || (Array.isArray(c.auctions_poll) && c.auctions_poll.some(b => String(b).split(':')[0] === userId))
      ).map(m => ({ ...m, type: 'market' }));
      const reports = reportsAll.filter(c => c.author === userId || (Array.isArray(c.confirmations) && c.confirmations.includes(userId))).map(r => ({ ...r, type: 'report' }));
      const jobs = jobsAll.filter(c => c.author === userId || (Array.isArray(c.subscribers) && c.subscribers.includes(userId))).map(j => ({ ...j, type: 'job', title: j.title }));

      let combined = [
        ...tasks,
        ...events,
        ...transfers,
        ...tribes,
        ...marketItems,
        ...reports,
        ...jobs
      ];

      let filtered;
      if (filter === 'discarded') {
        filtered = combined.filter(i => discardedItems.includes(i.id));
      } else {
        filtered = combined.filter(i => !discardedItems.includes(i.id));
        if (filter === 'tasks') filtered = filtered.filter(i => i.type === 'task');
        else if (filter === 'events') filtered = filtered.filter(i => i.type === 'event');
        else if (filter === 'transfers') filtered = filtered.filter(i => i.type === 'transfer');
        else if (filter === 'tribes') filtered = filtered.filter(i => i.type === 'tribe');
        else if (filter === 'market') filtered = filtered.filter(i => i.type === 'market');
        else if (filter === 'reports') filtered = filtered.filter(i => i.type === 'report');
        else if (filter === 'open') filtered = filtered.filter(i => String(i.status).toUpperCase() === 'OPEN');
        else if (filter === 'closed') filtered = filtered.filter(i => String(i.status).toUpperCase() === 'CLOSED');
        else if (filter === 'jobs') filtered = filtered.filter(i => i.type === 'job');
      }

      filtered.sort((a, b) => {
        const dateA = a.startTime || a.date || a.deadline || a.createdAt || 0;
        const dateB = b.startTime || b.date || b.deadline || b.createdAt || 0;
        return new Date(dateA) - new Date(dateB);
      });

      const mainItems = combined.filter(i => !discardedItems.includes(i.id));
      const discarded = combined.filter(i => discardedItems.includes(i.id));

      return {
        items: filtered,
        counts: {
          all: mainItems.length,
          open: mainItems.filter(i => String(i.status).toUpperCase() === 'OPEN').length,
          closed: mainItems.filter(i => String(i.status).toUpperCase() === 'CLOSED').length,
          tasks: mainItems.filter(i => i.type === 'task').length,
          events: mainItems.filter(i => i.type === 'event').length,
          transfers: mainItems.filter(i => i.type === 'transfer').length,
          tribes: mainItems.filter(i => i.type === 'tribe').length,
          market: mainItems.filter(i => i.type === 'market').length,
          reports: mainItems.filter(i => i.type === 'report').length,
          jobs: mainItems.filter(i => i.type === 'job').length,
          discarded: discarded.length
        }
      };
    },

    async discardItem(itemId) {
      const agendaConfig = readAgendaConfig();
      if (!agendaConfig.discardedItems.includes(itemId)) {
        agendaConfig.discardedItems.push(itemId);
        writeAgendaConfig(agendaConfig);
      }
    },

    async restoreItem(itemId) {
      const agendaConfig = readAgendaConfig();
      agendaConfig.discardedItems = agendaConfig.discardedItems.filter(id => id !== itemId);
      writeAgendaConfig(agendaConfig);
    }
  };
};

