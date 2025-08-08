import pull from 'pull-stream';
import gui from '../client/gui.js';
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const cooler = gui({ offline: false });

const searchableTypes = [
  'post', 'about', 'curriculum', 'tribe', 'transfer', 'feed',
  'votes', 'report', 'task', 'event', 'bookmark', 'document',
  'image', 'audio', 'video', 'market'
];

const getRelevantFields = (type, content) => {
  switch (type) {
    case 'post':
      return [content?.text, content?.contentWarning, ...(content?.tags || [])];
    case 'about':
      return [content?.about, content?.name, content?.description];
    case 'feed':
      return [content?.text, content?.author, content?.createdAt, ...(content?.tags || []), content?.refeeds];
    case 'event':
      return [content?.title, content?.description, content?.date, content?.location, content?.price, ...(content?.tags || [])];
    case 'votes':
      return [content?.question, content?.deadline, content?.status, content?.totalVotes];
    case 'tribe':
      return [content?.title, content?.description, content?.location, content?.members?.length, ...(content?.tags || [])];
    case 'audio':
      return [content?.title, content?.description, ...(content?.tags || [])];
    case 'image':
      return [content?.title, content?.description, ...(content?.tags || [])];
    case 'video':
      return [content?.title, content?.description, ...(content?.tags || [])];
    case 'document':
      return [content?.title, content?.description, ...(content?.tags || [])];
    case 'market':
      return [content?.title, content?.description, content?.price, content?.status, ...(content?.tags || [])];
    case 'bookmark':
      return [content?.url, content?.description, ...(content?.tags || [])];
    case 'task':
      return [content?.title, content?.description, content?.status, ...(content?.tags || [])];
    case 'report':
      return [content?.title, content?.description, content?.severity, content?.status, ...(content?.tags || [])];
    case 'transfer':
      return [content?.from, content?.to, content?.amount, content?.status, ...(content?.tags || [])];
    case 'curriculum':
      return [content?.name, content?.description, content?.location, content?.status, ...(content?.personalSkills || []), ...(content?.languages || [])];
    default:
      return [];
  }
};

async function buildContext(maxItems = 100) {
  const ssb = await cooler.open();
  return new Promise((resolve, reject) => {
    pull(
      ssb.createLogStream({ limit: logLimit }),
      pull.collect((err, msgs) => {
        if (err) return reject(err);

        const tombstoned = new Set();
        const latest = new Map();
        const users = new Set();
        const events = [];

        msgs.forEach(({ key, value }) => {
          if (value.content.type === 'tombstone') tombstoned.add(value.content.target);
        });

        msgs.forEach(({ key, value }) => {
          const { author, content, timestamp } = value;
          const type = content?.type;
          if (!searchableTypes.includes(type) || tombstoned.has(key)) return;

          users.add(author);
          if (type === 'event' && new Date(content.date) >= new Date()) events.push({ content, timestamp });

          const uniqueKey = type === 'about' ? content.about : key;
          if (!latest.has(uniqueKey) || latest.get(uniqueKey).value.timestamp < timestamp) {
            latest.set(uniqueKey, { key, value });
          }
        });

        events.sort((a, b) => new Date(a.content.date) - new Date(b.content.date));

        const grouped = {};
        Array.from(latest.values())
          .sort((a, b) => b.value.timestamp - a.value.timestamp)
          .slice(0, maxItems)
          .forEach(({ value }) => {
            const { content, timestamp } = value;
            const fields = getRelevantFields(content.type, content).filter(Boolean).join(' | ');
            if (!fields) return;

            const date = new Date(timestamp).toISOString().slice(0, 10);
            grouped[content.type] = grouped[content.type] || [];
            grouped[content.type].push(`[${date}] (${content.type}) ${fields}`);
          });

        const summary = [`## SUMMARY`, `Total Users: ${users.size}`];
        if (events.length) {
          const nextEvent = events[0].content;
          summary.push(`Next Event: "${nextEvent.title}" on ${nextEvent.date} at ${nextEvent.location}`);
        }

        const upcomingEvents = events.map(({ content }) => `[${content.date}] ${content.title} | ${content.location}`).join('\n');

        const contextSections = Object.entries(grouped)
          .map(([type, lines]) => `## ${type.toUpperCase()}\n\n${lines.join('\n')}`)
          .join('\n\n');

        const finalContext = [
          summary.join('\n'),
          events.length ? `## UPCOMING EVENTS\n\n${upcomingEvents}` : '',
          contextSections
        ].filter(Boolean).join('\n\n');

        resolve(finalContext);
      })
    );
  });
}

export default buildContext;
