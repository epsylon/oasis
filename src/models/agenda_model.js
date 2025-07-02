const fs = require('fs');
const path = require('path');
const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');

const agendaConfigPath = path.join(__dirname, '../configs/agenda-config.json');

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

  const fetchItems = (targetType, filterFn) =>
    new Promise((resolve, reject) => {
      openSsb().then((ssbClient) => {
        const userId = ssbClient.id;
        pull(
          ssbClient.createLogStream(),
          pull.collect((err, msgs) => {
            if (err) return reject(err);
            const tombstoned = new Set();
            const replacesMap = new Map();
            const latestMap = new Map();
            for (const msg of msgs) {
              const c = msg.value?.content;
              const k = msg.key;
              if (!c) continue;
              if (c.type === 'tombstone' && c.target) tombstoned.add(c.target);
              else if (c.type === targetType) {
                if (c.replaces) replacesMap.set(c.replaces, k);
                latestMap.set(k, { key: k, value: msg.value });
              }
            }
            for (const [oldId, newId] of replacesMap.entries()) latestMap.delete(oldId);
            const results = Array.from(latestMap.values()).filter(
              (msg) => !tombstoned.has(msg.key) && filterFn(msg.value.content, userId)
            );
            resolve(results.map(item => ({ ...item.value.content, id: item.key })));
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

      const [tasks, events, transfers, tribes, marketItems, reports] = await Promise.all([
        fetchItems('task', (c, id) => Array.isArray(c.assignees) && c.assignees.includes(id)),
        fetchItems('event', (c, id) => Array.isArray(c.attendees) && c.attendees.includes(id)),
        fetchItems('transfer', (c, id) => c.from === id || c.to === id),
        fetchItems('tribe', (c, id) => Array.isArray(c.members) && c.members.includes(id)),
        fetchItems('market', (c, id) => c.seller === id || (Array.isArray(c.auctions_poll) && c.auctions_poll.some(b => b.split(':')[0] === id))),
        fetchItems('report', (c, id) => c.author === id || (Array.isArray(c.confirmations) && c.confirmations.includes(id)))
      ]);

      let combined = [
        ...tasks,
        ...events,
        ...transfers,
        ...tribes.map(t => ({ ...t, type: 'tribe', title: t.title })),
        ...marketItems.map(m => ({ ...m, type: 'market' })),
        ...reports.map(r => ({ ...r, type: 'report' }))
      ];
      const dedup = {};
      for (const item of combined) {
        const dA = item.startTime || item.date || item.deadline || item.createdAt;
        if (!dedup[item.id]) dedup[item.id] = item;
        else {
          const existing = dedup[item.id];
          const dB = existing.startTime || existing.date || existing.deadline || existing.createdAt;
          if (new Date(dA) > new Date(dB)) dedup[item.id] = item;
        }
      }
      combined = Object.values(dedup);

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
        else if (filter === 'open') filtered = filtered.filter(i => i.status === 'OPEN');
        else if (filter === 'closed') filtered = filtered.filter(i => i.status === 'CLOSED');
      }

      filtered.sort((a, b) => {
        const dateA = a.startTime || a.date || a.deadline || a.createdAt;
        const dateB = b.startTime || b.date || b.deadline || b.createdAt;
        return new Date(dateA) - new Date(dateB);
      });

      const mainItems = combined.filter(i => !discardedItems.includes(i.id));
      const discarded = combined.filter(i => discardedItems.includes(i.id));

      return {
        items: filtered,
        counts: {
          all: mainItems.length,
          open: mainItems.filter(i => i.status === 'OPEN').length,
          closed: mainItems.filter(i => i.status === 'CLOSED').length,
          tasks: mainItems.filter(i => i.type === 'task').length,
          events: mainItems.filter(i => i.type === 'event').length,
          transfers: mainItems.filter(i => i.type === 'transfer').length,
          tribes: mainItems.filter(i => i.type === 'tribe').length,
          market: mainItems.filter(i => i.type === 'market').length,
          reports: mainItems.filter(i => i.type === 'report').length,
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

