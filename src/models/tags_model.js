const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();

  const normalizeTag = (tag) => String(tag == null ? '' : tag).trim().replace(/^#/, '');
  const tagKey = (tag) => normalizeTag(tag).toLowerCase();

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
      return ['tribe', author, norm(c.title), norm(c.location), norm(c.image)].join('|');
    }

    if (t === 'event') {
      return ['event', c.organizer || author, norm(c.title), norm(c.date), norm(c.location)].join('|');
    }

    if (t === 'task') {
      return ['task', c.author || author, norm(c.title), norm(c.startTime), norm(c.endTime), norm(c.location)].join('|');
    }

    if (t === 'report') {
      return ['report', c.author || author, norm(c.title), norm(c.category), norm(c.severity)].join('|');
    }

    if (t === 'votes') {
      return ['votes', c.createdBy || author, norm(c.question), norm(c.deadline)].join('|');
    }

    if (t === 'market') {
      return ['market', c.seller || author, norm(c.title), norm(c.deadline), norm(c.item_type), norm(c.image)].join('|');
    }

    if (t === 'transfer') {
      const txid = c.txid || c.transactionId || c.id;
      if (txid) return `transfer:${txid}`;
      return ['transfer', norm(c.from), norm(c.to), norm(c.amount), norm(c.concept), norm(c.deadline)].join('|');
    }

    if (t === 'feed') {
      return ['feed', c.author || author, norm(c.text)].join('|');
    }

    if (t === 'project') {
      return ['project', c.activityActor || author, norm(c.title), norm(c.deadline), norm(c.goal)].join('|');
    }

    if (t === 'job') {
      return ['job', author, norm(c.title), norm(c.location), norm(c.salary), norm(c.job_type)].join('|');
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

  return {
    async listTags(filter = 'all') {
      const ssbClient = await openSsb();

      const messages = await new Promise((resolve, reject) => {
        pull(
          ssbClient.createLogStream({ limit: logLimit }),
          pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
        );
      });

      const tombstoned = new Set(
        messages
          .filter(m => m?.value?.content?.type === 'tombstone')
          .map(m => m.value.content.target)
          .filter(Boolean)
      );

      const replacesMap = new Map();
      const latestByKey = new Map();

      for (const msg of messages) {
        const k = msg?.key;
        const c = msg?.value?.content;
        const t = c?.type;
        if (!k || !c || !t) continue;
        if (tombstoned.has(k)) continue;
        if (t === 'tombstone') continue;
        if (c.replaces) replacesMap.set(c.replaces, k);
        latestByKey.set(k, msg);
      }

      for (const oldId of replacesMap.keys()) latestByKey.delete(oldId);

      let filtered = Array.from(latestByKey.values()).filter(msg => {
        const c = msg?.value?.content;
        if (!c || c.type === 'tombstone') return false;
        if (tombstoned.has(msg.key)) return false;
        return Array.isArray(c.tags) && c.tags.filter(Boolean).length > 0;
      });

      filtered = dedupeKeepLatest(filtered);

      const counts = new Map();

      for (const record of filtered) {
        const tagsArr = record?.value?.content?.tags || [];
        const uniqueTags = new Set(tagsArr.map(tagKey).filter(Boolean));
        for (const k of uniqueTags) {
          const display = normalizeTag(tagsArr.find(t => tagKey(t) === k) || k) || k;
          const prev = counts.get(k);
          if (!prev) counts.set(k, { name: display, count: 1 });
          else counts.set(k, { name: prev.name || display, count: prev.count + 1 });
        }
      }

      let tags = Array.from(counts.values());

      if (filter === 'top') {
        tags.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      } else if (filter === 'cloud') {
        const max = Math.max(...tags.map(t => t.count), 1);
        tags = tags.map(t => ({ ...t, weight: t.count / max }));
      } else {
        tags.sort((a, b) => a.name.localeCompare(b.name));
      }

      return tags;
    }
  };
};

