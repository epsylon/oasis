const pull = require('../server/node_modules/pull-stream');
const gui = require('../client/gui.js');
const { getConfig } = require('../configs/config-manager.js');
const path = require('path');

const logLimit = getConfig().ssbLogStream?.limit || 1000;
const cooler = gui({ offline: false });

const searchableTypes = [
  'post', 'about', 'curriculum', 'tribe', 'transfer', 'feed',
  'votes', 'vote', 'report', 'task', 'event', 'bookmark', 'document',
  'image', 'audio', 'video', 'market', 'forum', 'job', 'project',
  'contact', 'pub', 'pixelia', 'bankWallet', 'bankClaim', 'aiExchange'
];

const clip = (s, n) => String(s || '').slice(0, n);
const squash = s => String(s || '').replace(/\s+/g, ' ').trim();
const compact = s => squash(clip(s, 160));

function fieldsForSnippet(type, c) {
  switch (type) {
    case 'aiExchange': return [c?.question, clip(squash(c?.answer || ''), 120)];
    case 'post': return [c?.text, ...(c?.tags || [])];
    case 'about': return [c?.about, c?.name, c?.description];
    case 'curriculum': return [c?.name, c?.description, c?.location];
    case 'tribe': return [c?.title, c?.description, ...(c?.tags || [])];
    case 'transfer': return [c?.from, c?.to, String(c?.amount), c?.status];
    case 'feed': return [c?.text, ...(c?.tags || [])];
    case 'votes': return [c?.question, c?.status];
    case 'vote': return [c?.vote?.link, String(c?.vote?.value)];
    case 'report': return [c?.title, c?.severity, c?.status];
    case 'task': return [c?.title, c?.status];
    case 'event': return [c?.title, c?.date, c?.location];
    case 'bookmark': return [c?.url, c?.description];
    case 'document': return [c?.title, c?.description];
    case 'image': return [c?.title, c?.description];
    case 'audio': return [c?.title, c?.description];
    case 'video': return [c?.title, c?.description];
    case 'market': return [c?.title, String(c?.price), c?.status];
    case 'forum': return [c?.title, c?.category, c?.text];
    case 'job': return [c?.title, c?.job_type, String(c?.salary), c?.status];
    case 'project': return [c?.title, c?.status, String(c?.progress)];
    case 'contact': return [c?.contact];
    case 'pub': return [c?.address?.key, c?.address?.host];
    case 'pixelia': return [c?.author];
    case 'bankWallet': return [c?.address];
    case 'bankClaim': return [String(c?.amount), c?.epochId, c?.txid];
    default: return [];
  }
}

async function publishExchange({ q, a, ctx = [], tokens = {} }) {
  const ssbClient = await cooler.open();

  const content = {
    type: 'aiExchange',
    question: clip(String(q || ''), 2000),
    answer: clip(String(a || ''), 5000),
    ctx: ctx.slice(0, 12).map(s => clip(String(s || ''), 800)),
    timestamp: Date.now()
  };

  return new Promise((resolve, reject) => {
    ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res));
  });
}

async function buildContext(maxItems = 100) {
  const ssb = await cooler.open();
  return new Promise((resolve, reject) => {
    pull(
      ssb.createLogStream({ reverse: true, limit: logLimit }),
      pull.collect((err, msgs) => {
        if (err) return reject(err);

        const tombstoned = new Set();
        const latest = new Map();

        for (const { value } of msgs) {
          const c = value?.content;
          if (c?.type === 'tombstone' && c?.target) tombstoned.add(c.target);
        }

        for (const { key, value } of msgs) {
          const author = value?.author;
          const content = value?.content || {};
          const type = content?.type;
          const ts = value?.timestamp || 0;

          if (!searchableTypes.includes(type) || tombstoned.has(key)) continue;

          const uniqueKey = type === 'about' ? content.about : key;
          if (!latest.has(uniqueKey) || (latest.get(uniqueKey)?.value?.timestamp || 0) < ts) {
            latest.set(uniqueKey, { key, value });
          }
        }

        const grouped = {};
        Array.from(latest.values())
          .sort((a, b) => (b.value.timestamp || 0) - (a.value.timestamp || 0))
          .slice(0, maxItems)
          .forEach(({ value }) => {
            const content = value.content;
            const type = content.type;
            const fields = fieldsForSnippet(type, content).filter(Boolean).map(compact).filter(Boolean).join(' | ');
            if (!fields) return;
            const date = new Date(value.timestamp || 0).toISOString().slice(0, 10);
            grouped[type] = grouped[type] || [];
            grouped[type].push(`[${date}] (${type}) ${fields}`);
          });

        const contextSections = Object.entries(grouped)
          .map(([type, lines]) => `## ${type.toUpperCase()}\n\n${lines.slice(0, 20).join('\n')}`)
          .join('\n\n');

        const finalContext = contextSections ? contextSections : '';
        resolve(finalContext);
      })
    );
  });
}

module.exports = { fieldsForSnippet, buildContext, clip, publishExchange };

