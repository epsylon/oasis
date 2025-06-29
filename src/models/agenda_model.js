const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');

module.exports = ({ cooler }) => {
  let ssb;

  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const fetchItems = (targetType, filterFn) =>
    new Promise((resolve, reject) => {
      openSsb()
        .then((ssbClient) => {
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

                if (c.type === 'tombstone' && c.target) {
                  tombstoned.add(c.target);
                } else if (c.type === targetType) {
                  if (c.replaces) replacesMap.set(c.replaces, k);
                  latestMap.set(k, { key: k, value: msg.value });
                }
              }

              for (const [oldId, newId] of replacesMap.entries()) {
                latestMap.delete(oldId);
              }

              const results = Array.from(latestMap.values()).filter(
                (msg) => !tombstoned.has(msg.key) && filterFn(msg.value.content, userId)
              );

              resolve(results.map(item => ({ ...item.value.content, id: item.key })));
            })
          );
        })
        .catch(reject);
    });

  return {
    async listAgenda(filter = 'all') {
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

      if (filter === 'tasks') combined = tasks;
      else if (filter === 'events') combined = events;
      else if (filter === 'transfers') combined = transfers;
      else if (filter === 'tribes') combined = tribes.map(t => ({ ...t, type: 'tribe', title: t.name }));
      else if (filter === 'market') combined = marketItems;
      else if (filter === 'reports') combined = reports;
      else if (filter === 'open') combined = combined.filter(i => i.status === 'OPEN');
      else if (filter === 'closed') combined = combined.filter(i => i.status === 'CLOSED');

      combined = Array.from(new Map(combined.map(i => [i.id, i])).values());

      combined.sort((a, b) => {
        const dateA = a.startTime || a.date || a.deadline || a.createdAt;
        const dateB = b.startTime || b.date || b.deadline || b.createdAt;
        return new Date(dateA) - new Date(dateB);
      });

      return combined;
    }
  };
};
