const pull = require('../server/node_modules/pull-stream');
const ssbClientGUI = require("../client/gui");
const coolerInstance = ssbClientGUI({ offline: require('../server/ssb_config').offline });
const models = require("../models/main_models");
const { about, friend } = models({
  cooler: coolerInstance,
  isPublic: require('../server/ssb_config').public,
});
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

function toImageUrl(imgId, size=256){
  if (!imgId) return '/assets/images/default-avatar.png';
  if (typeof imgId === 'string' && imgId.startsWith('/image/')) return imgId.replace('/image/256/','/image/'+size+'/').replace('/image/512/','/image/'+size+'/');
  return `/image/${size}/${encodeURIComponent(imgId)}`;
}

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  async function getLastKarmaScore(feedId) {
    const ssbClient = await openSsb();
    return new Promise(resolve => {
      const src = ssbClient.messagesByType
        ? ssbClient.messagesByType({ type: "karmaScore", reverse: true })
        : ssbClient.createLogStream && ssbClient.createLogStream({ reverse: true });
      if (!src) return resolve(0);
      pull(
        src,
        pull.filter(msg => {
          const v = msg.value || msg;
          const c = v.content || {};
          return v.author === feedId && c.type === "karmaScore" && typeof c.karmaScore !== "undefined";
        }),
        pull.take(1),
        pull.collect((err, arr) => {
          if (err || !arr || !arr.length) return resolve(0);
          const v = arr[0].value || arr[0];
          resolve(v.content.karmaScore || 0);
        })
      );
    });
  }

  async function getLastActivityTimestamp(feedId) {
    const ssbClient = await openSsb();
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

  async function listAllBase(ssbClient) {
    const authorsMsgs = await new Promise((res, rej) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit, reverse: true }),
        pull.filter(msg => !!msg.value?.author && msg.value?.content?.type !== 'tombstone'),
        pull.collect((err, msgs) => err ? rej(err) : res(msgs))
      );
    });
    const uniqueFeedIds = Array.from(new Set(authorsMsgs.map(r => r.value.author).filter(Boolean)));
    const users = await Promise.all(
      uniqueFeedIds.map(async (feedId) => {
        const rawName = await about.name(feedId);
        const name = rawName || feedId.slice(0, 10);
        const description = await about.description(feedId);
        const photo = await fetchUserImageUrl(feedId, 256);
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
    async listInhabitants(options = {}) {
      const { filter = 'all', search = '', location = '', language = '', skills = '', includeInactive = false } = options;
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

      if (filter === 'all' || filter === 'TOP KARMA' || filter === 'TOP ACTIVITY' || filter === 'TOP ECO') {
        let users = await listAllBase(ssbClient);
        if (filter !== 'TOP ACTIVITY') {
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
        const bytesByAuthor = await new Promise((res) => {
          pull(
            ssbClient.createLogStream({ limit: logLimit }),
            pull.collect((err, msgs) => {
              if (err || !Array.isArray(msgs)) return res({});
              const acc = {};
              for (const m of msgs) {
                const author = m && m.value && m.value.author;
                if (!author) continue;
                try { acc[author] = (acc[author] || 0) + Buffer.byteLength(JSON.stringify(m.value), 'utf8'); } catch (_) {}
              }
              res(acc);
            })
          );
        });
        const withMetrics = await Promise.all(users.map(async u => {
          const karmaScore = await getLastKarmaScore(u.id);
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
        const cvRecords = await new Promise((res) => {
          pull(
            ssbClient.createLogStream({ limit: logLimit, reverse: true }),
            pull.filter(msg => msg && msg.value && msg.value.content && msg.value.content.type === 'curriculum'),
            pull.collect((err, msgs) => err ? res([]) : res(msgs))
          );
        });
        const cvByAuthor = new Map();
        for (const r of cvRecords) {
          const c = r.value && r.value.content;
          if (c && c.author && !cvByAuthor.has(c.author)) cvByAuthor.set(c.author, c);
        }
        const extractSkills = (cv) => cv ? [
          ...(cv.personalSkills || []),
          ...(cv.oasisSkills || []),
          ...(cv.educationalSkills || []),
          ...(cv.professionalSkills || [])
        ].map(s => String(s || '').toLowerCase()).filter(Boolean) : [];
        const mecv = await this.getCVByUserId().catch(() => null);
        const mySkills = extractSkills(mecv);
        const rels = await Promise.all(
          active.map(async u => {
            if (u.id === userId) return null;
            const rel = await friend.getRelationship(u.id).catch(() => ({}));
            const n = normalizeRel(rel);
            if (n.iFollow || n.blocking || n.blockedBy) return null;
            const karmaScore = await getLastKarmaScore(u.id);
            const theirSkills = extractSkills(cvByAuthor.get(u.id));
            const commonSkills = mySkills.length && theirSkills.length
              ? Array.from(new Set(mySkills.filter(s => theirSkills.includes(s))))
              : [];
            const followsMeBonus = n.followsMe ? 20 : 0;
            const karmaBonus = Math.min(20, Math.log10(1 + Math.max(0, karmaScore)) * 5);
            const skillBonus = commonSkills.length * 4;
            const activityBonus = u.lastActivityBucket === 'green' ? 5 : (u.lastActivityBucket === 'orange' ? 2 : 0);
            const suggestionScore = followsMeBonus + karmaBonus + skillBonus + activityBonus;
            return { user: u, rel: n, karmaScore, commonSkills, suggestionScore };
          })
        );
        const candidates = rels.filter(Boolean).filter(x => x.suggestionScore > 0);
        const enriched = candidates.map(x => ({
          ...x.user,
          karmaScore: x.karmaScore,
          followsYou: x.rel.followsMe,
          commonSkills: x.commonSkills,
          mutualCount: x.rel.followsMe ? 1 : 0,
          suggestionScore: x.suggestionScore
        }));
        const unique = Array.from(new Map(enriched.map(u => [u.id, u])).values());
        return unique.sort((a, b) =>
          (b.suggestionScore || 0) - (a.suggestionScore || 0) ||
          (b.karmaScore || 0) - (a.karmaScore || 0) ||
          (b.lastActivityTs || 0) - (a.lastActivityTs || 0)
        );
      }

      if (filter === 'CVs' || filter === 'MATCHSKILLS') {
        const records = await new Promise((res, rej) => {
          pull(
            ssbClient.createLogStream({ limit: logLimit, reverse: true}),
            pull.filter(msg =>
              msg.value.content?.type === 'curriculum' &&
              msg.value.content?.type !== 'tombstone'
            ),
            pull.collect((err, msgs) => err ? rej(err) : res(msgs))
          );
        });

        let cvs = records.map(r => r.value.content);
        cvs = Array.from(new Map(cvs.map(u => [u.author, u])).values());

        if (filter === 'CVs') {
          let out = await Promise.all(cvs.map(async c => {
            const photo = await fetchUserImageUrl(c.author, 256);
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

        if (filter === 'MATCHSKILLS') {
          let base = await Promise.all(cvs.map(async c => {
            const photo = await fetchUserImageUrl(c.author, 256);
            const lastActivityTs = await getLastActivityTimestamp(c.author);
            const { bucket, range } = bucketLastActivity(lastActivityTs);
            const norm = this._normalizeCurriculum(c, photo);
            const karmaScore = await getLastKarmaScore(c.author).catch(() => 0);
            return { ...norm, lastActivityTs, lastActivityBucket: bucket, lastActivityRange: range, karmaScore };
          }));
          base = filterInactive(base);
          const mecv = await this.getCVByUserId();
          const userSkills = Array.from(new Set(
            (mecv
              ? [
                  ...(mecv.personalSkills || []),
                  ...(mecv.oasisSkills || []),
                  ...(mecv.educationalSkills || []),
                  ...(mecv.professionalSkills || [])
                ]
              : []).map(s => String(s || '').toLowerCase()).filter(Boolean)
          ));
          if (!userSkills.length) return [];
          const userSet = new Set(userSkills);
          const matches = base.map(c => {
            if (c.id === userId) return null;
            const theirSkillsRaw = (c.skills || []).map(s => String(s || '').toLowerCase()).filter(Boolean);
            const theirSet = new Set(theirSkillsRaw);
            const common = Array.from(theirSet).filter(s => userSet.has(s));
            if (!common.length) return null;
            const unionSize = userSet.size + theirSet.size - common.length;
            const matchScore = unionSize > 0 ? common.length / unionSize : 0;
            const matchCoverage = userSet.size > 0 ? common.length / userSet.size : 0;
            return { ...c, commonSkills: common, matchScore, matchCoverage };
          }).filter(Boolean);
          return matches.sort((a, b) =>
            (b.matchScore - a.matchScore) ||
            (b.commonSkills.length - a.commonSkills.length) ||
            ((b.karmaScore || 0) - (a.karmaScore || 0)) ||
            ((b.lastActivityTs || 0) - (a.lastActivityTs || 0))
          );
        }
      }

      return [];
    },

    _normalizeCurriculum(c, photoUrl) {
      const photo = photoUrl || toImageUrl(c.photo, 256);
      return {
        id: c.author,
        name: c.name,
        description: c.description,
        photo,
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
        createdAt: c.createdAt
      };
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
      const COUNTED = new Set(['post','event','task','forum','tribe','market','job','project','shop','image','video','audio','document','bookmark','transfer','map']);
      const accessible = (type, c) => {
        if (c.encryptedPayload) return false;
        switch (type) {
          case 'task':   return up(c.isPublic) !== 'PRIVATE' || isOwner || arr(c.assignees).includes(viewer);
          case 'event':  return String(c.isPublic || '').toLowerCase() !== 'private' || isOwner || arr(c.attendees).includes(viewer);
          case 'forum':  return c.isPrivate !== true || isOwner;
          case 'job':    return up(c.visibility) !== 'HIDDEN' || isOwner || arr(c.subscribers).includes(viewer);
          case 'market': return up(c.visibility) !== 'HIDDEN' || isOwner;
          case 'shop':   return up(c.visibility) !== 'CLOSED' || isOwner;
          case 'tribe':  { const st = up(c.status); return !(st === 'PRIVATE' || st === 'INVITE-ONLY') || isOwner || arr(c.members).includes(viewer); }
          default: return true;
        }
      };
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

      const records = await new Promise((res, rej) => {
        pull(
          ssbClient.createLogStream({ limit: logLimit, reverse: true }),
          pull.filter(msg =>
            msg.value?.content?.type === 'curriculum' &&
            msg.value?.content?.type !== 'tombstone'
          ),
          pull.collect((err, msgs) => err ? rej(err) : res(msgs))
        );
      });
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

