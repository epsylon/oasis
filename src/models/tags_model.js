const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  return {
    async listTags(filter = 'all') {
      const ssbClient = await openSsb();

      return new Promise((resolve, reject) => {
        pull(
          ssbClient.createLogStream(),
          pull.filter(msg => {
            const c = msg.value.content;
            return c && Array.isArray(c.tags) && c.tags.length && c.type !== 'tombstone';
          }),
          pull.collect((err, results) => {
            if (err) return reject(new Error(`Error retrieving tags: ${err.message}`));
            const counts = {};

            results.forEach(record => {
              const c = record.value.content;
              c.tags.filter(Boolean).forEach(tag => {
                counts[tag] = (counts[tag] || 0) + 1;
              });
            });

            let tags = Object.entries(counts).map(([name, count]) => ({ name, count }));

            if (filter === 'top') {
              tags.sort((a, b) => b.count - a.count);
            } else if (filter === 'cloud') {
              const max = Math.max(...tags.map(t => t.count), 1);
              tags = tags.map(t => ({ ...t, weight: t.count / max }));
            } else {
              tags.sort((a, b) => a.name.localeCompare(b.name));
            }

            const deduplicatedTags = Array.from(new Map(tags.map(tag => [tag.name, tag])).values());

            resolve(deduplicatedTags);
          })
        );
      });
    }
  };
};
