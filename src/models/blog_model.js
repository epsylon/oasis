const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { readTyped, memoIndex } = require('./typed_log');
const longText = require('../backend/long_text');
const { isComment, isBlogPost } = require('./comments_model');
const { versionGroups } = require('../backend/dedupe');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const OPINION_TYPE = 'blogOpinion';
const SCHEDULED_KIND = 'blog';

module.exports = ({ cooler, isPublic = false, scheduler = null }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const isScheduledId = (id) => !!scheduler && scheduler.isScheduledId(id);
  const scheduledToBlog = (entry) => ({
    id: entry.id,
    key: entry.id,
    author: entry.author,
    subject: entry.data.subject || '',
    text: entry.data.text || '',
    mentions: Array.isArray(entry.data.mentions) ? entry.data.mentions : [],
    allowComments: entry.data.allowComments !== false,
    tags: Array.isArray(entry.data.tags) ? entry.data.tags : [],
    createdAt: entry.createdAt,
    scheduledAt: entry.publishAt,
    clearnet: entry.data.clearnet === true,
    commentCount: 0,
    opinions: {},
    opinions_inhabitants: []
  });
  const scheduledMine = async () => scheduler ? (await scheduler.listMine(SCHEDULED_KIND)).map(scheduledToBlog) : [];

  const BLOG_TYPES = ['post', OPINION_TYPE, 'tombstone', longText.CHUNK_TYPE];

  const getAllMessages = async (ssbClient) => readTyped(ssbClient, BLOG_TYPES, { limit: logLimit });
  const AUTHOR_STREAM_MAX = 20000;
  const getAuthorMessages = (ssbClient, feedId) => new Promise((resolve) => {
    try {
      pull(
        ssbClient.createUserStream({ id: feedId, limit: AUTHOR_STREAM_MAX }),
        pull.filter(m => m && m.value && m.value.content && typeof m.value.content === 'object' && BLOG_TYPES.includes(m.value.content.type)),
        pull.collect((err, arr) => resolve(err || !Array.isArray(arr) ? [] : arr))
      );
    } catch (_) { resolve([]); }
  });


  const buildIndex = (messages) => {
    const tomb = buildValidatedTombstoneSet(messages);
    const chunks = longText.indexChunks(messages);
    const posts = new Map();
    const commentsByRoot = new Map();
    const opinionsByRoot = new Map();

    for (const m of messages) {
      const v = m && m.value;
      const c = v && v.content;
      if (!c || typeof c !== 'object') continue;
      if (c.type === 'post' && typeof c.text === 'string') {
        if (isBlogPost(c)) {
          posts.set(m.key, { key: m.key, author: v.author, seq: v.sequence || 0, ts: v.timestamp || m.timestamp || 0, replaces: typeof c.replaces === 'string' ? c.replaces : null, c });
        } else if (isComment(c) && !tomb.has(m.key)) {
          commentsByRoot.set(c.root, (commentsByRoot.get(c.root) || 0) + 1);
        }
        continue;
      }
      if (tomb.has(m.key)) continue;

      if (c.type === OPINION_TYPE && typeof c.target === 'string') {
        const entry = opinionsByRoot.get(c.target) || { counts: {}, voters: [] };
        if (!entry.voters.includes(v.author)) {
          entry.voters.push(v.author);
          entry.counts[c.category] = (entry.counts[c.category] || 0) + 1;
        }
        opinionsByRoot.set(c.target, entry);
      }
    }

    const vg = versionGroups([...posts.values()]);
    const live = new Map();
    for (const root of vg.roots) {
      const tip = vg.tipOf(root);
      if (tomb.has(root) || tomb.has(tip)) continue;
      const tipNode = posts.get(tip);
      const rootNode = posts.get(root);
      if (!tipNode || !rootNode) continue;
      live.set(root, { ...tipNode, key: root, tipId: tip, ts: rootNode.ts, updatedTs: tipNode.ts });
    }
    const opinionsByLive = new Map();
    for (const [target, entry] of opinionsByRoot) {
      const root = vg.rootOf(target);
      const agg = opinionsByLive.get(root) || { counts: {}, voters: [] };
      for (const voter of entry.voters) {
        if (agg.voters.includes(voter)) continue;
        agg.voters.push(voter);
      }
      for (const [cat, n] of Object.entries(entry.counts)) agg.counts[cat] = (agg.counts[cat] || 0) + n;
      opinionsByLive.set(root, agg);
    }

    return { tomb, posts: live, allPosts: posts, commentsByRoot, opinionsByRoot: opinionsByLive, chunks, rootOf: vg.rootOf, tipOf: vg.tipOf };
  };

  const buildBlog = (node, idx) => {
    const c = node.c || {};
    const op = idx.opinionsByRoot.get(node.key) || { counts: {}, voters: [] };
    return {
      id: node.key,
      key: node.key,
      tipId: node.tipId,
      updatedAt: new Date(node.updatedTs || node.ts).toISOString(),
      author: node.author,
      subject: typeof c.contentWarning === 'string' ? c.contentWarning : '',
      text: longText.joinText(c.text || '', c.chunks, longText.lookupIn(idx.chunks), node.author),
      mentions: Array.isArray(c.mentions) ? c.mentions : [],
      allowComments: c.allowComments !== false,
      tags: Array.isArray(c.tags) ? c.tags.map(t => String(t || '').trim().replace(/^#+/, '')).filter(Boolean) : [],
      createdAt: new Date(node.ts).toISOString(),
      commentCount: idx.commentsByRoot.get(node.key) || 0,
      opinions: op.counts,
      opinions_inhabitants: op.voters
    };
  };

  const collect = async () => {
    const ssbClient = await openSsb();
    const messages = await getAllMessages(ssbClient);
    const idx = memoIndex('blog', messages, buildIndex);
    const list = [];
    for (const node of idx.posts.values()) list.push(buildBlog(node, idx));
    return { list, idx, viewerId: ssbClient.id };
  };

  const opinionScore = (blog) =>
    Object.values(blog.opinions || {}).reduce((n, v) => n + (Number(v) || 0), 0);

  return {
    type: 'post',

    async listByAuthor(feedId) {
      const ssbClient = await openSsb();
      const idx = buildIndex(await getAuthorMessages(ssbClient, feedId));
      const list = [];
      for (const node of idx.posts.values()) if (String(node.author) === String(feedId)) list.push(buildBlog(node, idx));
      return list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    },

    async listAll(filter = 'ALL', opts = {}) {
      const { list, viewerId } = await collect();
      const f = String(filter || 'ALL').toUpperCase();
      const favorites = Array.isArray(opts.favorites) ? new Set(opts.favorites.map(String)) : null;
      let out = list.concat(await scheduledMine());

      if (f === 'MINE') out = out.filter(b => String(b.author) === String(viewerId));
      else if (f === 'FAVORITES') out = favorites ? out.filter(b => favorites.has(String(b.id))) : [];
      else if (f === 'RECENT') out = out.filter(b => (Date.parse(b.createdAt || '') || 0) >= Date.now() - 86400000);

      const q = String(opts.q || '').trim().toLowerCase();
      if (q) out = out.filter(b =>
        b.text.toLowerCase().includes(q) || b.subject.toLowerCase().includes(q) ||
        b.tags.some(t => t.toLowerCase().includes(q.replace(/^#/, ''))));

      if (f === 'TOP') {
        out.sort((a, b) => (opinionScore(b) + b.commentCount) - (opinionScore(a) + a.commentCount) ||
          new Date(b.createdAt) - new Date(a.createdAt));
      } else {
        out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      return out;
    },

    async getBlogById(id) {
      if (isScheduledId(id)) {
        const entry = await scheduler.get(id);
        if (!entry || entry.kind !== SCHEDULED_KIND) throw new Error('Blog not found');
        return scheduledToBlog(entry);
      }
      const { list, idx } = await collect();
      const root = idx.rootOf(id);
      const blog = list.find(b => b.id === root || b.id === id || b.tipId === id);
      if (!blog) throw new Error('Blog not found');
      return blog;
    },

    async updateBlog(id, { text, subject, mentions, allowComments, tags } = {}) {
      if (isPublic) throw new Error('Not available in public mode');
      const ssbClient = await openSsb();
      const { idx } = await collect();
      const root = idx.rootOf(id);
      const node = idx.posts.get(root);
      if (!node) throw new Error('Blog not found');
      if (node.author !== ssbClient.id) throw new Error('Not the author');
      const body = text !== undefined ? String(text || '').trim() : longText.joinText(node.c.text || '', node.c.chunks, longText.lookupIn(idx.chunks), node.author);
      if (!body) throw new Error('Blog text is required');
      const publish = (c) => new Promise((res, rej) => ssbClient.publish(c, (err, msg) => err ? rej(err) : res(msg)));
      const previous = { ...node.c };
      delete previous.chunks;
      delete previous.contentWarning;
      delete previous.tags;
      delete previous.mentions;
      const nextSubject = subject !== undefined ? String(subject || '').trim() : (typeof node.c.contentWarning === 'string' ? node.c.contentWarning : '');
      const nextTags = tags !== undefined ? tags : node.c.tags;
      const nextMentions = mentions !== undefined ? mentions : node.c.mentions;
      const content = await longText.chunkContent({
        ...previous,
        type: 'post',
        text: body,
        replaces: node.tipId,
        allowComments: allowComments !== undefined ? allowComments !== false : node.c.allowComments !== false,
        ...(Array.isArray(nextTags) && nextTags.length ? { tags: Array.from(new Set(nextTags.map(t => String(t || '').trim().replace(/^#+/, '')).filter(Boolean))) } : {}),
        ...(Array.isArray(nextMentions) && nextMentions.length ? { mentions: nextMentions } : {}),
        ...(nextSubject ? { contentWarning: nextSubject } : {})
      }, 'text', { publish });
      const msg = await publish(content);
      return { key: msg.key, rootId: root };
    },

    isScheduledId,

    async scheduleBlog({ text, subject = '', mentions = [], allowComments = true, tags = [], clearnet = false, publishAt } = {}) {
      if (isPublic) throw new Error('Not available in public mode');
      if (!scheduler) throw new Error('Scheduling is not available');
      const body = String(text || '').trim();
      if (!body) throw new Error('Blog text is required');
      const data = { text: body, subject: String(subject || '').trim(), mentions: Array.isArray(mentions) ? mentions : [], allowComments: allowComments !== false, tags: Array.isArray(tags) ? tags : [], clearnet: clearnet === true };
      return scheduledToBlog(await scheduler.schedule(SCHEDULED_KIND, data, publishAt));
    },

    async updateScheduled(id, { text, subject = '', mentions = [], allowComments = true, tags = [], clearnet = false, publishAt } = {}) {
      if (isPublic || !scheduler) throw new Error('Not available in public mode');
      const body = String(text || '').trim();
      if (!body) throw new Error('Blog text is required');
      const data = { text: body, subject: String(subject || '').trim(), mentions: Array.isArray(mentions) ? mentions : [], allowComments: allowComments !== false, tags: Array.isArray(tags) ? tags : [], clearnet: clearnet === true };
      return scheduledToBlog(await scheduler.update(id, data, publishAt));
    },

    async cancelScheduled(id) {
      if (isPublic || !scheduler) throw new Error('Not available in public mode');
      return scheduler.cancel(id);
    },

    async publishDue(now = Date.now()) {
      if (isPublic || !scheduler) return [];
      const published = [];
      for (const entry of await scheduler.due(SCHEDULED_KIND, now)) {
        try {
          const msg = await this.createBlog(entry.data);
          await scheduler.remove(entry.id);
          published.push({ msg, entry: { ...entry.data, publishAt: entry.publishAt } });
        } catch (e) {
          await scheduler.fail(entry.id, e && e.message ? e.message : e);
          console.error('[scheduler] blog', entry.id, 'could not be published:', e && e.message ? e.message : e);
        }
      }
      return published;
    },

    async createBlog({ text, subject = '', mentions = [], allowComments = true, tags = [] } = {}) {
      if (isPublic) throw new Error('Not available in public mode');
      const body = String(text || '').trim();
      if (!body) throw new Error('Blog text is required');
      const ssbClient = await openSsb();
      const publish = (c) => new Promise((res, rej) => ssbClient.publish(c, (err, msg) => err ? rej(err) : res(msg)));
      const content = await longText.chunkContent({
        type: 'post',
        text: body,
        allowComments: allowComments !== false,
        ...(Array.isArray(tags) && tags.length ? { tags: Array.from(new Set(tags.map(t => String(t || '').trim().replace(/^#+/, '')).filter(Boolean))) } : {}),
        ...(Array.isArray(mentions) && mentions.length ? { mentions } : {}),
        ...(String(subject || '').trim() ? { contentWarning: String(subject).trim() } : {})
      }, 'text', { publish });
      return publish(content);
    },

    async deleteBlogById(id) {
      if (isPublic) throw new Error('Not available in public mode');
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const { idx } = await collect();
      const node = idx.posts.get(idx.rootOf(id));
      const target = node ? node.tipId : id;
      const msg = await new Promise((res, rej) => ssbClient.get(target, (err, m) => (err || !m || !m.content) ? rej(new Error('Blog not found')) : res(m)));
      if (!isBlogPost(msg.content)) throw new Error('Blog not found');
      if (msg.author !== userId) throw new Error('Not the author');
      const content = { type: 'tombstone', target, deletedAt: new Date().toISOString(), author: userId };
      return new Promise((res, rej) => ssbClient.publish(content, (err, result) => err ? rej(err) : res(result)));
    },

    async createOpinion(id, category) {
      const categories = require('../backend/opinion_categories');
      if (!categories.includes(category)) throw new Error('Invalid opinion category');
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const blog = await this.getBlogById(id);
      if (blog.opinions_inhabitants.includes(userId)) throw new Error('Already opined');
      const content = { type: OPINION_TYPE, target: blog.id, category, createdAt: new Date().toISOString() };
      return new Promise((res, rej) => ssbClient.publish(content, (err, result) => err ? rej(err) : res(result)));
    }
  };
};
