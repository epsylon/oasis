const { readTyped } = require('./typed_log');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { getConfig } = require('../configs/config-manager.js');
const categories = require('../backend/opinion_categories');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const CHANNEL_TYPE = 'podcast';
const EPISODE_TYPE = 'podcastEpisode';
const OPINION_TYPE = 'podcastOpinion';
const PLAY_TYPE = 'podcastPlay';
const TYPES = [CHANNEL_TYPE, EPISODE_TYPE, OPINION_TYPE, PLAY_TYPE, 'tombstone'];
const CATEGORIES = ['NEWS', 'MUSIC', 'TALK', 'EDUCATION', 'TECH', 'CULTURE', 'COMMUNITY', 'OASIS', 'OTHER'];
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;
const MEDIA_RE = /!?\[(image|audio|video):([^\]]*)\]\((&[^)]+)\)/;

const safeText = (v) => String(v == null ? '' : v).trim();
const normU = (v) => String(v || '').trim().toUpperCase();
const normalizeCategory = (v) => (CATEGORIES.includes(normU(v)) ? normU(v) : 'OTHER');
const normalizeTags = (raw) => {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(',');
  return Array.from(new Set(arr.map(t => String(t || '').trim()).filter(Boolean)));
};
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };

const parseMedia = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object' && raw.blobId) return { kind: String(raw.kind || 'audio'), name: safeText(raw.name), blobId: String(raw.blobId) };
  const m = String(raw).match(MEDIA_RE);
  if (!m) return null;
  return { kind: m[1], name: safeText(m[2]) || 'file', blobId: m[3] };
};

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };
  const publish = (ssbClient, content) => new Promise((resolve, reject) => ssbClient.publish(content, (err, res) => err ? reject(err) : resolve(res)));

  const buildIndex = (messages) => {
    const tomb = buildValidatedTombstoneSet(messages);
    const nodes = new Map();
    const parentOf = new Map();
    const opinions = [];
    const plays = [];
    for (const m of messages) {
      const v = m.value || {};
      const c = v.content;
      if (!c || typeof c !== 'object') continue;
      if (c.type === CHANNEL_TYPE || c.type === EPISODE_TYPE) {
        nodes.set(m.key, { key: m.key, type: c.type, author: v.author, ts: v.timestamp || m.timestamp || 0, c });
        if (typeof c.replaces === 'string') parentOf.set(m.key, c.replaces);
      } else if (c.type === OPINION_TYPE && typeof c.target === 'string') {
        opinions.push({ target: c.target, author: v.author, category: String(c.category || ''), ts: v.timestamp || 0 });
      } else if (c.type === PLAY_TYPE && typeof c.target === 'string') {
        plays.push({ target: c.target, author: v.author, ts: v.timestamp || 0 });
      }
    }
    const rootOf = (key) => {
      const seen = new Set();
      let cur = key;
      while (parentOf.has(cur) && !seen.has(cur)) { seen.add(cur); cur = parentOf.get(cur); }
      return cur;
    };
    const versionsByRoot = new Map();
    for (const node of nodes.values()) {
      const root = rootOf(node.key);
      if (tomb.has(root)) continue;
      if (!versionsByRoot.has(root)) versionsByRoot.set(root, []);
      versionsByRoot.get(root).push(node);
    }
    const tips = new Map();
    for (const [root, versions] of versionsByRoot) {
      versions.sort((a, b) => a.ts - b.ts);
      const first = versions[0];
      const own = versions.filter(v => v.author === first.author && v.type === first.type);
      tips.set(root, { root, first, tip: own[own.length - 1] });
    }
    const episodes = new Map();
    const opinionsByRoot = new Map();
    for (const op of opinions) {
      if (!nodes.has(op.target)) continue;
      const r = rootOf(op.target);
      if (!opinionsByRoot.has(r)) opinionsByRoot.set(r, []);
      opinionsByRoot.get(r).push(op);
    }
    const playsByRoot = new Map();
    for (const pl of plays) {
      if (!nodes.has(pl.target)) continue;
      const r = rootOf(pl.target);
      if (!playsByRoot.has(r)) playsByRoot.set(r, new Set());
      playsByRoot.get(r).add(pl.author);
    }
    for (const { root, first, tip } of tips.values()) {
      if (first.type !== EPISODE_TYPE) continue;
      const c = tip.c;
      const channelId = safeText(c.channel);
      if (!channelId) continue;
      const ops = {};
      const voters = [];
      for (const op of (opinionsByRoot.get(root) || [])) {
        if (voters.includes(op.author) || !categories.includes(op.category)) continue;
        voters.push(op.author);
        ops[op.category] = (ops[op.category] || 0) + 1;
      }
      const listeners = Array.from(playsByRoot.get(root) || []);
      episodes.set(root, {
        id: root, rootId: root, tipId: tip.key, channelId,
        number: num(c.number), title: safeText(c.title), description: safeText(c.description),
        media: parseMedia(c.media), tags: normalizeTags(c.tags),
        author: first.author, createdAt: first.c.createdAt || new Date(first.ts).toISOString(),
        updatedAt: c.updatedAt || new Date(tip.ts).toISOString(), ts: tip.ts, publishedTs: Date.parse(first.c.createdAt || '') || first.ts,
        opinions: ops, opinions_inhabitants: voters, opinionCount: voters.length,
        listeners, playCount: listeners.length
      });
    }
    const channels = new Map();
    for (const { root, first, tip } of tips.values()) {
      if (first.type !== CHANNEL_TYPE) continue;
      const c = tip.c;
      const eps = Array.from(episodes.values()).filter(e => e.channelId === root && e.author === first.author).sort((a, b) => a.publishedTs - b.publishedTs || a.number - b.number);
      eps.forEach((e, i) => { if (!e.number) e.number = i + 1; });
      const playCount = eps.reduce((s, e) => s + e.playCount, 0);
      const ops = {};
      const voters = [];
      for (const op of (opinionsByRoot.get(root) || [])) {
        if (voters.includes(op.author) || !categories.includes(op.category)) continue;
        voters.push(op.author);
        ops[op.category] = (ops[op.category] || 0) + 1;
      }
      const opinionCount = voters.length + eps.reduce((s, e) => s + e.opinionCount, 0);
      channels.set(root, {
        id: root, rootId: root, tipId: tip.key,
        title: safeText(c.title), description: safeText(c.description), category: normalizeCategory(c.category),
        cover: parseMedia(c.cover), tags: normalizeTags(c.tags),
        author: first.author, createdAt: first.c.createdAt || new Date(first.ts).toISOString(),
        updatedAt: c.updatedAt || new Date(tip.ts).toISOString(), ts: tip.ts,
        episodes: eps, episodeCount: eps.length, playCount, opinionCount,
        opinions: ops, opinions_inhabitants: voters,
        lastEpisodeTs: eps.length ? eps[eps.length - 1].publishedTs : 0,
        lastActivityTs: Math.max(tip.ts, ...eps.map(e => e.ts))
      });
    }
    return { channels, episodes, rootOf, nodes };
  };

  const load = async () => {
    const ssbClient = await openSsb();
    const idx = buildIndex(await readTyped(ssbClient, TYPES, { limit: logLimit }));
    return { ssbClient, idx };
  };

  const findChannel = (idx, id) => {
    const key = String(id || '');
    if (idx.channels.has(key)) return idx.channels.get(key);
    if (idx.nodes.has(key)) return idx.channels.get(idx.rootOf(key)) || null;
    return null;
  };
  const findEpisode = (idx, id) => {
    const key = String(id || '');
    if (idx.episodes.has(key)) return idx.episodes.get(key);
    if (idx.nodes.has(key)) return idx.episodes.get(idx.rootOf(key)) || null;
    return null;
  };

  return {
    CATEGORIES,
    parseMedia,

    async createChannel({ title, description, category, cover, tags }) {
      const ssbClient = await openSsb();
      const t = safeText(title);
      if (!t) throw new Error('Title is required');
      const now = new Date().toISOString();
      const media = parseMedia(cover);
      return publish(ssbClient, {
        type: CHANNEL_TYPE, title: t, description: safeText(description), category: normalizeCategory(category),
        ...(media ? { cover: media } : {}), tags: normalizeTags(tags), author: ssbClient.id, createdAt: now, updatedAt: now
      });
    },

    async updateChannel(id, data = {}) {
      const { ssbClient, idx } = await load();
      const ch = findChannel(idx, id);
      if (!ch) throw new Error('Podcast not found');
      if (ch.author !== ssbClient.id) throw new Error('Only the author can update this podcast');
      const media = data.cover !== undefined && data.cover ? parseMedia(data.cover) : ch.cover;
      const res = await publish(ssbClient, {
        type: CHANNEL_TYPE,
        title: safeText(data.title) || ch.title,
        description: data.description !== undefined ? safeText(data.description) : ch.description,
        category: data.category !== undefined ? normalizeCategory(data.category) : ch.category,
        ...(media ? { cover: media } : {}),
        tags: data.tags !== undefined ? normalizeTags(data.tags) : ch.tags,
        author: ssbClient.id, createdAt: ch.createdAt, updatedAt: new Date().toISOString(), replaces: ch.tipId
      });
      return { key: res.key, rootId: ch.id };
    },

    async deleteChannel(id) {
      const { ssbClient, idx } = await load();
      const ch = findChannel(idx, id);
      if (!ch) throw new Error('Podcast not found');
      if (ch.author !== ssbClient.id) throw new Error('Only the author can delete this podcast');
      await publish(ssbClient, { type: 'tombstone', target: ch.id, deletedAt: new Date().toISOString(), author: ssbClient.id });
      return { key: ch.id };
    },

    async addEpisode(channelId, { title, description, media, number, tags }) {
      const { ssbClient, idx } = await load();
      const ch = findChannel(idx, channelId);
      if (!ch) throw new Error('Podcast not found');
      if (ch.author !== ssbClient.id) throw new Error('Only the author can publish episodes');
      const m = parseMedia(media);
      if (!m || (m.kind !== 'audio' && m.kind !== 'video')) throw new Error('An audio or video file is required');
      const t = safeText(title);
      if (!t) throw new Error('Title is required');
      const now = new Date().toISOString();
      const res = await publish(ssbClient, {
        type: EPISODE_TYPE, channel: ch.id, number: num(number) || ch.episodeCount + 1,
        title: t, description: safeText(description), media: m, tags: normalizeTags(tags),
        author: ssbClient.id, createdAt: now, updatedAt: now
      });
      return { key: res.key, rootId: res.key, channelId: ch.id };
    },

    async updateEpisode(id, data = {}) {
      const { ssbClient, idx } = await load();
      const ep = findEpisode(idx, id);
      if (!ep) throw new Error('Episode not found');
      if (ep.author !== ssbClient.id) throw new Error('Only the author can update this episode');
      const m = data.media ? parseMedia(data.media) : ep.media;
      const res = await publish(ssbClient, {
        type: EPISODE_TYPE, channel: ep.channelId, number: data.number !== undefined && num(data.number) ? num(data.number) : ep.number,
        title: safeText(data.title) || ep.title, description: data.description !== undefined ? safeText(data.description) : ep.description,
        media: m, tags: data.tags !== undefined ? normalizeTags(data.tags) : ep.tags,
        author: ssbClient.id, createdAt: ep.createdAt, updatedAt: new Date().toISOString(), replaces: ep.tipId
      });
      return { key: res.key, rootId: ep.id, channelId: ep.channelId };
    },

    async deleteEpisode(id) {
      const { ssbClient, idx } = await load();
      const ep = findEpisode(idx, id);
      if (!ep) throw new Error('Episode not found');
      if (ep.author !== ssbClient.id) throw new Error('Only the author can delete this episode');
      await publish(ssbClient, { type: 'tombstone', target: ep.id, deletedAt: new Date().toISOString(), author: ssbClient.id });
      return { key: ep.id, channelId: ep.channelId };
    },

    async markPlayed(id) {
      const { ssbClient, idx } = await load();
      const ep = findEpisode(idx, id);
      if (!ep) throw new Error('Episode not found');
      if (ep.listeners.includes(ssbClient.id)) return null;
      return publish(ssbClient, { type: PLAY_TYPE, target: ep.id, createdAt: new Date().toISOString() });
    },

    async createOpinion(id, category) {
      if (!categories.includes(category)) throw new Error('Invalid voting category');
      const { ssbClient, idx } = await load();
      const target = findEpisode(idx, id) || findChannel(idx, id);
      if (!target) throw new Error('Episode not found');
      if (target.opinions_inhabitants.includes(ssbClient.id)) throw new Error('Already voted');
      return publish(ssbClient, { type: OPINION_TYPE, target: target.id, category, createdAt: new Date().toISOString() });
    },

    async getChannelById(id) {
      const { idx } = await load();
      return findChannel(idx, id);
    },

    async getAnyById(id) {
      const { idx } = await load();
      return findChannel(idx, id) || findEpisode(idx, id);
    },

    async getEpisodeById(id) {
      const { idx } = await load();
      const ep = findEpisode(idx, id);
      if (!ep) return null;
      return { ...ep, channel: idx.channels.get(ep.channelId) || null };
    },

    async listAll({ filter = 'all', q = '', category = '', viewerId = null } = {}) {
      const { ssbClient, idx } = await load();
      const me = viewerId || ssbClient.id;
      const f = String(filter || 'all').toLowerCase();
      const needle = String(q || '').trim().toLowerCase();
      const cat = normU(category);
      let out = Array.from(idx.channels.values());
      if (f === 'mine') out = out.filter(c => c.author === me);
      else if (f === 'recent') out = out.filter(c => c.lastActivityTs >= Date.now() - RECENT_MS);
      else if (f === 'viewers') out = out.filter(c => c.playCount > 0);
      else if (f === 'top') out = out.filter(c => c.opinionCount > 0 || (c.spreadCount || 0) > 0);
      else if (CATEGORIES.includes(f.toUpperCase())) out = out.filter(c => c.category === f.toUpperCase());
      if (cat && CATEGORIES.includes(cat)) out = out.filter(c => c.category === cat);
      if (needle) out = out.filter(c => [c.title, c.description, c.category, ...c.tags, ...c.episodes.map(e => e.title)].some(v => String(v || '').toLowerCase().includes(needle)));
      if (f === 'viewers') out.sort((a, b) => b.playCount - a.playCount || b.lastActivityTs - a.lastActivityTs);
      else if (f === 'top') out.sort((a, b) => b.opinionCount - a.opinionCount || b.playCount - a.playCount);
      else out.sort((a, b) => b.lastActivityTs - a.lastActivityTs);
      return out;
    },

    async listEpisodes({ filter = 'all', q = '' } = {}) {
      const { ssbClient, idx } = await load();
      const me = ssbClient.id;
      const f = String(filter || 'all').toLowerCase();
      const needle = String(q || '').trim().toLowerCase();
      let out = Array.from(idx.episodes.values()).filter(e => idx.channels.has(e.channelId)).map(e => ({ ...e, channel: idx.channels.get(e.channelId) }));
      if (f === 'mine') out = out.filter(e => e.author === me);
      else if (f === 'recent') out = out.filter(e => e.ts >= Date.now() - RECENT_MS);
      else if (f === 'viewers') out = out.filter(e => e.playCount > 0);
      else if (f === 'top') out = out.filter(e => e.opinionCount > 0);
      if (needle) out = out.filter(e => [e.title, e.description, ...e.tags, e.channel.title].some(v => String(v || '').toLowerCase().includes(needle)));
      if (f === 'viewers') out.sort((a, b) => b.playCount - a.playCount);
      else if (f === 'top') out.sort((a, b) => b.opinionCount - a.opinionCount);
      else out.sort((a, b) => b.publishedTs - a.publishedTs);
      return out;
    },

    async resolveRootId(id) {
      const { idx } = await load();
      const ch = findChannel(idx, id);
      if (ch) return ch.id;
      const ep = findEpisode(idx, id);
      return ep ? ep.id : String(id || '');
    }
  };
};
