const pull = require('../server/node_modules/pull-stream');
const { readTyped, CONTENT_TYPES, requestScope, authorActivity } = require('./typed_log');
const { isContentVisibleTo } = require('./content_visibility');
const models = require("../models/main_models");
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

function toImageUrl(imgId, size=256){
  if (!imgId) return '/assets/images/default-avatar.png';
  if (typeof imgId === 'string' && imgId.startsWith('/image/')) return imgId.replace('/image/256/','/image/'+size+'/').replace('/image/512/','/image/'+size+'/');
  return `/image/${size}/${encodeURIComponent(imgId)}`;
}

const MIN_SUGGESTION_AFFINITY = 0.1;
const MAX_SUGGESTED = 12;

module.exports = ({ cooler, tribesModel = null, dataModel = null }) => {
  const { about, friend } = models({ cooler, isPublic: require('../server/ssb_config').public });
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const bytesPerAuthor = (ssbClient) => readTyped(ssbClient, CONTENT_TYPES, { limit: logLimit, withWindow: true }).then((msgs) => {
    const acc = {};
    for (const m of msgs) {
      const author = m && m.value && m.value.author;
      if (!author) continue;
      try { acc[author] = (acc[author] || 0) + Buffer.byteLength(JSON.stringify(m.value), 'utf8'); } catch (_) {}
    }
    return acc;
  }).catch(() => ({}));

  async function latestKarmaByAuthor() {
    const ssbClient = await openSsb();
    return new Promise(resolve => {
      const out = new Map();
      const src = ssbClient.messagesByType
        ? ssbClient.messagesByType({ type: "karmaScore", reverse: true })
        : ssbClient.createLogStream && ssbClient.createLogStream({ reverse: true });
      if (!src) return resolve(out);
      pull(
        src,
        pull.drain(msg => {
          const v = msg.value || msg;
          const c = v.content || {};
          if (c.type !== "karmaScore" || typeof c.karmaScore === "undefined" || out.has(v.author)) return;
          out.set(v.author, c.karmaScore || 0);
        }, () => resolve(out))
      );
    });
  }

  async function getLastActivityTimestamp(feedId) {
    const ssbClient = await openSsb();
    const activity = await authorActivity(ssbClient);
    if (activity) return activity.get(feedId) || null;
    const norm = (t) => (t && t < 1e12 ? t * 1000 : t || 0);
    return new Promise((resolve) => {
      pull(
        ssbClient.createUserStream({ id: feedId, reverse: true }),
        pull.filter(m => m && m.value && m.value.content && m.value.content.type !== 'tombstone'),
        pull.take(1),
        pull.collect((err, arr) => {
          if (err || !arr || !arr.length) return resolve(null);
          const m = arr[0];
          const ts = norm((m.value && m.value.timestamp) || m.timestamp);
          resolve(ts || null);
        })
      );
    });
  }

  function bucketLastActivity(ts) {
    if (!ts) return { bucket: 'red', range: '≥6m' };
    const now = Date.now();
    const delta = Math.max(0, now - ts);
    const days = delta / 86400000;
    if (days < 14) return { bucket: 'green', range: '<2w' };
    if (days < 182.5) return { bucket: 'orange', range: '2w–6m' };
    return { bucket: 'red', range: '≥6m' };
  }

  const timeoutPromise = (timeout) => new Promise((_, reject) => setTimeout(() => reject('Timeout'), timeout));
  const fetchUserImageUrl = async (feedId, size=256) => {
    try{
      const img = await Promise.race([about.image(feedId), timeoutPromise(5000)]);
      const id = typeof img === 'string' ? img : (img && (img.link || img.url));
      return toImageUrl(id, size);
    }catch{
      return '/assets/images/default-avatar.png';
    }
  };

  const publicMode = require('../server/ssb_config').public;
  const imageUrlFrom = (raw, size = 256) => {
    const img = raw == null || raw.link == null ? `&${"0".repeat(43)}=.sha256` : (typeof raw.link === 'string' ? raw.link : raw);
    const id = typeof img === 'string' ? img : (img && (img.link || img.url));
    return toImageUrl(id, size);
  };

  async function listAllBase(ssbClient, onlyIds = null) {
    const store = requestScope.getStore();
    const memoKey = onlyIds ? null : 'inhabitantsBase';
    if (memoKey && store && store[memoKey]) return store[memoKey];
    const pending = buildBase(ssbClient, onlyIds);
    if (memoKey && store) store[memoKey] = pending;
    return pending;
  }

  async function buildBase(ssbClient, onlyIds) {
    const only = onlyIds ? new Set(onlyIds) : null;
    const authorsMsgs = (await readTyped(ssbClient, CONTENT_TYPES, { limit: logLimit, withWindow: true })).filter(msg => !!msg.value?.author && msg.value?.content?.type !== 'tombstone').reverse();
    const uniqueFeedIds = Array.from(new Set(authorsMsgs.map(r => r.value.author).filter(Boolean))).filter(id => !only || only.has(id));
    const profiles = publicMode ? null : await about.profiles().catch(() => null);
    const users = await Promise.all(
      uniqueFeedIds.map(async (feedId) => {
        const p = profiles ? (profiles.get(feedId) || {}) : null;
        const rawName = p ? (p.name || feedId.slice(1, 9)) : await about.name(feedId);
        const name = rawName || feedId.slice(0, 10);
        const description = p ? (p.description || "") : await about.description(feedId);
        const photo = p ? imageUrlFrom(p.image, 256) : await fetchUserImageUrl(feedId, 256);
        const lastActivityTs = await getLastActivityTimestamp(feedId);
        const { bucket, range } = bucketLastActivity(lastActivityTs);
        return { id: feedId, name, description, photo, lastActivityTs, lastActivityBucket: bucket, lastActivityRange: range };
      })
    );
    return Array.from(new Map(users.filter(u => u && u.id).map(u => [u.id, u])).values());
  }

  function normalizeRel(rel) {
    const r = rel || {};
    const iFollow = !!(r.following || r.iFollow || r.youFollow || r.i_follow || r.isFollowing);
    const followsMe = !!(r.followsMe || r.followingMe || r.follows_me || r.theyFollow || r.isFollowedBy);
    const blocking = !!(r.blocking || r.iBlock || r.isBlocking);
    const blockedBy = !!(r.blocked || r.blocksMe || r.isBlockedBy);
    return { iFollow, followsMe, blocking, blockedBy };
  }

  return {
    async countInhabitants() {
      const ssbClient = await openSsb();
      const msgs = await readTyped(ssbClient, CONTENT_TYPES, { limit: logLimit, withWindow: true });
      return new Set(msgs.filter(msg => !!msg.value?.author && msg.value?.content?.type !== 'tombstone').map(msg => msg.value.author)).size;
    },

    async listInhabitants(options = {}) {
      const { filter = 'all', search = '', location = '', language = '', skills = '', includeInactive = false, ids = null } = options;
      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      const filterInactive = (users) => {
        if (includeInactive) return users;
        return users.filter(u => u.lastActivityBucket !== 'red');
      };

      if (filter === 'GALLERY') {
        const users = await listAllBase(ssbClient);
        return filterInactive(users);
      }

      if (filter === 'all' || filter === 'TOP KARMA' || filter === 'TOP ACTIVITY' || filter === 'TOP INACTIVITY' || filter === 'TOP ECO') {
        let users = (await listAllBase(ssbClient, ids)).slice();
        if (filter !== 'TOP ACTIVITY' && filter !== 'TOP INACTIVITY') {
          users = filterInactive(users);
        }
        if (search) {
          const q = search.toLowerCase();
          users = users.filter(u =>
            (u.name || '').toLowerCase().includes(q) ||
            (u.description || '').toLowerCase().includes(q) ||
            (u.id || '').toLowerCase().includes(q)
          );
        }
        const store = requestScope.getStore();
        if (store && !store.inhabitantBytes) store.inhabitantBytes = bytesPerAuthor(ssbClient);
        const bytesByAuthor = await (store ? store.inhabitantBytes : bytesPerAuthor(ssbClient));
        const karmaOf = await latestKarmaByAuthor();
        const withMetrics = await Promise.all(users.map(async u => {
          const karmaScore = karmaOf.get(u.id) || 0;
          const bytes = (bytesByAuthor && bytesByAuthor[u.id]) || 0;
          const carbonGrams = (bytes / (1024 * 1024)) * 0.095;
          if (filter === 'TOP ECO') {
            const ecoScore = karmaScore / Math.max(0.01, carbonGrams);
            return { ...u, karmaScore, carbonGrams, ecoScore };
          }
          return { ...u, karmaScore, carbonGrams };
        }));
        if (filter === 'TOP KARMA') return withMetrics.sort((a, b) => (b.karmaScore || 0) - (a.karmaScore || 0));
        if (filter === 'TOP ACTIVITY') return withMetrics.sort((a, b) => (b.lastActivityTs || 0) - (a.lastActivityTs || 0));
        if (filter === 'TOP INACTIVITY') return withMetrics.sort((a, b) => (a.lastActivityTs || 0) - (b.lastActivityTs || 0));
        if (filter === 'TOP ECO') return withMetrics.sort((a, b) => (b.ecoScore || 0) - (a.ecoScore || 0));
        return withMetrics;
      }

      if (filter === 'contacts') {
        const all = await this.listInhabitants({ filter: 'all' });
        const result = [];
        for (const user of all) {
          const rel = await friend.getRelationship(user.id).catch(() => ({}));
          if (rel && (rel.following || rel.iFollow)) result.push(user);
        }
        return Array.from(new Map(result.map(u => [u.id, u])).values());
      }

      if (filter === 'blocked') {
        const all = await this.listInhabitants({ filter: 'all', includeInactive: true });
        const result = [];
        for (const user of all) {
          const rel = await friend.getRelationship(user.id).catch(() => ({}));
          const n = normalizeRel(rel);
          if (n.blocking) result.push({ ...user, isBlocked: true });
        }
        return Array.from(new Map(result.map(u => [u.id, u])).values());
      }

      if (filter === 'SUGGESTED') {
        const base = await listAllBase(ssbClient);
        const active = filterInactive(base);
        const affinities = dataModel ? await dataModel.authorAffinities().catch(() => null) : null;
        const byAuthor = affinities ? affinities.byAuthor : new Map();
        const karmaOf = await latestKarmaByAuthor();
        const rels = await Promise.all(
          active.map(async u => {
            if (u.id === userId) return null;
            const rel = await friend.getRelationship(u.id).catch(() => ({}));
            const n = normalizeRel(rel);
            if (n.iFollow || n.blocking || n.blockedBy) return null;
            const aff = byAuthor.get(u.id) || { score: 0, common: [], reasons: [] };
            const tribeMate = aff.reasons.includes('tribe');
            if (aff.score < MIN_SUGGESTION_AFFINITY && !n.followsMe && !tribeMate) return null;
            const social = (n.followsMe ? 0.15 : 0) + (tribeMate ? 0.1 : 0);
            const activityBonus = u.lastActivityBucket === 'green' ? 0.05 : (u.lastActivityBucket === 'orange' ? 0.02 : 0);
            const suggestionScore = Math.min(1, aff.score + social + activityBonus);
            const karmaScore = karmaOf.get(u.id) || 0;
            return { user: u, rel: n, karmaScore, commonSkills: aff.common, reasons: aff.reasons, suggestionScore };
          })
        );
        const candidates = rels.filter(Boolean);
        const enriched = candidates.map(x => ({
          ...x.user,
          karmaScore: x.karmaScore,
          followsYou: x.rel.followsMe,
          commonSkills: x.commonSkills,
          reasons: x.reasons,
          mutualCount: x.rel.followsMe ? 1 : 0,
          suggestionScore: x.suggestionScore,
          affinity: x.suggestionScore
        }));
        const unique = Array.from(new Map(enriched.map(u => [u.id, u])).values());
        return unique.sort((a, b) =>
          (b.suggestionScore || 0) - (a.suggestionScore || 0) ||
          (b.karmaScore || 0) - (a.karmaScore || 0) ||
          (b.lastActivityTs || 0) - (a.lastActivityTs || 0)
        ).slice(0, MAX_SUGGESTED);
      }

      if (filter === 'CVs') {
        const records = (await readTyped(ssbClient, ['curriculum'], { limit: logLimit })).filter(msg => msg.value.content?.type === 'curriculum').reverse();

        let cvs = records.map(r => r.value.content);
        cvs = Array.from(new Map(cvs.map(u => [u.author, u])).values());

        if (filter === 'CVs') {
          const profiles = publicMode ? null : await about.profiles().catch(() => null);
          let out = await Promise.all(cvs.map(async c => {
            const photo = profiles ? imageUrlFrom((profiles.get(c.author) || {}).image, 256) : await fetchUserImageUrl(c.author, 256);
            const lastActivityTs = await getLastActivityTimestamp(c.author);
            const { bucket, range } = bucketLastActivity(lastActivityTs);
            const base = this._normalizeCurriculum(c, photo);
            return { ...base, lastActivityTs, lastActivityBucket: bucket, lastActivityRange: range };
          }));
          out = filterInactive(out);
          if (search) {
            const q = search.toLowerCase();
            out = out.filter(u =>
              (u.name || '').toLowerCase().includes(q) ||
              (u.description || '').toLowerCase().includes(q) ||
              u.skills.some(s => (s || '').toLowerCase().includes(q))
            );
          }
          if (location) out = out.filter(u => (u.location || '').toLowerCase() === location.toLowerCase());
          if (language) out = out.filter(u => u.languages.map(l => l.toLowerCase()).includes(language.toLowerCase()));
          if (skills) {
            const skillList = skills.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            out = out.filter(u => skillList.every(s => u.skills.map(k => (k || '').toLowerCase()).includes(s)));
          }
          return out;
        }

      }

      return [];
    },

    _normalizeCurriculum(c, photoUrl) {
      const photo = c.photo ? toImageUrl(c.photo, 256) : (photoUrl || toImageUrl(null, 256));
      return {
        id: c.author,
        name: c.name,
        description: c.description,
        photo,
        pdf: c.pdf || null,
        skills: [
          ...(c.personalSkills || []),
          ...(c.oasisSkills || []),
          ...(c.educationalSkills || []),
          ...(c.professionalSkills || [])
        ],
        location: c.location,
        languages: typeof c.languages === 'string'
          ? c.languages.split(',').map(x => x.trim())
          : Array.isArray(c.languages) ? c.languages : [],
        status: c.status,
        preferences: c.preferences,
        createdAt: c.createdAt
      };
    },

    async listSupporters(feedId) {
      const ssbClient = await openSsb();
      const graph = await new Promise((resolve) => ssbClient.friends.graph((err, g) => resolve(err ? {} : (g || {}))));
      return Object.entries(graph)
        .filter(([source, edges]) => source !== feedId && edges && (edges[feedId] === true || Number(edges[feedId]) > 0))
        .map(([source]) => source);
    },

    async getLatestAboutById(id) {
      const ssbClient = await openSsb();
      const records = await new Promise((res, rej) => {
        pull(
          ssbClient.createUserStream({ id }),
          pull.filter(msg =>
            msg.value.content?.type === 'about' &&
            msg.value.content?.type !== 'tombstone'
          ),
          pull.collect((err, msgs) => err ? rej(err) : res(msgs))
        );
      });
      if (!records.length) return null;
      const latest = records.sort((a, b) => b.value.timestamp - a.value.timestamp)[0];
      return latest.value.content;
    },

    async getFeedByUserId(id) {
      const ssbClient = await openSsb();
      const targetId = id || ssbClient.id;
      const records = await new Promise((res, rej) => {
        pull(
          ssbClient.createUserStream({ id: targetId }),
          pull.filter(msg =>
            msg.value &&
            msg.value.content &&
            typeof msg.value.content.text === 'string' &&
            msg.value.content?.type !== 'tombstone'
          ),
          pull.collect((err, msgs) => err ? rej(err) : res(msgs))
        );
      });
      return records
        .filter(m => typeof m.value.content.text === 'string')
        .sort((a, b) => b.value.timestamp - a.value.timestamp)
        .slice(0, 10);
    },

    async getInhabitantStats(targetId, viewerId) {
      const ssbClient = await openSsb();
      const target = targetId || ssbClient.id;
      const viewer = viewerId || ssbClient.id;
      const isOwner = viewer === target;
      const arr = (v) => Array.isArray(v) ? v : [];
      const up = (v) => String(v || '').toUpperCase();
      const COUNTED = new Set(['post','event','task','forum','market','job','housing','project','industry','shop','image','video','audio','document','bookmark','transfer','map']);
      const accessible = (type, c) => isOwner || isContentVisibleTo(type, c, viewer, target);
      const counts = {};
      await new Promise((resolve) => {
        pull(
          ssbClient.createUserStream({ id: target }),
          pull.drain((m) => {
            const c = m && m.value && m.value.content;
            if (!c || typeof c !== 'object') return;
            const type = c.type;
            if (!type || !COUNTED.has(type)) return;
            if (c.replaces) return;
            if (!accessible(type, c)) return;
            counts[type] = (counts[type] || 0) + 1;
          }, () => resolve())
        );
      });
      if (tribesModel) {
        try {
          const visible = await tribesModel.listTribesForViewer(viewer);
          const n = visible.filter(t => String(t.author) === String(target)).length;
          if (n > 0) counts.tribe = n;
        } catch (_) {}
      }
      return counts;
    },

    async getCVByUserId(id) {
      const ssbClient = await openSsb();
      const targetId = id || ssbClient.id;
      const records = await new Promise((res, rej) => {
        pull(
          ssbClient.createUserStream({ id: targetId }),
          pull.filter(msg =>
            msg.value.content?.type === 'curriculum' &&
            msg.value.content?.type !== 'tombstone'
          ),
          pull.collect((err, msgs) => err ? rej(err) : res(msgs))
        );
      });
      return records.length ? records[records.length - 1].value.content : null;
    },

    async getCandidatesForJob(job, viewerId = null) {
      if (!job || typeof job !== 'object') return [];
      const ssbClient = await openSsb();
      const tokenize = (s) => String(s || '')
        .toLowerCase()
        .split(/[^a-z0-9áéíóúñü+#./-]+/i)
        .map(t => t.trim())
        .filter(t => t && t.length >= 2);
      const stop = new Set(['the','a','an','and','or','of','to','in','for','on','with','is','are','be','as','at','by','from','that','this','it','we','you','our','your','un','una','el','la','los','las','de','del','en','con','para','por','y','o','un','una','que','se','su','sus','al','etc']);
      const keywords = new Set();
      const addAll = (arr) => arr.forEach(t => { if (!stop.has(t)) keywords.add(t); });
      if (Array.isArray(job.tags)) job.tags.forEach(t => { const k = String(t || '').toLowerCase().trim(); if (k) keywords.add(k); });
      addAll(tokenize(job.title));
      addAll(tokenize(job.description));
      addAll(tokenize(job.requirements));
      if (keywords.size === 0) return [];

      const records = (await readTyped(ssbClient, ['curriculum'], { limit: logLimit })).filter(msg => msg.value?.content?.type === 'curriculum').reverse();
      let cvs = records.map(r => r.value.content);
      cvs = Array.from(new Map(cvs.map(u => [u.author, u])).values());
      cvs = cvs.filter(c => String(c.visibility || 'PUBLIC').toUpperCase() !== 'HIDDEN');

      const jobAuthor = job.author || null;
      const out = await Promise.all(cvs.map(async c => {
        if (!c.author) return null;
        if (jobAuthor && c.author === jobAuthor) return null;
        const cvSkills = [
          ...(c.personalSkills || []),
          ...(c.oasisSkills || []),
          ...(c.educationalSkills || []),
          ...(c.professionalSkills || [])
        ].map(s => String(s || '').toLowerCase()).filter(Boolean);
        const common = Array.from(new Set(cvSkills.filter(s => keywords.has(s))));
        if (common.length === 0) return null;
        if (viewerId && c.author !== viewerId) {
          try {
            const rel = await friend.getRelationship(c.author);
            if (rel && (rel.blocking || rel.blockedBy)) return null;
          } catch (_) {}
        }
        const authorTs = await getLastActivityTimestamp(c.author);
        let interactionTs = null;
        try {
          const cvId = c.id || c.key || null;
          if (cvId) {
            const ssbClient = await openSsb();
            interactionTs = await new Promise((resolve) => {
              try {
                pull(
                  ssbClient.backlinks.read({ query: [{ $filter: { dest: cvId } }], index: 'DTA', reverse: true, limit: 1 }),
                  pull.collect((err, arr) => {
                    if (err || !arr || !arr.length) return resolve(null);
                    const m = arr[0];
                    const raw = (m.value && m.value.timestamp) || m.timestamp;
                    resolve(raw && raw < 1e12 ? raw * 1000 : raw || null);
                  })
                );
              } catch (_) { resolve(null); }
            });
          }
        } catch (_) {}
        const lastActivityTs = Math.max(authorTs || 0, interactionTs || 0) || null;
        const { bucket, range } = bucketLastActivity(lastActivityTs);
        if (bucket === 'red') return null;
        const photo = await fetchUserImageUrl(c.author, 256);
        const matchScore = common.length / keywords.size;
        return {
          id: c.author,
          name: c.name || 'Anonymous',
          description: c.description || '',
          photo,
          location: c.location || '',
          status: c.status || '',
          preferences: c.preferences || '',
          languages: typeof c.languages === 'string'
            ? c.languages.split(',').map(x => x.trim()).filter(Boolean)
            : Array.isArray(c.languages) ? c.languages : [],
          commonSkills: common,
          matchScore,
          lastActivityTs,
          lastActivityBucket: bucket,
          lastActivityRange: range
        };
      }));
      return out.filter(Boolean).sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return (b.lastActivityTs || 0) - (a.lastActivityTs || 0);
      }).slice(0, 20);
    },

    async getPhotoUrlByUserId(id, size = 256) {
      return await fetchUserImageUrl(id, size);
    },

    async getLastActivityTimestampByUserId(id) {
      return await getLastActivityTimestamp(id);
    },

    bucketLastActivity(ts) {
      return bucketLastActivity(ts);
    }
  };
};

