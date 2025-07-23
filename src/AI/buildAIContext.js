import pull from 'pull-stream';
import gui from '../client/gui.js';

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
      return [content?.title, content?.description, content?.date, content?.location, content?.price, content?.eventUrl, ...(content?.tags || []), content?.attendees, content?.organizer, content?.status, content?.isPublic];
    case 'votes':
      return [content?.question, content?.deadline, content?.status, ...(Object.values(content?.votes || {})), content?.totalVotes];
    case 'tribe':
      return [content?.title, content?.description, content?.image, content?.location, ...(content?.tags || []), content?.isLARP, content?.isAnonymous, content?.members?.length, content?.createdAt, content?.author];
    case 'audio':
      return [content?.url, content?.mimeType, content?.title, content?.description, ...(content?.tags || [])];
    case 'image':
      return [content?.url, content?.title, content?.description, ...(content?.tags || []), content?.meme];
    case 'video':
      return [content?.url, content?.mimeType, content?.title, content?.description, ...(content?.tags || [])];
    case 'document':
      return [content?.url, content?.title, content?.description, ...(content?.tags || []), content?.key];
    case 'market':
      return [content?.item_type, content?.title, content?.description, content?.price, ...(content?.tags || []), content?.status, content?.item_status, content?.deadline, content?.includesShipping, content?.seller, content?.image, content?.auctions_poll];
    case 'bookmark':
      return [content?.author, content?.url, ...(content?.tags || []), content?.description, content?.category, content?.lastVisit];
    case 'task':
      return [content?.title, content?.description, content?.startTime, content?.endTime, content?.priority, content?.location, ...(content?.tags || []), content?.isPublic, content?.assignees?.length, content?.status, content?.author];
    case 'report':
      return [content?.title, content?.description, content?.category, content?.createdAt, content?.author, content?.image, ...(content?.tags || []), content?.confirmations, content?.severity, content?.status, content?.isAnonymous];
    case 'transfer':
      return [content?.from, content?.to, content?.concept, content?.amount, content?.deadline, content?.status, ...(content?.tags || []), content?.confirmedBy?.length];
    case 'curriculum':
      return [content?.author, content?.name, content?.description, content?.photo, ...(content?.personalSkills || []), ...(content?.personalExperiences || []), ...(content?.oasisExperiences || []), ...(content?.oasisSkills || []), ...(content?.educationExperiences || []), ...(content?.educationalSkills || []), ...(content?.languages || []), ...(content?.professionalExperiences || []), ...(content?.professionalSkills || []), content?.location, content?.status, content?.preferences, content?.createdAt];
    default:
      return [];
  }
};

async function buildContext(maxItems = 10, filterTypes = []) {
  const ssb = await cooler.open();
  return new Promise((resolve, reject) => {
    pull(
      ssb.createLogStream(),
      pull.collect((err, msgs) => {
        if (err) return reject(err);
        const contextLines = [];
        const latest = new Map();
        const tombstoned = new Set();

        for (const msg of msgs) {
          const { content } = msg.value;
          if (content.type === 'tombstone') {
            tombstoned.add(content.target);
          }
        }

        for (const msg of msgs) {
          const key = msg.key;
          const { content } = msg.value;
          const type = content?.type;
          if (!type || !searchableTypes.includes(type)) continue;
          if (filterTypes.length && !filterTypes.includes(type)) continue;
          if (tombstoned.has(key)) continue;
          latest.set(key, msg);
        }

        const sorted = Array.from(latest.values())
          .sort((a, b) => b.value.timestamp - a.value.timestamp)
          .slice(0, maxItems);

        const grouped = {};

        for (const msg of sorted) {
          const type = msg.value.content.type;
          const fields = getRelevantFields(type, msg.value.content);
          const compact = fields.filter(Boolean).join(' | ');
          if (!compact) continue;

          const date = new Date(msg.value.timestamp).toISOString().slice(0, 10);
          const line = `[${date}] (${type}) ${compact}`;
          if (!grouped[type]) grouped[type] = [];
          grouped[type].push(line);
        }

        const finalContext = Object.entries(grouped)
          .map(([type, lines]) => `## ${type.toUpperCase()}\n\n` + lines.join('\n\n'))
          .join('\n\n');

        resolve(finalContext);
      })
    );
  });
}

export default buildContext;
