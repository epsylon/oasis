const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { readTyped } = require('./typed_log');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const OPINION_TYPE = 'blogOpinion';

module.exports = ({ cooler, isPublic = false }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const BLOG_TYPES = ['post', OPINION_TYPE, 'tombstone'];

  const getAllMessages = async (ssbClient) => readTyped(ssbClient, BLOG_TYPES, { limit: logLimit });

  const isRootPost = (c) =>
    !!c && c.type === 'post' && typeof c.text === 'string' &&
    !c.root && !c.fork && !c.branch && !c.about && !c.target;

  const buildIndex = (messages) => {
    const tomb = buildValidatedTombstoneSet(messages);
    const posts = new Map();
    const commentsByRoot = new Map();
    const opinionsByRoot = new Map();

    for (const m of messages) {
      const v = m && m.value;
      const c = v && v.content;
      if (!c || typeof c !== 'object') continue;
      if (tomb.has(m.key)) continue;

      if (c.type === 'post' && typeof c.text === 'string') {
        if (isRootPost(c)) {
          posts.set(m.key, { key: m.key, author: v.author, ts: v.timestamp || m.timestamp || 0, c });
        } else if (typeof c.root === 'string') {
          commentsByRoot.set(c.root, (commentsByRoot.get(c.root) || 0) + 1);
        }
        continue;
      }

      if (c.type === OPINION_TYPE && typeof c.target === 'string') {
        const entry = opinionsByRoot.get(c.target) || { counts: {}, voters: [] };
        if (!entry.voters.includes(v.author)) {
          entry.voters.push(v.author);
          entry.counts[c.category] = (entry.counts[c.category] || 0) + 1;
        }
        opinionsByRoot.set(c.target, entry);
      }
    }

    return { tomb, posts, commentsByRoot, opinionsByRoot };
  };

  const buildBlog = (node, idx) => {
    const c = node.c || {};
    const op = idx.opinionsByRoot.get(node.key) || { counts: {}, voters: [] };
    return {
      id: node.key,
      key: node.key,
      author: node.author,
      subject: typeof c.contentWarning === 'string' ? c.contentWarning : '',
      text: c.text || '',
      mentions: Array.isArray(c.mentions) ? c.mentions : [],
      allowComments: c.allowComments !== false,
      createdAt: new Date(node.ts).toISOString(),
      commentCount: idx.commentsByRoot.get(node.key) || 0,
      opinions: op.counts,
      opinions_inhabitants: op.voters
    };
  };

  const collect = async () => {
    const ssbClient = await openSsb();
    const messages = await getAllMessages(ssbClient);
    const idx = buildIndex(messages);
    const list = [];
    for (const node of idx.posts.values()) list.push(buildBlog(node, idx));
    return { list, idx, viewerId: ssbClient.id };
  };

  const opinionScore = (blog) =>
    Object.values(blog.opinions || {}).reduce((n, v) => n + (Number(v) || 0), 0);

  return {
    type: 'post',

    async listAll(filter = 'ALL', opts = {}) {
      const { list, viewerId } = await collect();
      const f = String(filter || 'ALL').toUpperCase();
      const favorites = Array.isArray(opts.favorites) ? new Set(opts.favorites.map(String)) : null;
      let out = list.slice();

      if (f === 'MINE') out = out.filter(b => String(b.author) === String(viewerId));
      else if (f === 'FAVORITES') out = favorites ? out.filter(b => favorites.has(String(b.id))) : [];

      const q = String(opts.q || '').trim().toLowerCase();
      if (q) out = out.filter(b =>
        b.text.toLowerCase().includes(q) || b.subject.toLowerCase().includes(q));

      if (f === 'TOP') {
        out.sort((a, b) => (opinionScore(b) + b.commentCount) - (opinionScore(a) + a.commentCount) ||
          new Date(b.createdAt) - new Date(a.createdAt));
      } else {
        out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      return out;
    },

    async getBlogById(id) {
      const { list } = await collect();
      const blog = list.find(b => b.id === id);
      if (!blog) throw new Error('Blog not found');
      return blog;
    },

    async createBlog({ text, subject = '', mentions = [], allowComments = true } = {}) {
      if (isPublic) throw new Error('Not available in public mode');
      const body = String(text || '').trim();
      if (!body) throw new Error('Blog text is required');
      const ssbClient = await openSsb();
      const content = {
        type: 'post',
        text: body,
        allowComments: allowComments !== false,
        ...(Array.isArray(mentions) && mentions.length ? { mentions } : {}),
        ...(String(subject || '').trim() ? { contentWarning: String(subject).trim() } : {})
      };
      return new Promise((res, rej) => ssbClient.publish(content, (err, msg) => err ? rej(err) : res(msg)));
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
    },

    async resolveRootId(id) {
      const ssbClient = await openSsb();
      const msg = await new Promise((res) => ssbClient.get(id, (err, m) => res(err ? null : m)));
      const c = msg && (msg.content || (msg.value && msg.value.content));
      if (c && c.type === 'post' && typeof c.root === 'string') return c.root;
      return id;
    },

    async blogHrefFor(id) {
      const ssbClient = await openSsb();
      const msg = await new Promise((res) => ssbClient.get(id, (err, m) => res(err ? null : m)));
      const c = msg && (msg.content || (msg.value && msg.value.content));
      if (!c || c.type !== 'post' || typeof c.text !== 'string') return null;
      if (c.private === true || Array.isArray(c.recps)) return null;
      if (typeof c.root === 'string') {
        return `/blogs/${encodeURIComponent(c.root)}#${encodeURIComponent(id)}`;
      }
      if (c.fork || c.branch || c.about || c.target) return null;
      return `/blogs/${encodeURIComponent(id)}`;
    }
  };
};
