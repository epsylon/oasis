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
    'image', 'audio', 'video', 'market', 'bankWallet', 'bankClaim',
    'project', 'job', 'forum', 'vote', 'contact', 'pub'
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
        return [content?.item_type, content?.title, content?.description, content?.price, ...(content?.tags || []), content?.status, content?.item_status, content?.deadline, content?.includesShipping, content?.seller, content?.image, content?.auctions_poll, content?.stock];
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
      case 'bankWallet':
        return [content?.address];
      case 'bankClaim':
        return [content?.amount, content?.epochId, content?.allocationId, content?.txid];
      case 'project':
        return [content?.title, content?.status, content?.progress, content?.goal, content?.pledged, content?.deadline, (content?.followers || []).length, (content?.backers || []).length, (content?.milestones || []).length, content?.bounty, content?.bountyAmount, content?.bounty_currency, content?.activity?.kind, content?.activityActor];
      case 'job':
        return [content?.title, content?.job_type, ...(content?.tasks || []), content?.location, content?.vacants, content?.salary, content?.status, (content?.subscribers || []).length];
      case 'forum':
        return [content?.root, content?.category, content?.title, content?.text, content?.key];
      case 'vote':
        return [content?.vote?.link];
      case 'contact':
        return [content?.contact];
      case 'pub':
        return [content?.address?.host, content?.address?.key];
      default:
        return [];
    }
  };

  const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();

  const getDedupeKey = (msg) => {
    const c = msg?.value?.content || {};
    const t = c?.type || 'unknown';
    const author = c.author || msg?.value?.author || '';

    if (t === 'post') return `post:${msg.key}`;

    if (t === 'about') return `about:${c.about || author || msg.key}`;
    if (t === 'curriculum') return `curriculum:${c.author || msg?.value?.author || msg.key}`;
    if (t === 'contact') return `contact:${c.contact || msg.key}`;
    if (t === 'vote') return `vote:${c?.vote?.link || msg.key}`;
    if (t === 'pub') return `pub:${c?.address?.key || c?.address?.host || msg.key}`;
    if (t === 'bankWallet') return `bankWallet:${c?.address || msg.key}`;
    if (t === 'bankClaim') return `bankClaim:${c?.txid || `${c?.epochId || ''}:${c?.allocationId || ''}:${c?.amount || ''}` || msg.key}`;

    if (t === 'document') return `document:${c.key || c.url || `${author}|${norm(c.title)}` || msg.key}`;
    if (t === 'image') return `image:${c.url || `${author}|${norm(c.title)}|${norm(c.description)}` || msg.key}`;
    if (t === 'audio') return `audio:${c.url || `${author}|${norm(c.title)}|${norm(c.description)}` || msg.key}`;
    if (t === 'video') return `video:${c.url || `${author}|${norm(c.title)}|${norm(c.description)}` || msg.key}`;
    if (t === 'bookmark') return `bookmark:${author}|${c.url || norm(c.description) || msg.key}`;

    if (t === 'tribe') {
      return [
        'tribe',
        author,
        norm(c.title),
        norm(c.location),
        norm(c.image)
      ].join('|');
    }

    if (t === 'event') {
      return [
        'event',
        c.organizer || author,
        norm(c.title),
        norm(c.date),
        norm(c.location)
      ].join('|');
    }

    if (t === 'task') {
      return [
        'task',
        c.author || author,
        norm(c.title),
        norm(c.startTime),
        norm(c.endTime),
        norm(c.location)
      ].join('|');
    }

    if (t === 'report') {
      return [
        'report',
        c.author || author,
        norm(c.title),
        norm(c.category),
        norm(c.severity)
      ].join('|');
    }

    if (t === 'votes') {
      return [
        'votes',
        c.createdBy || author,
        norm(c.question),
        norm(c.deadline)
      ].join('|');
    }

    if (t === 'market') {
      return [
        'market',
        c.seller || author,
        norm(c.title),
        norm(c.deadline),
        norm(c.item_type),
        norm(c.image)
      ].join('|');
    }

    if (t === 'transfer') {
      const txid = c.txid || c.transactionId || c.id;
      if (txid) return `transfer:${txid}`;
      return [
        'transfer',
        norm(c.from),
        norm(c.to),
        norm(c.amount),
        norm(c.concept),
        norm(c.deadline)
      ].join('|');
    }

    if (t === 'feed') {
      return [
        'feed',
        c.author || author,
        norm(c.text)
      ].join('|');
    }

    if (t === 'project') {
      return [
        'project',
        c.activityActor || author,
        norm(c.title),
        norm(c.deadline),
        norm(c.goal)
      ].join('|');
    }

    if (t === 'job') {
      return [
        'job',
        author,
        norm(c.title),
        norm(c.location),
        norm(c.salary),
        norm(c.job_type)
      ].join('|');
    }

    if (t === 'forum') {
      return `forum:${c.key || c.root || `${author}|${norm(c.title)}` || msg.key}`;
    }

    return `${t}:${msg.key}`;
  };

  const dedupeKeepLatest = (msgs) => {
    const map = new Map();
    for (const msg of msgs) {
      const k = getDedupeKey(msg);
      const prev = map.get(k);
      const ts = msg?.value?.timestamp || 0;
      const pts = prev?.value?.timestamp || 0;
      if (!prev || ts > pts) map.set(k, msg);
    }
    return Array.from(map.values());
  };

  const search = async ({ query, types = [], resultsPerPage = "10" }) => {
    const ssbClient = await openSsb();
    const queryLower = String(query || '').toLowerCase();

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

    let filtered = Array.from(latestByKey.values()).filter(msg => {
      const c = msg?.value?.content;
      const t = c?.type;
      if (!t || (types.length > 0 && !types.includes(t))) return false;
      if (t === 'market') {
        if (c.stock === 0 && c.status !== 'SOLD') return false;
      }
      if (!queryLower) return true;
      if (queryLower.startsWith('@') && queryLower.length > 1) return (t === 'about' && c?.about === query);
      const fields = getRelevantFields(t, c);
      if (queryLower.startsWith('#') && queryLower.length > 1) {
        const tag = queryLower.substring(1);
        return (c?.tags || []).some(x => String(x).toLowerCase() === tag);
      }
      return fields.filter(Boolean).map(String).some(field => field.toLowerCase().includes(queryLower));
    });

    filtered = dedupeKeepLatest(filtered);

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

