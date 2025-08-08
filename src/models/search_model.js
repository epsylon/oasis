const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

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

  const search = async ({ query, types = [], resultsPerPage = "10" }) => {
    const ssbClient = await openSsb();
    const queryLower = query.toLowerCase();

    const messages = await new Promise((res, rej) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => err ? rej(err) : res(msgs))
      );
    });

    const tombstoned = new Set(messages.filter(m => m.value?.content?.type === 'tombstone').map(m => m.value.content.target));
    const replacesMap = new Map();
    const latestByKey = new Map();

    for (const msg of messages) {
      const k = msg.key;
      const c = msg?.value?.content;
      const t = c?.type;
      if (!t || !searchableTypes.includes(t)) continue;
      if (tombstoned.has(k)) continue;
      if (c.replaces) replacesMap.set(c.replaces, k);
      latestByKey.set(k, msg);
    }

    for (const oldId of replacesMap.keys()) {
      latestByKey.delete(oldId);
    }

    const filtered = Array.from(latestByKey.values()).filter(msg => {
      const c = msg?.value?.content;
      const t = c?.type;
      if (!t || (types.length > 0 && !types.includes(t))) return false;
      if (t === 'market') {
        if (c.stock === 0 && c.status !== 'SOLD') return false;
      }
      if (query.startsWith('@') && query.length > 1) return (t === 'about' && c?.about === query);
      const fields = getRelevantFields(t, c);
      if (query.startsWith('#') && query.length > 1) {
        const tag = query.substring(1).toLowerCase();
        return (c?.tags || []).some(t => t.toLowerCase() === tag);
      }
      return fields.filter(Boolean).map(String).some(field => field.toLowerCase().includes(queryLower));
    });

    filtered.sort((a, b) => (b?.value?.timestamp || 0) - (a?.value?.timestamp || 0));

    const grouped = filtered.reduce((acc, msg) => {
      const t = msg?.value?.content?.type || 'unknown';
      if (!acc[t]) acc[t] = [];
      acc[t].push(msg);
      return acc;
    }, {});

    if (resultsPerPage !== "all") {
      const limit = parseInt(resultsPerPage, 10);
      for (const key in grouped) grouped[key] = grouped[key].slice(0, limit);
    }

    return grouped;
  };

  return { search };
};

