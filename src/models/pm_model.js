const pull = require('../server/node_modules/pull-stream');
const util = require('../server/node_modules/util');

const fs = require('fs');

const INBOX_READ_FILE = 'oasis-inbox-read';
const INBOX_ARCHIVE_FILE = 'oasis-inbox-archived';
const flagPath = (name) => {
  try { return require('../configs/state-manager').statePath(name); } catch (_) { return null; }
};
const readFlagSet = (name) => {
  const file = flagPath(name);
  if (!file) return new Set();
  try { const arr = JSON.parse(fs.readFileSync(file, 'utf8')); return new Set(Array.isArray(arr) ? arr.map(String) : []); } catch (_) { return new Set(); }
};
const writeFlagSet = (name, set) => {
  const file = flagPath(name);
  if (!file) return false;
  try { fs.writeFileSync(file, JSON.stringify(Array.from(set))); return true; } catch (_) { return false; }
};
const readKeys = () => readFlagSet(INBOX_READ_FILE);
const markRead = (key) => { if (!key) return false; const set = readKeys(); set.add(String(key)); return writeFlagSet(INBOX_READ_FILE, set); };
const markUnread = (key) => { if (!key) return false; const set = readKeys(); set.delete(String(key)); return writeFlagSet(INBOX_READ_FILE, set); };
const markReadMany = (keys) => { const set = readKeys(); for (const k of (keys || [])) { if (k) set.add(String(k)); } return writeFlagSet(INBOX_READ_FILE, set); };
const archivedKeys = () => readFlagSet(INBOX_ARCHIVE_FILE);
const archive = (key) => { if (!key) return false; const set = archivedKeys(); set.add(String(key)); return writeFlagSet(INBOX_ARCHIVE_FILE, set); };
const unarchive = (key) => { if (!key) return false; const set = archivedKeys(); set.delete(String(key)); return writeFlagSet(INBOX_ARCHIVE_FILE, set); };

const INBOX_BOTS = {
  blogs: ['BLOG_NEW'],
  jobs: ['JOB_MATCH', 'JOB_SUBSCRIBED', 'JOB_UNSUBSCRIBED'],
  projects: ['PROJECT_FOLLOWED', 'PROJECT_UNFOLLOWED', 'PROJECT_PLEDGE'],
  market: ['MARKET_SOLD'],
  shops: ['SHOP_SOLD'],
  political: ['LARP_RULING', 'PARLIAMENT_GOV', 'TRIBE_GOV'],
  banking: ['BANKING_UBI_PAID', 'BANKING_UBI_AVAILABLE', 'BANKING_CONFIRM_PENDING', 'WALLET_PAYMENT'],
  school: ['SCHOOL_ENROLLED', 'SCHOOL_INVITED', 'SCHOOL_ADMITTED', 'SCHOOL_CERTIFICATE', 'SCHOOL_PASSED', 'SCHOOL_LESSON_NEW'],
  industry: ['INDUSTRY_ADMITTED', 'INDUSTRY_APPLICATION', 'INDUSTRY_INVITED', 'INDUSTRY_DISSOLVED', 'INDUSTRY_BUILD_APPROVED', 'INDUSTRY_DISTRIBUTED'],
  housing: ['HOUSING_REQUESTED', 'HOUSING_CANCELLED', 'HOUSING_UNAVAILABLE'],
  wiki: ['WIKI_EDITED', 'WIKI_RESTORED'],
  emergencies: ['EMERGENCY_UPDATED', 'EMERGENCY_RESOLVED'],
  podcasts: ['PODCAST_EPISODE'],
  campaigns: ['CAMPAIGN_UPDATED', 'CAMPAIGN_ACHIEVED', 'CAMPAIGN_RAISED'],
  logistics: ['LOGISTICS_UPDATED', 'LOGISTICS_CLOSED', 'LOGISTICS_BOOKED', 'LOGISTICS_CANCELLED', 'LOGISTICS_CONFIRMED', 'LOGISTICS_REJECTED', 'LOGISTICS_DELIVERED']
};
const BOT_BY_SUBJECT = new Map();
for (const [bot, subjects] of Object.entries(INBOX_BOTS)) for (const s of subjects) BOT_BY_SUBJECT.set(s, bot);
const isReminderSubject = (s) => /^(Task Reminder:|Calendar Reminder:)/i.test(String(s || ''));
const botOf = (content) => {
  const c = content || {};
  if (isReminderSubject(c.subject)) return 'reminders';
  if (c.meta && c.meta.type === 'project-pledge') return 'projects';
  return BOT_BY_SUBJECT.get(String(c.subject || '').toUpperCase()) || null;
};
const mutedBots = (cfg) => {
  const c = cfg || {};
  return new Set(Array.isArray(c.inboxMutedBots) ? c.inboxMutedBots.map(String) : []);
};

const privateCaches = new WeakMap();
const privateCacheFor = (ssb, userId) => {
  let byUser = privateCaches.get(ssb);
  if (!byUser) { byUser = new Map(); privateCaches.set(ssb, byUser); }
  let c = byUser.get(userId);
  if (!c) {
    c = { lastTs: 0, seen: new Set(), posts: new Map(), tombClaims: new Map(), authorByKey: new Map(), recpsByKey: new Map(), version: 0 };
    byUser.set(userId, c);
  }
  return c;
};

module.exports = ({ cooler }) => {
  let ssb;
  let userId;
  const openSsb = async () => {
    if (!ssb) {
      ssb = await cooler.open();
      userId = ssb.id;
    }
    return ssb;
  };

  function uniqueRecps(list) {
    const out = [];
    const seen = new Set();
    for (const x of (list || [])) {
      if (typeof x !== 'string') continue;
      const id = x.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  return {
    readKeys,
    markRead,
    markUnread,
    markReadMany,
    archivedKeys,
    archive,
    unarchive,
    botOf,
    mutedBots,
    INBOX_BOTS,
    type: 'post',

    async sendToMany(recipients = [], subject = '', text = '', crypter = false, ref = '') {
      const others = uniqueRecps(recipients).filter(id => id !== userId);
      if (!others.length) return [];
      const out = [];
      for (let i = 0; i < others.length; i += 6) {
        const batch = others.slice(i, i + 6);
        const r = await this.sendMessage(batch, subject, text, crypter, ref).catch(() => null);
        if (r) out.push(r);
      }
      return out;
    },

    async sendMessage(recipients = [], subject = '', text = '', crypter = false, ref = '') {
      const ssbClient = await openSsb();
      const recps = uniqueRecps([userId, ...recipients]);
      const content = {
        type: 'post',
        from: userId,
        to: recps,
        subject,
        text,
        sentAt: new Date().toISOString(),
        private: true,
        ...(ref ? { ref: String(ref) } : {}),
        ...(crypter ? { crypter: true } : {})
      };
      const publishAsync = util.promisify(ssbClient.private.publish);
      return publishAsync(content, recps);
    },

    async sentRefs() {
      const out = new Set();
      let messages = [];
      try { messages = await this.listAllPrivate({ includeDeleted: true }); } catch (_) { return out; }
      for (const m of (messages || [])) {
        const c = m && m.value && m.value.content;
        if (!c || !c.ref) continue;
        if (m.value.author !== userId) continue;
        out.add(`${String(c.subject || '')}|${String(c.ref)}`);
      }
      return out;
    },

    async sendFileShare(recipients = [], subject = '', fileShare = null, crypter = false) {
      const ssbClient = await openSsb();
      const recps = uniqueRecps([userId, ...recipients]);
      if (!fileShare || typeof fileShare !== 'object') throw new Error('Invalid file share');
      const content = {
        type: 'post',
        from: userId,
        to: recps,
        subject,
        text: '',
        sentAt: new Date().toISOString(),
        private: true,
        fileShare,
        ...(crypter ? { crypter: true } : {})
      };
      const publishAsync = util.promisify(ssbClient.private.publish);
      return publishAsync(content, recps);
    },

    async deleteMessageById(messageId) {
      const ssbClient = await openSsb();
      const rawMsg = await new Promise((resolve, reject) =>
        ssbClient.get(messageId, (err, m) =>
          err ? reject(new Error("Error retrieving message.")) : resolve(m)
        )
      );
      let decrypted;
      try {
        decrypted = ssbClient.private.unbox({
          key: messageId,
          value: rawMsg,
          timestamp: rawMsg?.timestamp || Date.now()
        });
      } catch {
        throw new Error("Malformed message.");
      }
      const content = decrypted?.value?.content;
      const author = decrypted?.value?.author;
      const originalRecps = Array.isArray(content?.to) ? content.to : [];
      if (!content || !author) throw new Error("Malformed message.");
      const isAuthor = author === userId;
      const isRecipient = originalRecps.includes(userId);
      if (!isAuthor && !isRecipient) throw new Error("Not authorized.");
      if (content.type === 'tombstone') throw new Error("Message already deleted.");
      const tombstone = {
        type: 'tombstone',
        target: messageId,
        deletedAt: new Date().toISOString(),
        private: true
      };
      const tombstoneRecps = isAuthor
        ? uniqueRecps([userId, author, ...originalRecps])
        : uniqueRecps([userId]);
      const publishAsync = util.promisify(ssbClient.private.publish);
      return publishAsync(tombstone, tombstoneRecps);
    },

    async listAllPrivate(opts = {}) {
      const includeDeleted = !!(opts && opts.includeDeleted);
      const ssbClient = await openSsb();
      const cache = privateCacheFor(ssbClient, userId);
      const raw = await new Promise((resolve, reject) => {
        pull(
          ssbClient.createLogStream(cache.lastTs > 0 ? { reverse: false, gte: cache.lastTs } : { reverse: false }),
          pull.collect((err, arr) => err ? reject(err) : resolve(arr))
        );
      });
      for (const m of raw) {
        if (!m || !m.value) continue;
        const keyIn = m.key || m.value?.key || m.value?.hash || '';
        if (!keyIn || cache.seen.has(keyIn)) continue;
        cache.seen.add(keyIn);
        const recvTs = Number(m.timestamp) || 0;
        if (recvTs > cache.lastTs) cache.lastTs = recvTs;
        const valueIn = m.value || m;
        const tsIn = m.timestamp || m.value?.timestamp || Date.now();
        let dec;
        try {
          dec = ssbClient.private.unbox({ key: keyIn, value: valueIn, timestamp: tsIn });
        } catch {
          continue;
        }
        const v = dec?.value || {};
        const c = v.content || {};
        const k = dec?.key || keyIn;
        if (!c || c.private !== true || !k) continue;
        if (c.type === 'tombstone' && c.target) {
          const set = cache.tombClaims.get(c.target) || new Set();
          set.add(v.author);
          cache.tombClaims.set(c.target, set);
          continue;
        }
        cache.authorByKey.set(k, v.author);
        if (c.type === 'post') {
          const to = Array.isArray(c.to) ? c.to : [];
          cache.recpsByKey.set(k, to);
          const author = v.author;
          if (author === userId || to.includes(userId)) {
            cache.posts.set(k, {
              key: k,
              value: { author, content: c },
              timestamp: v.timestamp || tsIn
            });
          }
        }
      }
      cache.version += raw.length ? 1 : 0;
      const tombed = new Set();
      for (const [target, tombAuthors] of cache.tombClaims.entries()) {
        const origAuthor = cache.authorByKey.get(target);
        const origRecps = cache.recpsByKey.get(target) || [];
        for (const tombAuthor of tombAuthors) {
          if (tombAuthor === origAuthor || tombAuthor === userId || origRecps.includes(tombAuthor)) {
            tombed.add(target);
            break;
          }
        }
      }
      return Array.from(cache.posts.values()).filter(m => m && m.key && (includeDeleted || !tombed.has(m.key)));
    },

    privateCacheVersion() {
      return ssb ? privateCacheFor(ssb, userId).version : 0;
    }
  };
};

module.exports.botOf = botOf;
module.exports.mutedBots = mutedBots;
module.exports.INBOX_BOTS = INBOX_BOTS;
module.exports.readKeys = readKeys;
module.exports.archivedKeys = archivedKeys;
